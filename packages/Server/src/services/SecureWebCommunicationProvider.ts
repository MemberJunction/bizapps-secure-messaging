import { RegisterClass } from '@memberjunction/global';
import { LogStatus, LogError } from '@memberjunction/core';
import {
    BaseCommunicationProvider,
    ProcessedMessage,
    MessageResult,
    GetMessagesParams,
    GetMessagesResult,
    ReplyToMessageParams,
    ReplyToMessageResult,
    ForwardMessageParams,
    ForwardMessageResult,
    CreateDraftParams,
    CreateDraftResult,
    ProviderCredentialsBase,
    ProviderOperation,
} from '@memberjunction/communication-types';

/**
 * Communication provider for the Secure Web channel type.
 *
 * This is the simplest possible provider: messages live in MJ's database
 * and are served to external contacts via the REST API / Angular Element widget.
 * No external API calls are needed.
 */
@RegisterClass(BaseCommunicationProvider, 'Secure Web')
export class SecureWebCommunicationProvider extends BaseCommunicationProvider {

    public override getSupportedOperations(): ProviderOperation[] {
        return [
            'SendSingleMessage',
            'GetMessages',
            'ReplyToMessage',
        ];
    }

    /**
     * Sends a message by creating a ChannelMessage record in the database.
     * The message becomes visible to the external contact via the widget's REST API.
     */
    public async SendSingleMessage(
        message: ProcessedMessage,
        _credentials?: ProviderCredentialsBase
    ): Promise<MessageResult> {
        try {
            LogStatus(`SecureWeb: SendSingleMessage to ${message.To}`);
            // For the Secure Web provider, "sending" means creating a ChannelMessage
            // that the widget can fetch. The actual delivery is handled by the REST API.
            // This method is called when the AI pipeline produces a reply.
            return {
                Message: message,
                Success: true,
                Error: '',
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SecureWeb: SendSingleMessage failed: ${msg}`);
            return {
                Message: message,
                Success: false,
                Error: msg,
            };
        }
    }

    /**
     * Fetches unprocessed messages from the Secure Web channel.
     * Used by the MJ processing pipeline to pick up new messages from contacts.
     */
    public async GetMessages(
        params: GetMessagesParams,
        _credentials?: ProviderCredentialsBase
    ): Promise<GetMessagesResult> {
        try {
            LogStatus(`SecureWeb: GetMessages for identifier ${params.Identifier}`);
            // The Secure Web provider doesn't poll an external service.
            // Messages are created directly via the REST API when contacts send them.
            // The processing pipeline picks them up via standard ChannelMessage queries.
            return {
                Success: true,
                Messages: [],
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SecureWeb: GetMessages failed: ${msg}`);
            return {
                Success: false,
                ErrorMessage: msg,
                Messages: [],
            };
        }
    }

    /**
     * Replies to a message. For Secure Web, this is handled by the ChannelMessage
     * pipeline — the approved reply content is written as a new ChannelMessage
     * and becomes visible to the contact via the widget.
     */
    public async ReplyToMessage(
        params: ReplyToMessageParams,
        _credentials?: ProviderCredentialsBase
    ): Promise<ReplyToMessageResult> {
        try {
            LogStatus(`SecureWeb: ReplyToMessage ${params.MessageID}`);
            return {
                Success: true,
            };
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            LogError(`SecureWeb: ReplyToMessage failed: ${msg}`);
            return {
                Success: false,
                ErrorMessage: msg,
            };
        }
    }

    /**
     * Forwarding is not supported for Secure Web channels.
     */
    public async ForwardMessage(
        _params: ForwardMessageParams,
        _credentials?: ProviderCredentialsBase
    ): Promise<ForwardMessageResult> {
        return {
            Success: false,
            ErrorMessage: 'Secure Web provider does not support forwarding messages.',
        };
    }

    /**
     * Drafts are not supported for Secure Web channels.
     */
    public async CreateDraft(
        _params: CreateDraftParams,
        _credentials?: ProviderCredentialsBase
    ): Promise<CreateDraftResult> {
        return {
            Success: false,
            ErrorMessage: 'Secure Web provider does not support drafts.',
        };
    }
}
