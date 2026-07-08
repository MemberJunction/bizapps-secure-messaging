import { Request, Response } from 'express';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { getSystemUser } from '@memberjunction/server';
import { SignatureEngine } from '@memberjunction/esignature/server';
import { PortalRequest, assertThreadAccess } from './middleware.js';
import { getFileStore } from '@mj-biz-apps/secure-messaging-core';

/**
 * E-signature handlers, backed by the core MJ eSignature subsystem
 * (@memberjunction/esignature). The engine owns provider drivers (DocuSign, PandaDoc,
 * Dropbox Sign), credential decryption (via MJ: Signature Accounts), the envelope
 * lifecycle, and webhooks — so this layer only translates between our thread-scoped
 * portal API and the engine.
 *
 * Thread linkage (v2): a signature request is tied to its SecureThread via the engine's
 * polymorphic EntityID/RecordID (EntityID = the 'MJ_BizApps_SecureMessaging: Secure Threads'
 * entity, RecordID = the thread ID — a real PK). The thread is now a first-class row, so a
 * thread's requests are listed by a direct RecordID match (no session-join needed).
 */

/** Resolve the entity ID for our Secure Threads entity (for the polymorphic signature link). */
function getSecureThreadsEntityId(): string {
    const entity = new Metadata().EntityByName('MJ_BizApps_SecureMessaging: Secure Threads');
    if (!entity) {
        throw new Error("'MJ_BizApps_SecureMessaging: Secure Threads' entity is not registered");
    }
    return entity.ID;
}

/** The name fields we read off a person to build a signer display name. */
interface ContactNameFields {
    DisplayName?: string | null;
    FirstName?: string | null;
    LastName?: string | null;
}

/**
 * Resolve a human display name for the contact behind a portal session, for use as the signer's
 * name (so the provider shows a real name in the signing ceremony + emails rather than the raw
 * email). Read via RunView (no cross-package entity dependency needed here); best-effort — returns
 * undefined if the person can't be loaded, in which case the provider falls back to the email.
 */
async function resolveContactName(contactId: string, contextUser: UserInfo): Promise<string | undefined> {
    if (!contactId) {
        return undefined;
    }
    try {
        const rv = new RunView();
        const result = await rv.RunView<ContactNameFields>(
            {
                EntityName: 'MJ_BizApps_Common: People',
                ExtraFilter: `ID = '${contactId.replace(/'/g, "''")}'`,
                Fields: ['DisplayName', 'FirstName', 'LastName'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            contextUser,
        );
        const p = result.Success ? result.Results[0] : undefined;
        if (!p) {
            return undefined;
        }
        const name = p.DisplayName || [p.FirstName, p.LastName].filter(Boolean).join(' ').trim();
        return name || undefined;
    } catch {
        return undefined;
    }
}

/** Map a normalized MJ envelope status onto the label the portal UI displays. */
function toDisplayStatus(status: string | null | undefined): string {
    switch (status) {
        case 'Completed':
        case 'Signed':
            return 'Signed';
        case 'Sent':
        case 'Delivered':
            return 'Sent';
        case 'Declined':
            return 'Declined';
        case 'Voided':
            return 'Cancelled';
        case 'Draft':
            return 'Draft';
        default:
            return 'Unknown';
    }
}

/**
 * GET /threads/:threadId/signature-requests
 *
 * Lists signature requests for the thread (linked directly by the thread's RecordID).
 */
export async function getSignatureRequests(req: Request, res: Response): Promise<void> {
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    const { systemUser, threadId } = access;

    try {
        const entityId = getSecureThreadsEntityId();
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'MJ: Signature Requests',
            ExtraFilter: `EntityID = '${entityId}' AND RecordID = '${threadId.replace(/'/g, "''")}'`,
            OrderBy: '__mj_CreatedAt DESC',
        }, systemUser);

        if (!result.Success) {
            res.status(500).json({ error: 'Failed to load signature requests' });
            return;
        }

        const signatureRequests = (result.Results as Record<string, unknown>[]).map(r => ({
            id: r.ID,
            title: r.Name,
            status: toDisplayStatus(r.Status as string),
            externalEnvelopeId: r.ExternalEnvelopeID,
            signatureAccountId: r.SignatureAccountID,
            sentAt: r.SentAt,
            completedAt: r.CompletedAt,
            createdAt: r.__mj_CreatedAt,
        }));

        res.json({ signatureRequests });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging get signature requests error: ${msg}`);
        res.status(500).json({ error: 'Failed to load signature requests' });
    }
}

/**
 * POST /threads/:threadId/signature-requests
 *
 * Creates AND sends a signature request in one step via the MJ eSignature engine. The
 * engine's SendForSignature is atomic (create + send), so there is no separate /send route.
 *
 * Body: { title: string, signatureAccountId: string, artifactId?: string }
 *   - signatureAccountId selects the MJ: Signature Account (provider + credentials) to send through.
 *   - artifactId names the document to sign; its latest version's bytes are sent.
 */
export async function createSignatureRequest(req: Request, res: Response): Promise<void> {
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    const { systemUser, threadId } = access;
    const session = (req as PortalRequest).portalSession;
    const { title, signatureAccountId, artifactId, signatureAnchor } = req.body;
    // Where to place the signature field: the text in the document to anchor it to. Defaults to a
    // "Signature:" line; if the document has no such marker the provider uses its own default.
    const anchor = typeof signatureAnchor === 'string' && signatureAnchor.trim() ? signatureAnchor.trim() : 'Signature:';

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
        res.status(400).json({ error: 'A title is required' });
        return;
    }
    if (!signatureAccountId || typeof signatureAccountId !== 'string') {
        res.status(400).json({ error: 'A signatureAccountId is required (the MJ: Signature Account to send through)' });
        return;
    }
    if (!artifactId || typeof artifactId !== 'string') {
        res.status(400).json({ error: 'An artifactId is required (the document to sign)' });
        return;
    }

    try {
        // Resolve the document bytes from the artifact's latest version.
        let document: { bytes: Buffer; filename: string; contentType: string };
        try {
            document = await getFileStore().loadArtifactDocument(artifactId, systemUser);
        } catch (docErr) {
            const m = docErr instanceof Error ? docErr.message : String(docErr);
            res.status(400).json({ error: `Could not load the document to sign: ${m}` });
            return;
        }

        const contactName = await resolveContactName(session.contactId, systemUser);

        await SignatureEngine.Instance.Config(false, systemUser);
        const result = await SignatureEngine.Instance.SendForSignature({
            signatureAccountId,
            title: title.trim(),
            documents: [{ bytes: document.bytes, filename: document.filename, contentType: document.contentType }],
            recipients: [
                {
                    email: session.contactEmail,
                    name: contactName,
                    // Anchor the signature field to the marker text; if the document lacks it, the
                    // provider applies its own default placement (anchorIgnoreIfNotPresent).
                    fields: [{ type: 'signature', anchor, anchorIgnoreIfNotPresent: true }],
                },
            ],
            artifactId,
            // Polymorphic link back to the SecureThread (v2: the thread is the owning row).
            entityId: getSecureThreadsEntityId(),
            recordId: threadId,
            sendImmediately: true,
            contextUser: systemUser,
        });

        if (!result.Success) {
            res.status(502).json({
                error: result.ErrorMessage || 'Signature provider could not send the envelope',
                signatureRequestId: result.signatureRequestId,
            });
            return;
        }

        res.status(201).json({
            signatureRequestId: result.signatureRequestId,
            externalEnvelopeId: result.externalEnvelopeId,
            status: toDisplayStatus(result.status),
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging create signature request error: ${msg}`);
        res.status(500).json({ error: 'Failed to create signature request' });
    }
}

