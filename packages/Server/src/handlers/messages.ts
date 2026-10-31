import { Request, Response } from 'express';
import { PortalRequest, assertThreadAccess, assertThreadWritable } from './middleware.js';
import { getMessageStore, SecureMessageView } from '@mj-biz-apps/secure-messaging-core';

/**
 * The message shape returned to the EXTERNAL contact (portal widget). Deliberately a SUBSET of
 * {@link SecureMessageView}: the AI-pipeline internals — the unapproved draft (`generatedReply`),
 * its `approvalStatus`, and the staff-side `parentId` linkage — are staff-only and must never
 * reach an external contact. Keep this list in sync with what the widget actually renders:
 * content / sentContent / approvedReply (message-bubble `displayContent`) and `generationStatus`
 * (its "Preparing reply..." indicator).
 */
interface ContactMessageView {
    id: string;
    sender: string;
    recipient?: string;
    subject?: string;
    content: string;
    receivedAt: string;
    generationStatus?: string;
    approvedReply?: string;
    sentContent?: string;
    sentAt?: string;
    messageFormat?: string;
}

/**
 * Projects a stored message onto the contact-safe shape. This is the single projection point for
 * CONTACT-facing message reads — staff surfaces read the entities directly through MJ and never
 * go through this handler, so stripping here cannot affect the staff side.
 */
function toContactMessageView(msg: SecureMessageView): ContactMessageView {
    return {
        id: msg.id,
        sender: msg.sender,
        recipient: msg.recipient,
        subject: msg.subject,
        content: msg.content,
        receivedAt: msg.receivedAt,
        generationStatus: msg.generationStatus,
        approvedReply: msg.approvedReply,
        sentContent: msg.sentContent,
        sentAt: msg.sentAt,
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
        // Project onto the contact-safe shape — never return raw store objects to the portal.
        res.json({ messages: messages.map(toContactMessageView) });
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
