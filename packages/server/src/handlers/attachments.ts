import { Request, Response } from 'express';
import { RunView } from '@memberjunction/core';
import { getSystemUser } from '@memberjunction/server';
import { PortalRequest } from './middleware.js';

/**
 * GET /threads/:threadId/attachments
 *
 * Lists all attachments for messages in the thread.
 */
export async function getThreadAttachments(req: Request, res: Response): Promise<void> {
    const { threadId } = req.params;
    const session = (req as PortalRequest).portalSession;

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const rv = new RunView();

        // Get message IDs in this thread first
        const msgResult = await rv.RunView({
            EntityName: 'Channel Messages',
            ExtraFilter: `ChannelID = '${session.channelId}' AND ThreadID = '${threadId}'`,
        }, systemUser);

        if (!msgResult.Success) {
            res.status(500).json({ error: 'Failed to load attachments' });
            return;
        }

        const messageIds = (msgResult.Results as Record<string, unknown>[]).map(m => `'${m.ID}'`);
        if (messageIds.length === 0) {
            res.json({ attachments: [] });
            return;
        }

        const attachResult = await rv.RunView({
            EntityName: 'Channel Message Attachments',
            ExtraFilter: `ChannelMessageID IN (${messageIds.join(',')})`,
            OrderBy: '__mj_CreatedAt ASC',
        }, systemUser);

        if (!attachResult.Success) {
            res.status(500).json({ error: 'Failed to load attachments' });
            return;
        }

        const attachments = (attachResult.Results as Record<string, unknown>[]).map(a => ({
            id: a.ID,
            messageId: a.ChannelMessageID,
            filename: a.Filename,
            contentType: a.ContentType,
            size: a.Size,
            isInline: a.IsInline,
        }));

        res.json({ attachments });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging get attachments error: ${msg}`);
        res.status(500).json({ error: 'Failed to load attachments' });
    }
}

/**
 * POST /threads/:threadId/attachments
 *
 * Upload an attachment. Currently returns 501 — file upload will be
 * implemented in a future version with multipart form handling.
 */
export async function uploadAttachment(req: Request, res: Response): Promise<void> {
    res.status(501).json({ error: 'File upload not yet implemented' });
}
