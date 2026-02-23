import { Request, Response, NextFunction } from 'express';
import { getSystemUser } from '@memberjunction/server';
import { PortalAuthService, PortalSessionContext } from '../services/PortalAuthService.js';

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
