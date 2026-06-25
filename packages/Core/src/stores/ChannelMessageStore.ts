import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { PortalSessionContext } from '../services/PortalAuthService.js';
import {
    MessageStore,
    SecureMessageView,
    CreateMessageInput,
    CreateMessageResult,
    CreateOutboundMessageInput,
    notifyMessage,
} from './MessageStore.js';

/**
 * Optional adapter that bridges secure messages to the 'Channel Messages' entity (provided
 * by Izzy / the MJ communication platform). Enabling this backend makes secure web messages
 * flow through MJ's standard ChannelMessage AI pipeline (generation, approval, audit).
 *
 * This store is NOT required for the app to function — it is selected via
 * SECURE_MESSAGING_MESSAGE_BACKEND=channel only when the Channel Messages entity exists.
 */
export class ChannelMessageStore implements MessageStore {
    async getThreadMessages(
        session: PortalSessionContext,
        threadId: string,
        systemUser: UserInfo
    ): Promise<SecureMessageView[]> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'Channel Messages',
            ExtraFilter: `ChannelID = '${session.channelId}' AND ThreadID = '${threadId.replace(/'/g, "''")}'`,
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
            content: msg.MessageContent as string,
            receivedAt: msg.ReceivedAt as string,
            generationStatus: msg.GenerationStatus as string | undefined,
            generatedReply: msg.GeneratedReplyContent as string | undefined,
            approvalStatus: msg.ApprovalStatus as string | undefined,
            approvedReply: msg.ApprovedReplyContent as string | undefined,
            sentContent: msg.SentContent as string | undefined,
            sentAt: msg.SentAt as string | undefined,
            parentId: msg.ParentID as string | undefined,
            messageFormat: msg.MessageFormat as string | undefined,
        }));
    }

    async createMessage(
        session: PortalSessionContext,
        threadId: string,
        input: CreateMessageInput,
        systemUser: UserInfo
    ): Promise<CreateMessageResult> {
        const md = new Metadata();
        const entity = await md.GetEntityObject('Channel Messages', systemUser);
        entity.NewRecord();
        entity.Set('ChannelID', session.channelId);
        entity.Set('ThreadID', threadId);
        entity.Set('Sender', session.contactEmail);
        entity.Set('Recipient', ''); // Org receives — no specific recipient address
        entity.Set('MessageContent', input.content.trim());
        entity.Set('ReceivedAt', new Date().toISOString());
        entity.Set('GenerationStatus', 'Read'); // triggers AI processing
        entity.Set('IsSecure', true);
        // The Channel Messages entity uses PersonID (FK to MJ_BizApps_Common: People),
        // not ContactID. The session's contactId holds the Person ID.
        entity.Set('PersonID', session.contactId);
        entity.Set('MessageFormat', 'text');

        if (input.subject) {
            entity.Set('Subject', input.subject.trim());
        }

        const saved = await entity.Save();
        if (!saved) {
            throw new Error(entity.LatestResult?.CompleteMessage || 'Failed to create message');
        }

        return { messageId: entity.Get('ID') as string };
    }

    async createOutboundMessage(
        threadId: string,
        input: CreateOutboundMessageInput,
        systemUser: UserInfo
    ): Promise<CreateMessageResult> {
        // Resolve the thread's channel + contact from its newest ChannelMessage.
        const rv = new RunView();
        const ctx = await rv.RunView({
            EntityName: 'Channel Messages',
            ExtraFilter: `ThreadID = '${threadId.replace(/'/g, "''")}'`,
            OrderBy: 'ReceivedAt DESC',
            MaxRows: 1,
        }, systemUser);
        const ref = ctx.Success ? (ctx.Results?.[0] as Record<string, unknown> | undefined) : undefined;
        if (!ref) {
            throw new Error(`No channel message found for thread ${threadId}`);
        }

        const md = new Metadata();
        const entity = await md.GetEntityObject('Channel Messages', systemUser);
        entity.NewRecord();
        entity.Set('ChannelID', ref.ChannelID);
        entity.Set('ThreadID', threadId);
        entity.Set('Sender', input.senderEmail);
        entity.Set('Recipient', ref.Sender); // reply goes back to the contact who wrote in
        entity.Set('MessageContent', input.content.trim());
        entity.Set('ReceivedAt', new Date().toISOString());
        entity.Set('SentContent', input.content.trim());
        entity.Set('SentAt', new Date().toISOString());
        entity.Set('IsSecure', true);
        entity.Set('PersonID', ref.PersonID);
        entity.Set('MessageFormat', 'text');
        if (input.subject) {
            entity.Set('Subject', input.subject.trim());
        }

        const saved = await entity.Save();
        if (!saved) {
            throw new Error(entity.LatestResult?.CompleteMessage || 'Failed to create outbound message');
        }

        await notifyMessage({
            threadId,
            messageId: entity.Get('ID') as string,
            direction: 'Outbound',
            contactEmail: ref.Sender as string | undefined,
        });

        return { messageId: entity.Get('ID') as string };
    }
}
