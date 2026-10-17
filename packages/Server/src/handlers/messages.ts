import { Request, Response } from 'express';
import { PortalRequest, assertThreadAccess, assertThreadWritable } from './middleware.js';
import { getMessageStore } from '@mj-biz-apps/secure-messaging-core';
import type { SecureMessageView } from '@mj-biz-apps/secure-messaging-core';

/**
 * Portal-facing serialization of a message. The AI pipeline's internal fields must never reach
 * the external contact: `generatedReply` is an UNAPPROVED draft and `approvalStatus` is staff-side
 * workflow state, so both are always stripped; `approvedReply` is included only once the reply has
 * actually been sent (the store sets `sentContent`/`sentAt` at send time) — before that it is still
 * internal. Staff surfaces read the stores directly, not this REST handler, so they are unaffected.
 */
function toPortalMessageView(msg: SecureMessageView): SecureMessageView {
    const replySent = !!(msg.sentAt || msg.sentContent);
    return {
        id: msg.id,
        sender: msg.sender,
        recipient: msg.recipient,
        subject: msg.subject,
        content: msg.content,
        receivedAt: msg.receivedAt,
        generationStatus: msg.generationStatus,
        approvedReply: replySent ? msg.approvedReply : undefined,
        sentContent: msg.sentContent,
        sentAt: msg.sentAt,
        parentId: msg.parentId,
        messageFormat: msg.messageFormat,
    };
}

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
        res.json({ messages: messages.map(toPortalMessageView) });
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
