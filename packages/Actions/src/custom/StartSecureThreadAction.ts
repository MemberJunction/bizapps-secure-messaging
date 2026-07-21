import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { PortalAuthService, getMessageStore } from '@mj-biz-apps/secure-messaging-core';

/**
 * Server-side MJ Action that **starts a brand-new secure thread** with a contact and seeds it
 * with a first outbound (staff → contact) message. This single verb backs both staff "compose"
 * (from the Executive Inbox) AND Izzy's thread-promotion / "switch to secure channel" flow
 * (PRD §8.3) — the only difference is who invokes it.
 *
 * Orchestration (thin boundary; the logic lives in Core):
 *   1. {@link PortalAuthService.startSecureThread} — find/create the contact Person, mint a
 *      thread, open a portal session, issue a single-use magic link.
 *   2. {@link getMessageStore}.createOutboundMessage — write the first message into the thread.
 *
 * The sender is the invoking MJ user. The raw magic-link token is returned for out-of-band
 * delivery (this app has no mailer): show it to staff to send, or let a registered notifier
 * email it. Give the contact a portal URL with `?ml=<MagicLinkToken>`.
 *
 * Input params:
 *   - `ContactEmail` (required) — the external contact's email (Person found-or-created).
 *   - `FirstMessage` (required) — the first message body.
 *   - `ContactName`  (optional) — display name used only when creating a new Person.
 * Output params:
 *   - `ThreadID`         — the new secure thread id.
 *   - `MagicLinkToken`   — single-use token; deliver as `?ml=<token>`.
 *   - `MessageID`        — the first message's id.
 *
 * Register the `Start Secure Thread` Action metadata with `DriverClass = '__StartSecureThread'`.
 */
@RegisterClass(BaseAction, '__StartSecureThread')
export class StartSecureThreadAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contactEmail = this.getParam(params, 'ContactEmail');
        const firstMessage = this.getParam(params, 'FirstMessage');

        if (!contactEmail) {
            return { Success: false, ResultCode: 'MISSING_CONTACT_EMAIL', Message: 'ContactEmail is required.' };
        }
        if (!firstMessage || !firstMessage.trim()) {
            return { Success: false, ResultCode: 'MISSING_FIRST_MESSAGE', Message: 'FirstMessage is required.' };
        }
        const senderEmail = params.ContextUser?.Email;
        if (!senderEmail) {
            return { Success: false, ResultCode: 'NO_SENDER', Message: 'No context user email to send as.' };
        }

        try {
            const thread = await PortalAuthService.Instance.startSecureThread(
                { contactEmail, contactName: this.getParam(params, 'ContactName') || undefined },
                params.ContextUser
            );

            const message = await getMessageStore().createOutboundMessage(
                thread.threadId,
                { content: firstMessage, senderEmail, senderName: params.ContextUser?.Name || undefined },
                params.ContextUser
            );

            params.Params.push({ Name: 'ThreadID', Value: thread.threadId, Type: 'Output' });
            params.Params.push({ Name: 'MagicLinkToken', Value: thread.magicLinkToken, Type: 'Output' });
            params.Params.push({ Name: 'MessageID', Value: message.messageId, Type: 'Output' });
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: 'Secure thread started.',
                Params: params.Params,
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { Success: false, ResultCode: 'ERROR', Message: msg };
        }
    }

    /** Read an input param's value by name (case-insensitive). */
    private getParam(params: RunActionParams, name: string): string {
        const p = params.Params?.find(x => x.Name?.toLowerCase() === name.toLowerCase());
        const v = p?.Value;
        return typeof v === 'string' ? v : v != null ? String(v) : '';
    }
}
