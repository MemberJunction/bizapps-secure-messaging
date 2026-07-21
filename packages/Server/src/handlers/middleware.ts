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

/** The context assertThreadAccess hands back to handlers on success. */
export interface ThreadAccess {
    systemUser: Awaited<ReturnType<typeof getSystemUser>>;
    threadId: string;
    /** The thread's lifecycle status — write handlers must reject when not 'Active' (PRD §7). */
    threadStatus: 'Active' | 'Closed' | 'Archived';
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
): Promise<ThreadAccess | null> {
    const threadId = String(req.params.threadId);
    try {
        const systemUser = await getSystemUser();
        const threadStatus = await PortalAuthService.Instance.contactThreadStatus(
            req.portalSession.contactId, threadId, systemUser);
        if (!threadStatus) {
            res.status(403).json({ error: 'Access denied to this thread' });
            return null;
        }
        return { systemUser, threadId, threadStatus };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Thread access check error: ${msg}`);
        res.status(500).json({ error: 'Authorization failed' });
        return null;
    }
}

/**
 * Write-path guard on top of {@link assertThreadAccess}: a Closed or Archived thread is read-only
 * for the contact (PRD §7) — reads/downloads stay allowed, but new messages, uploads, and request
 * actions are rejected with 409. Writes the response and returns false when the thread isn't Active.
 */
export function assertThreadWritable(access: ThreadAccess, res: Response): boolean {
    if (access.threadStatus !== 'Active') {
        res.status(409).json({
            error: `This conversation is ${access.threadStatus.toLowerCase()} and no longer accepts new activity.`,
        });
        return false;
    }
    return true;
}
