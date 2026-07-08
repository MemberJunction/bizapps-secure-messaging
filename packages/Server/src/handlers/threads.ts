import { Request, Response } from 'express';
import { RunView } from '@memberjunction/core';
import { getSystemUser } from '@memberjunction/server';
import { PortalRequest } from './middleware.js';

/**
 * GET /threads
 *
 * Lists all of the authenticated contact's threads (PRD §5 — the portal inbox). Scoped to the
 * session's contact, NOT a single thread, so it does not use assertThreadAccess. The widget uses
 * this to decide between the inbox view (more than one thread) and landing straight in the sole
 * conversation. Soft-deleted threads are excluded; newest-active first.
 */
export async function listThreads(req: Request, res: Response): Promise<void> {
    const session = (req as PortalRequest).portalSession;

    try {
        const systemUser = await getSystemUser();
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string; Subject: string; Status: string; LastMessageAt: string | null }>({
            EntityName: 'MJ_BizApps_SecureMessaging: Secure Threads',
            ExtraFilter: `ContactID = '${session.contactId.replace(/'/g, "''")}' AND IsDeleted = 0`,
            Fields: ['ID', 'Subject', 'Status', 'LastMessageAt'],
            OrderBy: 'LastMessageAt DESC',
            ResultType: 'simple',
        }, systemUser);

        if (!result.Success) {
            res.status(500).json({ error: 'Failed to load threads' });
            return;
        }

        const threads = result.Results.map(t => ({
            id: t.ID,
            subject: t.Subject,
            status: t.Status,
            lastMessageAt: t.LastMessageAt,
        }));

        res.json({ threads });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging list threads error: ${msg}`);
        res.status(500).json({ error: 'Failed to load threads' });
    }
}
