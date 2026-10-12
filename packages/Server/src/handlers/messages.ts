import { Request, Response } from 'express';
import { PortalRequest, assertThreadAccess, assertThreadWritable } from './middleware.js';
import { getMessageStore } from '@mj-biz-apps/secure-messaging-core';

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
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    const { systemUser, threadId } = access;
    const session = (req as PortalRequest).portalSession;

    try {
        const messages = await getMessageStore().getThreadMessages(session, threadId, systemUser);
        // The store view can carry internal AI-pipeline fields. `generatedReply` is an
        // UNAPPROVED draft the org never chose to send — it must never reach the external
        // contact (the widget renders only content / approvedReply / sentContent).
        const sanitized = messages.map(({ generatedReply: _generatedReply, ...rest }) => rest);
        res.json({ messages: sanitized });
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
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    if (!assertThreadWritable(access, res)) return;
    const { systemUser, threadId } = access;
    const session = (req as PortalRequest).portalSession;
    const { content, subject } = req.body;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
        res.status(400).json({ error: 'Message content is required' });
        return;
    }

    try {
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