/**
 * POST /threads/:threadId/signature-requests/:requestId/refresh-status
 *
 * Polls the provider for the envelope's current status and persists it.
 */
export async function refreshSignatureStatus(req: Request, res: Response): Promise<void> {
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    const { systemUser } = access;
    const requestId = String(req.params.requestId);

    try {
        await SignatureEngine.Instance.Config(false, systemUser);
        const result = await SignatureEngine.Instance.RefreshStatus(requestId, systemUser);
        if (!result.Success) {
            res.status(502).json({ error: result.ErrorMessage || 'Could not refresh envelope status' });
            return;
        }
        res.json({ signatureRequestId: requestId, status: toDisplayStatus(result.status) });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging refresh signature status error: ${msg}`);
        res.status(500).json({ error: 'Failed to refresh signature status' });
    }
}

/**
 * POST /threads/:threadId/signature-requests/:requestId/void
 *
 * Voids/cancels an in-flight envelope.
 *
 * Body: { reason?: string }
 */
export async function voidSignatureRequest(req: Request, res: Response): Promise<void> {
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    const { systemUser } = access;
    const requestId = String(req.params.requestId);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'Cancelled by sender';

    try {
        await SignatureEngine.Instance.Config(false, systemUser);
        const result = await SignatureEngine.Instance.Void(requestId, reason, systemUser);
        if (!result.Success) {
            res.status(502).json({ error: result.ErrorMessage || 'Could not void the envelope' });
            return;
        }
        res.json({ signatureRequestId: requestId, status: 'Cancelled' });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging void signature request error: ${msg}`);
        res.status(500).json({ error: 'Failed to void signature request' });
    }
}

/**
 * GET /threads/:threadId/signature-requests/:requestId/signed-document
 *
 * Downloads the executed/signed document for a completed envelope.
 */
export async function downloadSignedDocument(req: Request, res: Response): Promise<void> {
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    const { systemUser } = access;
    const requestId = String(req.params.requestId);

    try {
        await SignatureEngine.Instance.Config(false, systemUser);
        const result = await SignatureEngine.Instance.DownloadSigned(requestId, systemUser);
        if (!result.Success || !result.document) {
            res.status(502).json({ error: result.ErrorMessage || 'Could not download the signed document' });
            return;
        }
        res.setHeader('Content-Type', result.document.contentType || 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${result.document.filename}"`);
        res.send(result.document.bytes);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging download signed document error: ${msg}`);
        res.status(500).json({ error: 'Failed to download the signed document' });
    }
}
