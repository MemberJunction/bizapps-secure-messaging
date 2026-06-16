import { Request, Response } from 'express';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { getSystemUser } from '@memberjunction/server';
import { SignatureEngine } from '@memberjunction/esignature/server';
import { PortalRequest } from './middleware.js';
import { getFileStore } from '../stores/ArtifactFileStore.js';

/**
 * E-signature handlers, backed by the core MJ eSignature subsystem
 * (@memberjunction/esignature). The engine owns provider drivers (DocuSign, PandaDoc,
 * Dropbox Sign), credential decryption (via MJ: Signature Accounts), the envelope
 * lifecycle, and webhooks — so this layer only translates between our thread-scoped
 * portal API and the engine.
 *
 * Thread linkage: a signature request is tied back to the originating portal session via
 * the engine's polymorphic EntityID/RecordID (EntityID = the 'MJ_BizApps_SecureMessaging: Portal Sessions' entity,
 * RecordID = the session ID — a real PK). We list a thread's requests by joining its
 * sessions, since the thread itself has no single owning row.
 */

/** Resolve the entity ID for our 'MJ_BizApps_SecureMessaging: Portal Sessions' entity (for the polymorphic link). */
function getPortalSessionsEntityId(): string {
    const entity = new Metadata().Entities.find(e => e.Name === 'MJ_BizApps_SecureMessaging: Portal Sessions');
    if (!entity) {
        throw new Error("'MJ_BizApps_SecureMessaging: Portal Sessions' entity is not registered");
    }
    return entity.ID;
}

/** All portal session IDs for a thread — the set a thread's signature requests link to. */
async function getSessionIdsForThread(threadId: string, contextUser: UserInfo): Promise<string[]> {
    const rv = new RunView();
    const result = await rv.RunView({
        EntityName: 'MJ_BizApps_SecureMessaging: Portal Sessions',
        ExtraFilter: `ThreadID = '${threadId.replace(/'/g, "''")}'`,
    }, contextUser);
    if (!result.Success) return [];
    return (result.Results as Record<string, unknown>[]).map(r => String(r.ID));
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
 * Lists signature requests for the thread (across all of its portal sessions).
 */
export async function getSignatureRequests(req: Request, res: Response): Promise<void> {
    const { threadId } = req.params;
    const session = (req as PortalRequest).portalSession;

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const sessionIds = await getSessionIdsForThread(threadId, systemUser);
        if (sessionIds.length === 0) {
            res.json({ signatureRequests: [] });
            return;
        }

        const entityId = getPortalSessionsEntityId();
        const idList = sessionIds.map(id => `'${id}'`).join(', ');
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'MJ: Signature Requests',
            ExtraFilter: `EntityID = '${entityId}' AND RecordID IN (${idList})`,
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
    const { threadId } = req.params;
    const session = (req as PortalRequest).portalSession;
    const { title, signatureAccountId, artifactId } = req.body;

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }
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
        const systemUser = await getSystemUser();

        // Resolve the document bytes from the artifact's latest version.
        let document: { bytes: Buffer; filename: string; contentType: string };
        try {
            document = await getFileStore().loadArtifactDocument(artifactId, systemUser);
        } catch (docErr) {
            const m = docErr instanceof Error ? docErr.message : String(docErr);
            res.status(400).json({ error: `Could not load the document to sign: ${m}` });
            return;
        }

        await SignatureEngine.Instance.Config(false, systemUser);
        const result = await SignatureEngine.Instance.SendForSignature({
            signatureAccountId,
            title: title.trim(),
            documents: [{ bytes: document.bytes, filename: document.filename, contentType: document.contentType }],
            recipients: [{ email: session.contactEmail }],
            artifactId,
            // Polymorphic link back to the originating portal session.
            entityId: getPortalSessionsEntityId(),
            recordId: session.sessionId,
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
    const threadId = String(req.params.threadId);
    const requestId = String(req.params.requestId);
    const session = (req as PortalRequest).portalSession;

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
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
    const threadId = String(req.params.threadId);
    const requestId = String(req.params.requestId);
    const session = (req as PortalRequest).portalSession;
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'Cancelled by sender';

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
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
    const threadId = String(req.params.threadId);
    const requestId = String(req.params.requestId);
    const session = (req as PortalRequest).portalSession;

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
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
