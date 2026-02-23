import { Request, Response } from 'express';
import { Metadata, RunView } from '@memberjunction/core';
import { getSystemUser } from '@memberjunction/server';
import { PortalRequest } from './middleware.js';

/**
 * GET /threads/:threadId/messages
 *
 * Returns all messages in the thread, ordered by date.
 * The caller must have a valid session token for this thread.
 */
export async function getThreadMessages(req: Request, res: Response): Promise<void> {
    const { threadId } = req.params;
    const session = (req as PortalRequest).portalSession;

    // Ensure the session owns this thread
    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'Channel Messages',
            ExtraFilter: `ChannelID = '${session.channelId}' AND ThreadID = '${threadId}'`,
            OrderBy: 'ReceivedAt ASC',
        }, systemUser);

        if (!result.Success) {
            res.status(500).json({ error: 'Failed to load messages' });
            return;
        }

        const messages = (result.Results as Record<string, unknown>[]).map(msg => ({
            id: msg.ID,
            sender: msg.Sender,
            recipient: msg.Recipient,
            subject: msg.Subject,
            content: msg.MessageContent,
            receivedAt: msg.ReceivedAt,
            generationStatus: msg.GenerationStatus,
            generatedReply: msg.GeneratedReplyContent,
            approvalStatus: msg.ApprovalStatus,
            approvedReply: msg.ApprovedReplyContent,
            sentContent: msg.SentContent,
            sentAt: msg.SentAt,
            parentId: msg.ParentID,
            messageFormat: msg.MessageFormat,
        }));

        res.json({ messages });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging get messages error: ${msg}`);
        res.status(500).json({ error: 'Failed to load messages' });
    }
}

/**
 * POST /threads/:threadId/messages
 *
 * Creates a new inbound message from the contact.
 * The message enters the standard MJ ChannelMessage pipeline for AI processing.
 *
 * Body: { content: string, subject?: string }
 */
export async function createThreadMessage(req: Request, res: Response): Promise<void> {
    const { threadId } = req.params;
    const session = (req as PortalRequest).portalSession;
    const { content, subject } = req.body;

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        res.status(400).json({ error: 'Message content is required' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const md = new Metadata();
        const entity = await md.GetEntityObject('Channel Messages', systemUser);
        entity.NewRecord();
        entity.Set('ChannelID', session.channelId);
        entity.Set('ThreadID', threadId);
        entity.Set('Sender', session.contactEmail);
        entity.Set('Recipient', ''); // Org receives — no specific recipient address
        entity.Set('MessageContent', content.trim());
        entity.Set('ReceivedAt', new Date().toISOString());
        entity.Set('GenerationStatus', 'Read');
        entity.Set('IsSecure', true);
        entity.Set('ContactID', session.contactId);
        entity.Set('MessageFormat', 'text');

        if (subject && typeof subject === 'string') {
            entity.Set('Subject', subject.trim());
        }

        const saved = await entity.Save();
        if (!saved) {
            res.status(500).json({ error: 'Failed to create message' });
            return;
        }

        res.status(201).json({
            messageId: entity.Get('ID'),
            status: 'created',
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging create message error: ${msg}`);
        res.status(500).json({ error: 'Failed to create message' });
    }
}
