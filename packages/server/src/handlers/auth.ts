import { Request, Response } from 'express';
import { getSystemUser } from '@memberjunction/server';
import { PortalAuthService } from '../services/PortalAuthService.js';

/**
 * POST /auth/validate
 *
 * Validates an initial portal token (from the signed URL in the redirect email).
 * Returns the session context and the same token for subsequent API calls.
 *
 * Body: { token: string }
 */
export async function validateToken(req: Request, res: Response): Promise<void> {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
        res.status(400).json({ error: 'Token is required' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const session = await PortalAuthService.Instance.validateSessionToken(token, systemUser);

        if (!session) {
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }

        res.json({
            sessionId: session.sessionId,
            contactEmail: session.contactEmail,
            channelId: session.channelId,
            threadId: session.threadId,
            token, // Return the same token — it's still valid
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging auth validate error: ${msg}`);
        res.status(500).json({ error: 'Validation failed' });
    }
}

/**
 * POST /auth/magic-link
 *
 * Requests a magic link for a portal session.
 * The caller provides the session ID (known from a previous visit).
 *
 * Body: { sessionId: string }
 */
export async function requestMagicLink(req: Request, res: Response): Promise<void> {
    const { sessionId } = req.body;

    if (!sessionId || typeof sessionId !== 'string') {
        res.status(400).json({ error: 'sessionId is required' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const result = await PortalAuthService.Instance.generateMagicLink(sessionId, systemUser);

        if (!result.success) {
            res.status(400).json({ error: result.errorMessage || 'Failed to generate magic link' });
            return;
        }

        res.json({
            success: true,
            magicLinkToken: result.rawToken,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging magic link error: ${msg}`);
        res.status(500).json({ error: 'Failed to generate magic link' });
    }
}

/**
 * POST /auth/magic-link/redeem
 *
 * Redeems a magic link token. Returns a fresh session token for API calls.
 * The magic link is single-use and marked as 'Used' after redemption.
 *
 * Body: { token: string }
 */
export async function redeemMagicLink(req: Request, res: Response): Promise<void> {
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
        res.status(400).json({ error: 'Token is required' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const result = await PortalAuthService.Instance.redeemMagicLink(token, systemUser);

        if (!result) {
            res.status(401).json({ error: 'Invalid, expired, or already used magic link' });
            return;
        }

        res.json({
            sessionId: result.sessionContext.sessionId,
            contactEmail: result.sessionContext.contactEmail,
            channelId: result.sessionContext.channelId,
            threadId: result.sessionContext.threadId,
            token: result.newSessionToken,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging magic link redeem error: ${msg}`);
        res.status(500).json({ error: 'Failed to redeem magic link' });
    }
}
