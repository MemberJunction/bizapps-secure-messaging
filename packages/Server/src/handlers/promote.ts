import { createHmac, timingSafeEqual } from 'node:crypto';
import { Request, Response } from 'express';
import { getSystemUser } from '@memberjunction/server';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { UserInfo } from '@memberjunction/core';
import {
    PortalAuthService,
    getMessageStore,
    getSecureMessagingConfig,
    PromotedMessageInput,
} from '@mj-biz-apps/secure-messaging-core';

/** Reject inbound promote requests whose signature timestamp is older than this (replay guard). */
const MAX_REQUEST_AGE_SECONDS = 300;

/** Request augmented with the raw body captured by the json() verify hook (for HMAC). */
interface RequestWithRawBody extends Request {
    rawBody?: string;
}

/**
 * Express json() `verify` hook — stashes the raw request body on the request so the promote
 * handler can compute an HMAC over the exact bytes the caller signed. Apply only where needed.
 */
export function captureRawBody(req: Request, _res: Response, buf: Buffer): void {
    (req as RequestWithRawBody).rawBody = buf.toString('utf8');
}

/**
 * Verify the inbound promote signature, mirroring MJ's Slack signing-secret pattern
 * (HMAC-SHA256 over `${timestamp}:${rawBody}`, 5-minute replay window, timing-safe compare).
 * Headers: `x-sm-request-timestamp` (unix seconds) and `x-sm-signature` (`v0=<hex>`).
 */
function verifyPromoteSignature(req: Request, secret: string): boolean {
    const timestamp = req.headers['x-sm-request-timestamp'] as string | undefined;
    const signature = req.headers['x-sm-signature'] as string | undefined;
    if (!timestamp || !signature) {
        return false;
    }

    const requestTime = parseInt(timestamp, 10);
    if (isNaN(requestTime) || Math.floor(Date.now() / 1000) - requestTime > MAX_REQUEST_AGE_SECONDS) {
        return false;
    }

    const rawBody = (req as RequestWithRawBody).rawBody ?? JSON.stringify(req.body);
    const expected = 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${rawBody}`).digest('hex');

    const expectedBytes = new Uint8Array(Buffer.from(expected));
    const actualBytes = new Uint8Array(Buffer.from(signature));
    if (expectedBytes.length !== actualBytes.length) {
        return false;
    }
    return timingSafeEqual(expectedBytes, actualBytes);
}

/**
 * Resolve the MJ user to run the promotion as, mirroring MJ's messaging-adapter
 * `resolveContextUser`: match the initiating staff member's email against the UserCache and run
 * as that real MJ user (so imported/seed messages attribute correctly); fall back to the system
 * user when no email is given or no match is found.
 */
async function resolvePromoteUser(initiatedByEmail: string | undefined): Promise<UserInfo> {
    if (initiatedByEmail) {
        const match = new UserCache().Users.find(
            u => u.Email?.toLowerCase() === initiatedByEmail.toLowerCase()
        );
        if (match) {
            return match;
        }
    }
    return getSystemUser();
}

/** Shape of the promote request body. */
interface PromoteBody {
    contactEmail?: string;
    contactName?: string;
    sourceChannel?: string;
    messages?: PromotedMessageInput[];
    /** Optional: the initiating staff member's email, for run-as attribution. */
    initiatedByEmail?: string;
}

/**
 * POST /promote
 *
 * Server-to-server entry point that promotes an existing insecure (Email/SMS) thread into a
 * secure thread (PRD §10.1). Authenticated by the shared promote signing secret (NOT a portal
 * token — there is no contact session yet; promotion creates one). Mirrors the MJ Slack inbound
 * pattern: verify signature → resolve run-as user by email → do the work.
 *
 * Body: { contactEmail, sourceChannel, messages[], contactName?, initiatedByEmail? }
 * Returns: { threadId, magicLinkToken, importedCount }
 */
export async function promoteThread(req: Request, res: Response): Promise<void> {
    const { promoteSecret } = getSecureMessagingConfig();
    if (!promoteSecret) {
        res.status(503).json({ error: 'Promote endpoint is disabled (no signing secret configured).' });
        return;
    }
    if (!verifyPromoteSignature(req, promoteSecret)) {
        res.status(401).json({ error: 'Invalid or missing signature.' });
        return;
    }

    const body = (req.body ?? {}) as PromoteBody;
    if (!body.contactEmail) {
        res.status(400).json({ error: 'contactEmail is required.' });
        return;
    }
    if (!body.sourceChannel) {
        res.status(400).json({ error: 'sourceChannel is required.' });
        return;
    }
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
        res.status(400).json({ error: 'messages must be a non-empty array.' });
        return;
    }

    try {
        const runAsUser = await resolvePromoteUser(body.initiatedByEmail);

        const thread = await PortalAuthService.Instance.promoteThread(
            {
                contactEmail: body.contactEmail,
                contactName: body.contactName,
                sourceChannel: body.sourceChannel,
                messages: body.messages,
            },
            runAsUser
        );

        const imported = await getMessageStore().importMessages(
            {
                threadId: thread.threadId,
                sessionId: thread.sessionId,
                contactId: thread.contactId,
                sourceChannel: body.sourceChannel,
                messages: body.messages,
            },
            runAsUser
        );

        res.json({
            threadId: thread.threadId,
            magicLinkToken: thread.magicLinkToken,
            importedCount: imported.messageIds.length,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging promote error: ${msg}`);
        res.status(500).json({ error: 'Promotion failed.' });
    }
}
