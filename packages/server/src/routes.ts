import { Router, json, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { portalAuthMiddleware } from './handlers/middleware.js';
import { validateToken, requestMagicLink, redeemMagicLink } from './handlers/auth.js';
import { getThreadMessages, createThreadMessage } from './handlers/messages.js';
import { getThreadAttachments, uploadAttachment, downloadAttachment } from './handlers/attachments.js';
import { getFileRequests, createFileRequest, fulfillFileRequest } from './handlers/fileRequests.js';
import { getSignatureRequests, createSignatureRequest, refreshSignatureStatus, voidSignatureRequest, downloadSignedDocument } from './handlers/signatures.js';
import { MAX_FILE_BYTES } from './stores/ArtifactFileStore.js';

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

    // JSON body parsing for all routes on this router
    router.use(json());

    // --- Auth routes (public — no session token required) ---
    router.post('/auth/validate', validateToken);
    router.post('/auth/magic-link', requestMagicLink);
    router.post('/auth/magic-link/redeem', redeemMagicLink);

    // --- Protected routes (require valid portal session token) ---
    router.use(portalAuthMiddleware);

    // Thread messages
    router.get('/threads/:threadId/messages', getThreadMessages);
    router.post('/threads/:threadId/messages', createThreadMessage);

    // Thread attachments — multer handles the multipart upload on POST only
    router.get('/threads/:threadId/attachments', getThreadAttachments);
    router.post('/threads/:threadId/attachments', upload.single('file'), uploadAttachment);
    router.get('/threads/:threadId/attachments/:attachmentId/download', downloadAttachment);

    // File requests — staff creates, contact fulfills (fulfill is a multipart upload)
    router.get('/threads/:threadId/file-requests', getFileRequests);
    router.post('/threads/:threadId/file-requests', createFileRequest);
    router.post('/threads/:threadId/file-requests/:requestId/fulfill', upload.single('file'), fulfillFileRequest);

    // Signature requests — backed by the MJ eSignature engine (DocuSign / PandaDoc / Dropbox Sign).
    // Create+send is one atomic step (the engine has no separate "send a draft" primitive).
    router.get('/threads/:threadId/signature-requests', getSignatureRequests);
    router.post('/threads/:threadId/signature-requests', createSignatureRequest);
    router.post('/threads/:threadId/signature-requests/:requestId/refresh-status', refreshSignatureStatus);
    router.post('/threads/:threadId/signature-requests/:requestId/void', voidSignatureRequest);
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
