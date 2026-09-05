import { Request, Response } from 'express';
import { getSystemUser } from '@memberjunction/server';
import { PortalAuthService } from '@mj-biz-apps/secure-messaging-core';

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
            // v2: a session is per-contact and spans all their threads — no thread is implied by a
            // bare token validation (the widget resolves the current thread from the inbox / deep link).
            token, // Return the same token — it's still valid
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging auth validate error: ${msg}`);
        res.status(500).json({ error: 'Validation failed' });
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
            // The deep-link target thread carried by the magic link (undefined for a non-deep link).
            threadId: result.sessionContext.threadId,
            token: result.newSessionToken,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging magic link redeem error: ${msg}`);
        res.status(500).json({ error: 'Failed to redeem magic link' });
    }
}
