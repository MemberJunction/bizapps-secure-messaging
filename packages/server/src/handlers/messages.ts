import { Request, Response } from 'express';
import { getSystemUser } from '@memberjunction/server';
import { PortalRequest } from './middleware.js';
import { getMessageStore } from '../stores/index.js';

/**
 * GET /threads/:threadId/messages
 *
 * Returns all messages in the thread, ordered by date.
 * The caller must have a valid session token for this thread.
 *
 * Delegates to the configured MessageStore (owned self-contained store by default,
 * or the Channel Messages adapter when SECURE_MESSAGING_MESSAGE_BACKEND=channel).
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
        const messages = await getMessageStore().getThreadMessages(session, threadId, systemUser);
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
 * Creates a new inbound message from the contact via the configured MessageStore.
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
        const result = await getMessageStore().createMessage(
            session,
            threadId,
            { content, subject: typeof subject === 'string' ? subject : undefined },
            systemUser
        );

        res.status(201).json({
            messageId: result.messageId,
            status: 'created',
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging create message error: ${msg}`);
        res.status(500).json({ error: 'Failed to create message' });
    }
}
