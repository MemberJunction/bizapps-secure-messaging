import { UserInfo } from '@memberjunction/core';
import { PortalSessionContext, PromotedMessageInput } from '../services/PortalAuthService.js';

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
 * Payload for bulk-importing prior insecure-channel messages into a secure thread during
 * promotion (PRD §10.1). Each message is copied verbatim, flagged imported, and tagged with the
 * source channel. The thread + session are already provisioned (by {@link MessageStore} callers /
 * PortalAuthService.promoteThread) before this is invoked.
 */
export interface ImportMessagesInput {
    threadId: string;
    /** The portal session the imported messages belong to. */
    sessionId: string;
    /** The contact Person these messages are associated with. */
    contactId: string;
    /** The insecure channel they came from (e.g. 'Email', 'SMS'). */
    sourceChannel: string;
    messages: PromotedMessageInput[];
}

export interface ImportMessagesResult {
    /** IDs of the imported message rows, in input order. */
    messageIds: string[];
}

/**
 * Payload for an outbound (staff → contact) message. Unlike inbound, the sender is a staff
 * member (not the contact), so the caller supplies the sender identity. The thread's portal
 * session supplies the recipient + PersonID.
 */
export interface CreateOutboundMessageInput {
    content: string;
    subject?: string;
    /** The signed-in staff member's email (becomes the message Sender). */
    senderEmail: string;
    /** Optional display name for the staff sender. */
    senderName?: string;
}

/**
 * Pluggable notification hook. Fired after a message is persisted so a host (the org's comms,
 * or Izzy) can notify the other party out-of-band (e.g. email a magic link) — this app has no
 * mailer of its own, so by default nothing happens. Register one via {@link setMessageNotifier}.
 */
export type MessageNotifier = (event: MessageNotification) => void | Promise<void>;

export interface MessageNotification {
    threadId: string;
    messageId: string;
    direction: 'Inbound' | 'Outbound';
    /** The portal session this thread belongs to, when known. */
    sessionId?: string;
    /** The contact's email (the party to notify on an outbound message). */
    contactEmail?: string;
}

/**
 * Abstraction over where secure messages live. This keeps the app **app-agnostic**:
 * the default {@link OwnedMessageStore} uses only the __mj_BizAppsSecureMessaging schema, so the
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

    /**
     * Create an outbound (staff → contact) message in a thread. The thread's portal session
     * supplies the recipient + contact PersonID. Fires the registered notifier after save.
     */
    createOutboundMessage(
        threadId: string,
        input: CreateOutboundMessageInput,
        systemUser: UserInfo
    ): Promise<CreateMessageResult>;

    /**
     * Bulk-import prior insecure-channel messages into a secure thread during promotion
     * (PRD §10.1). Each row is flagged imported + tagged with the source channel; original
     * direction, sender, and timestamp are preserved so the imported history reads correctly.
     * Does NOT fire the notifier (these are historical copies, not new live messages).
     */
    importMessages(
        input: ImportMessagesInput,
        systemUser: UserInfo
    ): Promise<ImportMessagesResult>;
}

/* ─── Notifier registry (pluggable, no-op by default) ─── */

let _notifier: MessageNotifier | null = null;

/** Register a host notifier (e.g. send an email/magic-link nudge). Replaces any previous one. */
export function setMessageNotifier(notifier: MessageNotifier | null): void {
    _notifier = notifier;
}

/** Invoke the registered notifier, if any. Best-effort — never throws into the caller. */
export async function notifyMessage(event: MessageNotification): Promise<void> {
    if (!_notifier) return;
    try {
        await _notifier(event);
    } catch (e) {
        // A failing host notifier must not break message persistence.
        console.error('Secure Messaging notifier failed:', e instanceof Error ? e.message : String(e));
    }
}
