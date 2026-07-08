import { Request, Response, NextFunction } from 'express';
import { getSystemUser } from '@memberjunction/server';
import { PortalAuthService, PortalSessionContext } from '@mj-biz-apps/secure-messaging-core';

/**
 * Extended Express Request with portal session context.
 */
export interface PortalRequest extends Request {
    portalSession: PortalSessionContext;
}

/**
 * Middleware that validates the Bearer token from the Authorization header
 * and attaches the portal session context to the request.
 */
export async function portalAuthMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid Authorization header' });
        return;
    }

    const token = authHeader.slice(7); // Strip "Bearer "

    try {
        const systemUser = await getSystemUser();
        const session = await PortalAuthService.Instance.validateSessionToken(token, systemUser);

        if (!session) {
            res.status(401).json({ error: 'Invalid or expired session token' });
            return;
        }

        (req as PortalRequest).portalSession = session;
        next();
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Portal auth middleware error: ${msg}`);
        res.status(500).json({ error: 'Authentication failed' });
    }
}

/**
 * Per-request thread authorization for the v2 per-contact session model. Reads `:threadId` from the
 * route, resolves the system user, and verifies the authenticated contact owns that thread. On
 * failure it writes the 403/500 response and returns null; handlers just `if (!access) return;`.
 * This centralizes the security gate that every thread-scoped handler previously duplicated.
 */
export async function assertThreadAccess(
    req: PortalRequest,
    res: Response
): Promise<{ systemUser: Awaited<ReturnType<typeof getSystemUser>>; threadId: string } | null> {
    const threadId = String(req.params.threadId);
    try {
        const systemUser = await getSystemUser();
        const owns = await PortalAuthService.Instance.contactOwnsThread(
            req.portalSession.contactId, threadId, systemUser);
        if (!owns) {
            res.status(403).json({ error: 'Access denied to this thread' });
            return null;
        }
        return { systemUser, threadId };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Thread access check error: ${msg}`);
        res.status(500).json({ error: 'Authorization failed' });
        return null;
    }
}
