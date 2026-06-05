import { UserInfo } from '@memberjunction/core';
import { PortalSessionContext } from '../services/PortalAuthService.js';

/**
 * A message as returned to API callers (widget / inbox). Implementations map their
 * underlying storage (the owned SecureMessage table, or an external Channel Messages
 * entity) onto this shape.
 */
export interface SecureMessageView {
    id: string;
    sender: string;
    recipient?: string;
    subject?: string;
    content: string;
    receivedAt: string;
    /** Optional AI-pipeline fields — populated only by adapters that integrate one. */
    generationStatus?: string;
    generatedReply?: string;
    approvalStatus?: string;
    approvedReply?: string;
    sentContent?: string;
    sentAt?: string;
    parentId?: string;
    messageFormat?: string;
}

/**
 * Payload for creating a new inbound message from a contact.
 */
export interface CreateMessageInput {
    content: string;
    subject?: string;
}

export interface CreateMessageResult {
    messageId: string;
}

/**
 * Abstraction over where secure messages live. This keeps the app **app-agnostic**:
 * the default {@link OwnedMessageStore} uses only the secure_messaging schema, so the
 * app runs in any MJ instance. The optional ChannelMessageStore adapter bridges to
 * Izzy's Channel Messages entity (and its AI pipeline) when that platform is present.
 */
export interface MessageStore {
    /** List all messages in a thread, ordered oldest-first. */
    getThreadMessages(
        session: PortalSessionContext,
        threadId: string,
        systemUser: UserInfo
    ): Promise<SecureMessageView[]>;

    /** Create a new inbound message from the contact. */
    createMessage(
        session: PortalSessionContext,
        threadId: string,
        input: CreateMessageInput,
        systemUser: UserInfo
    ): Promise<CreateMessageResult>;
}
