import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    mjBizAppsSecureMessagingSecureMessageEntity,
    mjBizAppsSecureMessagingSecureThreadEntity,
} from '@mj-biz-apps/secure-messaging-entities';
import { PortalSessionContext, PortalAuthService } from '../services/PortalAuthService.js';
import {
    MessageStore,
    SecureMessageView,
    CreateMessageInput,
    CreateMessageResult,
    CreateOutboundMessageInput,
    ImportMessagesInput,
    ImportMessagesResult,
    notifyMessage,
} from './MessageStore.js';

/**
 * Default, self-contained message store. Reads and writes the __mj_BizAppsSecureMessaging.SecureMessage
 * table only — no dependency on any external app entity, so the app runs in any MJ instance.
 */
export class OwnedMessageStore implements MessageStore {
    async getThreadMessages(
        session: PortalSessionContext,
        threadId: string,
        systemUser: UserInfo
    ): Promise<SecureMessageView[]> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'MJ_BizApps_SecureMessaging: Secure Messages',
            ExtraFilter: `ThreadID = '${threadId.replace(/'/g, "''")}'`,
            OrderBy: 'ReceivedAt ASC',
        }, systemUser);

        if (!result.Success) {
            throw new Error(result.ErrorMessage || 'Failed to load messages');
        }

        return (result.Results as Record<string, unknown>[]).map(msg => ({
            id: msg.ID as string,
            sender: msg.Sender as string,
            recipient: msg.Recipient as string,
            subject: msg.Subject as string | undefined,
            content: msg.Content as string,
            receivedAt: msg.ReceivedAt as string,
        }));
    }

    async createMessage(
        session: PortalSessionContext,
        threadId: string,
        input: CreateMessageInput,
        systemUser: UserInfo
    ): Promise<CreateMessageResult> {
        const md = new Metadata();
        const entity = await md.GetEntityObject<mjBizAppsSecureMessagingSecureMessageEntity>(
            'MJ_BizApps_SecureMessaging: Secure Messages',
            systemUser
        );
        entity.NewRecord();
        entity.PortalSessionID = session.sessionId;
        entity.ThreadID = threadId;
        entity.PersonID = session.contactId;
        entity.Direction = 'Inbound';
        entity.Sender = session.contactEmail;
        entity.Recipient = '';
        entity.Content = input.content.trim();
        entity.IsSecure = true;
        entity.Status = 'New';
        entity.ReceivedAt = new Date();
        if (input.subject) {
            entity.Subject = input.subject.trim();
        }

        if (!(await entity.Save())) {
            throw new Error(entity.LatestResult?.CompleteMessage || 'Failed to create message');
        }

        await this.touchThread(threadId, systemUser);

        await notifyMessage({
            threadId,
            messageId: entity.ID,
            direction: 'Inbound',
            sessionId: session.sessionId,
            contactEmail: session.contactEmail,
        });

        return { messageId: entity.ID };
    }

    async createOutboundMessage(
        threadId: string,
        input: CreateOutboundMessageInput,
        systemUser: UserInfo
    ): Promise<CreateMessageResult> {
        const md = new Metadata();

        // In v2 the thread is the unit of conversation and owns the contact. Resolve the thread to
        // its contact, then the contact's (per-contact) portal session — the message records that
        // session for audit and the contact's email as the recipient.
        const thread = await this.loadThread(threadId, systemUser);
        const contactId = thread.ContactID;
        const recipientEmail = await PortalAuthService.Instance.getContactEmail(contactId, systemUser);
        const { sessionId } = await PortalAuthService.Instance.ensureSessionForContact(contactId, systemUser);

        const entity = await md.GetEntityObject<mjBizAppsSecureMessagingSecureMessageEntity>(
            'MJ_BizApps_SecureMessaging: Secure Messages',
            systemUser
        );
        entity.NewRecord();
        entity.PortalSessionID = sessionId;
        entity.ThreadID = threadId;
        entity.PersonID = contactId;
        entity.Direction = 'Outbound';
        entity.Sender = input.senderEmail;
        entity.Recipient = recipientEmail;
        entity.Content = input.content.trim();
        entity.IsSecure = true;
        entity.Status = 'Sent';
        entity.ReceivedAt = new Date();
        if (input.subject) {
            entity.Subject = input.subject.trim();
        }

        if (!(await entity.Save())) {
            throw new Error(entity.LatestResult?.CompleteMessage || 'Failed to create outbound message');
        }

        // Reuse the already-loaded thread to stamp LastMessageAt (inbox ordering).
        thread.LastMessageAt = new Date();
        await thread.Save();

        await notifyMessage({
            threadId,
            messageId: entity.ID,
            direction: 'Outbound',
            sessionId,
            contactEmail: recipientEmail,
        });

        return { messageId: entity.ID };
    }

    /** Loads a SecureThread by ID (entity object), throwing if it does not exist. */
    private async loadThread(
        threadId: string,
        systemUser: UserInfo
    ): Promise<mjBizAppsSecureMessagingSecureThreadEntity> {
        const rv = new RunView();
        const res = await rv.RunView<mjBizAppsSecureMessagingSecureThreadEntity>({
            EntityName: 'MJ_BizApps_SecureMessaging: Secure Threads',
            ExtraFilter: `ID = '${threadId.replace(/'/g, "''")}'`,
            MaxRows: 1,
            ResultType: 'entity_object',
        }, systemUser);
        const thread = res.Success ? res.Results?.[0] : undefined;
        if (!thread) {
            throw new Error(`Secure thread ${threadId} not found`);
        }
        return thread;
    }

    /** Stamps the thread's LastMessageAt to now (denormalized for inbox ordering, PRD §4/§6). */
    private async touchThread(threadId: string, systemUser: UserInfo): Promise<void> {
        const thread = await this.loadThread(threadId, systemUser);
        thread.LastMessageAt = new Date();
        await thread.Save();
    }

    async importMessages(
        input: ImportMessagesInput,
        systemUser: UserInfo
    ): Promise<ImportMessagesResult> {
        const md = new Metadata();
        const messageIds: string[] = [];

        // Copy each prior message verbatim into the secure thread, preserving direction / sender /
        // timestamp and flagging it imported. No notifier fires — these are historical copies, not
        // new live messages (PRD §10.1).
        for (const msg of input.messages) {
            const entity = await md.GetEntityObject<mjBizAppsSecureMessagingSecureMessageEntity>(
                'MJ_BizApps_SecureMessaging: Secure Messages',
                systemUser
            );
            entity.NewRecord();
            entity.PortalSessionID = input.sessionId;
            entity.ThreadID = input.threadId;
            entity.PersonID = input.contactId;
            entity.Direction = msg.direction;
            entity.Sender = msg.sender;
            entity.Recipient = msg.recipient ?? '';
            entity.Content = msg.content;
            entity.IsSecure = true;
            entity.IsImported = true;
            entity.SourceChannel = input.sourceChannel;
            // Imported history starts already-read on the staff side; it is not new work.
            entity.Status = 'Read';
            entity.ReceivedAt = msg.receivedAt ? new Date(msg.receivedAt) : new Date();
            if (msg.subject) {
                entity.Subject = msg.subject;
            }

            if (!(await entity.Save())) {
                throw new Error(entity.LatestResult?.CompleteMessage || 'Failed to import message');
            }
            messageIds.push(entity.ID);
        }

        // Stamp the thread's LastMessageAt to the newest imported message time so a promoted thread
        // sorts correctly in the inbox from the moment it is created (PRD §4/§6).
        if (input.messages.length > 0) {
            const newest = Math.max(...input.messages.map(m => (m.receivedAt ? new Date(m.receivedAt).getTime() : Date.now())));
            const thread = await this.loadThread(input.threadId, systemUser);
            thread.LastMessageAt = new Date(newest);
            await thread.Save();
        }

        return { messageIds };
    }
}
