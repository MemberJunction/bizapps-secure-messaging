import { Request, Response } from 'express';
import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { getSystemUser } from '@memberjunction/server';
import { SignatureEngine } from '@memberjunction/esignature/server';
import { PortalRequest, assertThreadAccess } from './middleware.js';

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

/**
 * Object-level authorization for the :requestId routes: verifies the MJ: Signature Requests
 * record exists AND is linked (via its polymorphic EntityID/RecordID) to the thread whose
 * access was already asserted. Without this, any authenticated contact could operate on an
 * arbitrary envelope by supplying its ID. Sends a 404 and returns false when the request is
 * not part of this thread.
 */
async function assertRequestBelongsToThread(
    requestId: string,
    threadId: string,
    systemUser: UserInfo,
    res: Response,
): Promise<boolean> {
    const entityId = getSecureThreadsEntityId();
    const rv = new RunView();
    const result = await rv.RunView<{ ID: string }>({
        EntityName: 'MJ: Signature Requests',
        ExtraFilter: `ID = '${requestId.replace(/'/g, "''")}' AND EntityID = '${entityId}' AND RecordID = '${threadId.replace(/'/g, "''")}'`,
        Fields: ['ID'],
        MaxRows: 1,
        ResultType: 'simple',
    }, systemUser);
    if (!result.Success || result.Results.length === 0) {
        res.status(404).json({ error: 'Signature request not found in this thread' });
        return false;
    }
    return true;
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
 * Staff-only — refused for every caller on this router. Every session the portal API serves
 * belongs to an **external contact** (PortalSessionContext carries no staff identity), and
 * sending an envelope here ran as the system user through whatever `signatureAccountId` the
 * client supplied — letting any authenticated contact send envelopes through ANY
 * MJ: Signature Account (staff-configured provider credentials) in the instance. There is no
 * app-, thread-, or organization-level designated account to resolve server-side instead, and
 * the contact is themself the signer, so there is no legitimate contact-initiated send.
 *
 * Staff send envelopes from MJ Explorer via the shipped 'Send Document for Signature' action
 * (see the Angular action panel), which runs as the authenticated MJ user under normal entity
 * permissions. Contacts keep the read/manage handlers below (list, refresh, void, download),
 * all of which are scoped to envelopes already linked to their own thread.
 */
export async function createSignatureRequest(req: Request, res: Response): Promise<void> {
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    res.status(403).json({
        error: 'Signature requests can only be created by staff (via the Send Document for Signature action), not from a portal session',
    });
}

/**
 * POST /threads/:threadId/signature-requests/:requestId/refresh-status
 *
 * Polls the provider for the envelope's current status and persists it.
 */
export async function refreshSignatureStatus(req: Request, res: Response): Promise<void> {
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    const { systemUser, threadId } = access;
    const requestId = String(req.params.requestId);

    try {
        if (!(await assertRequestBelongsToThread(requestId, threadId, systemUser, res))) return;
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
    const { systemUser, threadId } = access;
    const requestId = String(req.params.requestId);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'Cancelled by sender';

    try {
        if (!(await assertRequestBelongsToThread(requestId, threadId, systemUser, res))) return;
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
    const { systemUser, threadId } = access;
    const requestId = String(req.params.requestId);

    try {
        if (!(await assertRequestBelongsToThread(requestId, threadId, systemUser, res))) return;
        await SignatureEngine.Instance.Config(false, systemUser);
        const result = await SignatureEngine.Instance.DownloadSigned(requestId, systemUser);
        if (!result.Success || !result.document) {
            res.status(502).json({ error: result.ErrorMessage || 'Could not download the signed document' });
            return;
        }
        res.setHeader('Content-Type', result.document.contentType || 'application/pdf');
        // Sanitize the filename before embedding it in the header — an unsanitized provider
        // filename could smuggle CRLF/quote characters into the response headers.
        const safeFilename = (result.document.filename || 'signed-document.pdf').replace(/[^A-Za-z0-9._-]/g, '_');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        res.send(result.document.bytes);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging download signed document error: ${msg}`);
        res.status(500).json({ error: 'Failed to download the signed document' });
    }
}
