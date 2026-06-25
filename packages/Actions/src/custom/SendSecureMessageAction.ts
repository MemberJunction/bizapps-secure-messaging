import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { getMessageStore } from '@mj-biz-apps/secure-messaging-core';

/**
 * Server-side MJ Action that sends an **outbound** (staff → contact) secure message into a
 * thread, via the configured {@link getMessageStore} (owned store by default). This is the
 * staff-side send path AND the Izzy-facing verb: the Executive Inbox (running inside MJ
 * Explorer as an authenticated MJ user) invokes this Action through the data provider, and
 * Izzy can invoke the same Action via API/MCP. The actual persistence + notify hook live once,
 * in Core's MessageStore — this Action is a thin boundary.
 *
 * The sender identity is the invoking MJ user (`params.ContextUser`); the thread's portal
 * session supplies the recipient. Delivery is pull-based (the contact's widget sees the new
 * message on its next load); a host may register a notifier in Core to additionally nudge.
 *
 * Input params:
 *   - `ThreadID` (required) — the secure thread to post into.
 *   - `Content`  (required) — the message body.
 *   - `Subject`  (optional) — message subject.
 * Output params:
 *   - `MessageID` — the created SecureMessage row's ID.
 *
 * Register the corresponding `Send Secure Message` Action metadata with
 * `DriverClass = '__SendSecureMessage'` (matching the @RegisterClass key below).
 */
@RegisterClass(BaseAction, '__SendSecureMessage')
export class SendSecureMessageAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const threadId = this.getParam(params, 'ThreadID');
        const content = this.getParam(params, 'Content');

        if (!threadId) {
            return { Success: false, ResultCode: 'MISSING_THREAD_ID', Message: 'ThreadID is required.' };
        }
        if (!content || !content.trim()) {
            return { Success: false, ResultCode: 'MISSING_CONTENT', Message: 'Content is required.' };
        }

        const senderEmail = params.ContextUser?.Email;
        if (!senderEmail) {
            return { Success: false, ResultCode: 'NO_SENDER', Message: 'No context user email to send as.' };
        }

        try {
            const subject = this.getParam(params, 'Subject');
            const result = await getMessageStore().createOutboundMessage(
                threadId,
                {
                    content,
                    subject: subject || undefined,
                    senderEmail,
                    senderName: params.ContextUser?.Name || undefined,
                },
                params.ContextUser
            );

            params.Params.push({ Name: 'MessageID', Value: result.messageId, Type: 'Output' });
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: 'Message sent.',
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
