import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import {
    mjBizAppsSecureMessagingSecureMessageEntity,
    mjBizAppsSecureMessagingPortalSessionEntity,
} from '@mj-biz-apps/secure-messaging-entities';
import { PortalSessionContext, PortalAuthService } from '../services/PortalAuthService.js';
import {
    MessageStore,
    SecureMessageView,
    CreateMessageInput,
    CreateMessageResult,
    CreateOutboundMessageInput,
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

        // Resolve the thread's portal session for the recipient + contact PersonID.
        const rv = new RunView();
        const sessionResult = await rv.RunView<mjBizAppsSecureMessagingPortalSessionEntity>({
            EntityName: 'MJ_BizApps_SecureMessaging: Portal Sessions',
            ExtraFilter: `ThreadID = '${threadId.replace(/'/g, "''")}'`,
            OrderBy: 'LastAccessedAt DESC',
            MaxRows: 1,
            ResultType: 'entity_object',
        }, systemUser);
        const portalSession = sessionResult.Success ? sessionResult.Results?.[0] : undefined;
        if (!portalSession) {
            throw new Error(`No portal session found for thread ${threadId}`);
        }

        const recipientEmail = await PortalAuthService.Instance.getContactEmail(portalSession.ContactID, systemUser);

        const entity = await md.GetEntityObject<mjBizAppsSecureMessagingSecureMessageEntity>(
            'MJ_BizApps_SecureMessaging: Secure Messages',
            systemUser
        );
        entity.NewRecord();
        entity.PortalSessionID = portalSession.ID;
        entity.ThreadID = threadId;
        entity.PersonID = portalSession.ContactID;
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

        await notifyMessage({
            threadId,
            messageId: entity.ID,
            direction: 'Outbound',
            sessionId: portalSession.ID,
            contactEmail: recipientEmail,
        });

        return { messageId: entity.ID };
    }
}
