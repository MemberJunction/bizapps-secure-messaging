import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { PortalSessionContext } from '../services/PortalAuthService.js';
import {
    MessageStore,
    SecureMessageView,
    CreateMessageInput,
    CreateMessageResult,
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
        const entity = await md.GetEntityObject('MJ_BizApps_SecureMessaging: Secure Messages', systemUser);
        entity.NewRecord();
        entity.Set('PortalSessionID', session.sessionId);
        entity.Set('ThreadID', threadId);
        entity.Set('PersonID', session.contactId);
        entity.Set('Direction', 'Inbound');
        entity.Set('Sender', session.contactEmail);
        entity.Set('Recipient', '');
        entity.Set('Content', input.content.trim());
        entity.Set('IsSecure', true);
        entity.Set('Status', 'New');
        entity.Set('ReceivedAt', new Date().toISOString());

        if (input.subject) {
            entity.Set('Subject', input.subject.trim());
        }

        const saved = await entity.Save();
        if (!saved) {
            throw new Error(entity.LatestResult?.CompleteMessage || 'Failed to create message');
        }

        return { messageId: entity.Get('ID') as string };
    }
}
