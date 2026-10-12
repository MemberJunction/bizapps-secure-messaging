import { Router, json, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { portalAuthMiddleware } from './handlers/middleware.js';
import { validateToken, redeemMagicLink } from './handlers/auth.js';
import { listThreads } from './handlers/threads.js';
import { getThreadMessages, createThreadMessage } from './handlers/messages.js';
import { getThreadAttachments, uploadAttachment, downloadAttachment } from './handlers/attachments.js';
import { getFileRequests, fulfillFileRequest } from './handlers/fileRequests.js';
import { getSignatureRequests, refreshSignatureStatus, downloadSignedDocument } from './handlers/signatures.js';
import { promoteThread, captureRawBody } from './handlers/promote.js';
import { MAX_FILE_BYTES } from '@mj-biz-apps/secure-messaging-core';

/**
 * Multipart upload middleware (in-memory). Applied only to the upload route so the
 * router-wide json() parser continues to handle every other route unchanged.
 */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_BYTES },
});

/**
 * Simple CORS middleware for the Secure Messaging routes.
 * The widget is designed to be embedded on any external website,
 * so we allow all origins. Authentication is handled by session tokens.
 */
function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    // The Allow-Origin value reflects the request's Origin, so caches must key on it.
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }
    next();
}

/**
 * Creates the Express Router for all Secure Messaging API endpoints.
 *
 * Route structure:
 *   /auth/*              — Public (no auth middleware)
 *   /threads/*           — Protected (requires valid portal session token)
 *
 * Auth model: External contacts authenticate with opaque session tokens (sm_*),
 * NOT MJ user accounts. The portalAuthMiddleware validates the token and attaches
 * the PortalSessionContext to the request.
 */
export function createSecureMessagingRouter(): Router {
    const router = Router();

    // CORS — widget is embedded on external sites
    router.use(corsMiddleware);

    // JSON body parsing for all routes on this router. The verify hook stashes the raw body so
    // the /promote handler can HMAC-verify the exact bytes the caller signed (harmless elsewhere).
    router.use(json({ verify: captureRawBody }));

    // --- Auth routes (public — no session token required) ---
    router.post('/auth/validate', validateToken);
    // NOTE: there is intentionally NO public "request magic link" route. Such an endpoint would
    // mint a raw magic-link token from a caller-supplied session ID pre-auth — and session IDs
    // are guessable GUIDs, so that is unauthenticated account takeover. Magic links are only
    // issued server-side (thread provisioning / promote) and delivered out-of-band.
    router.post('/auth/magic-link/redeem', redeemMagicLink);

    // --- Promote (server-to-server: Izzy / Outlook add-in backend) ---
    // Self-guarded by an HMAC signing secret (NOT a portal token — promotion CREATES the contact
    // session), so it sits on the public side, before portalAuthMiddleware. The router-wide json()
    // above captured rawBody for the signature check.
    router.post('/promote', promoteThread);

    // --- Protected routes (require valid portal session token) ---
    router.use(portalAuthMiddleware);

    // Contact's thread list (the portal inbox — scoped to the authenticated contact)
    router.get('/threads', listThreads);

    // Thread messages
    router.get('/threads/:threadId/messages', getThreadMessages);
    router.post('/threads/:threadId/messages', createThreadMessage);

    // Thread attachments — multer handles the multipart upload on POST only
    router.get('/threads/:threadId/attachments', getThreadAttachments);
    router.post('/threads/:threadId/attachments', upload.single('file'), uploadAttachment);
    router.get('/threads/:threadId/attachments/:attachmentId/download', downloadAttachment);

    // File requests — staff creates (server-side, NOT via this portal API), contact fulfills
    // (fulfill is a multipart upload).
    router.get('/threads/:threadId/file-requests', getFileRequests);
    router.post('/threads/:threadId/file-requests/:requestId/fulfill', upload.single('file'), fulfillFileRequest);

    // Signature requests — backed by the MJ eSignature engine (DocuSign / PandaDoc / Dropbox Sign).
    //
    // SECURITY: only the CONTACT-facing verbs are mounted here. The only principal on this
    // router is an external contact (portal session token), so staff-side verbs must never be
    // reachable from it: `createSignatureRequest` lets the caller send envelopes from the org's
    // e-signature account, `voidSignatureRequest` cancels staff-sent envelopes, and
    // `createFileRequest` fabricates staff-side document demands. The contact widget calls none
    // of them (it only lists, fulfills, refreshes, and downloads). Those handlers remain
    // exported from ./handlers for staff-side hosts to mount behind STAFF authentication — do
    // not re-mount them on this portal router.
    router.get('/threads/:threadId/signature-requests', getSignatureRequests);
    router.post('/threads/:threadId/signature-requests/:requestId/refresh-status', refreshSignatureStatus);
    router.get('/threads/:threadId/signature-requests/:requestId/signed-document', downloadSignedDocument);

    return router;
}

/**
 * Mounts the Secure Messaging API routes on an Express-compatible app.
 * Accepts `unknown` to avoid type conflicts between Express type versions
 * (e.g., host app using @types/express v4 while this package uses v5).
 */
export function mountSecureMessagingRoutes(
    app: unknown,
    basePath: string = '/secure-messaging/api/v1'
): void {
    const expressApp = app as { use: (path: string, router: Router) => void };
    expressApp.use(basePath, createSecureMessagingRouter());
}
