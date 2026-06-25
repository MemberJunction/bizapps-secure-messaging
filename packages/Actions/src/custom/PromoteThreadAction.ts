import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { PortalAuthService, getMessageStore, PromotedMessageInput } from '@mj-biz-apps/secure-messaging-core';

/**
 * Server-side MJ Action that **promotes an existing insecure (Email/SMS) thread into a secure
 * thread** — the shared backbone of both channel bridges (PRD §10.1). It provisions a secure
 * thread + portal session + magic link for the contact, then COPIES the prior insecure messages
 * into the secure thread so the contact sees the full history once authenticated.
 *
 * One-way visibility: imported messages live only on the secure side; secure messages are never
 * written back to the insecure channel. Imported rows are flagged (`IsImported`) and tagged with
 * the originating `SourceChannel`.
 *
 * This single verb backs both invokers: Izzy's action-diff "switch to secure channel" flow
 * (API/MCP) and the Outlook "Secure Send" add-in. The only difference is who calls it.
 *
 * Orchestration (thin boundary; the logic lives in Core):
 *   1. {@link PortalAuthService.promoteThread} — find/create the contact Person, mint a thread,
 *      open a portal session, issue a single-use magic link.
 *   2. {@link getMessageStore}.importMessages — bulk-copy the prior messages into the thread.
 *
 * Input params:
 *   - `ContactEmail`  (required) — the external contact's email (Person found-or-created).
 *   - `SourceChannel` (required) — the insecure channel being promoted from (e.g. 'Email', 'SMS').
 *   - `MessagesJSON`  (required) — JSON array of prior messages to import. Each item:
 *       `{ direction: 'Inbound'|'Outbound', sender: string, recipient?: string,
 *          content: string, subject?: string, receivedAt?: string }`.
 *   - `ContactName`   (optional) — display name used only when creating a new Person.
 * Output params:
 *   - `ThreadID`       — the new secure thread id.
 *   - `MagicLinkToken` — single-use token; deliver as `?ml=<token>`.
 *   - `ImportedCount`  — how many messages were imported.
 *
 * Register the `Promote Thread` Action metadata with `DriverClass = '__PromoteThread'`.
 */
@RegisterClass(BaseAction, '__PromoteThread')
export class PromoteThreadAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const contactEmail = this.getParam(params, 'ContactEmail');
        const sourceChannel = this.getParam(params, 'SourceChannel');
        const messagesJSON = this.getParam(params, 'MessagesJSON');

        if (!contactEmail) {
            return { Success: false, ResultCode: 'MISSING_CONTACT_EMAIL', Message: 'ContactEmail is required.' };
        }
        if (!sourceChannel) {
            return { Success: false, ResultCode: 'MISSING_SOURCE_CHANNEL', Message: 'SourceChannel is required.' };
        }

        let messages: PromotedMessageInput[];
        try {
            messages = this.parseMessages(messagesJSON);
        } catch (e) {
            return { Success: false, ResultCode: 'INVALID_MESSAGES', Message: e instanceof Error ? e.message : String(e) };
        }

        try {
            const thread = await PortalAuthService.Instance.promoteThread(
                {
                    contactEmail,
                    contactName: this.getParam(params, 'ContactName') || undefined,
                    sourceChannel,
                    messages,
                },
                params.ContextUser
            );

            const imported = await getMessageStore().importMessages(
                {
                    threadId: thread.threadId,
                    sessionId: thread.sessionId,
                    contactId: thread.contactId,
                    sourceChannel,
                    messages,
                },
                params.ContextUser
            );

            params.Params.push({ Name: 'ThreadID', Value: thread.threadId, Type: 'Output' });
            params.Params.push({ Name: 'MagicLinkToken', Value: thread.magicLinkToken, Type: 'Output' });
            params.Params.push({ Name: 'ImportedCount', Value: imported.messageIds.length, Type: 'Output' });
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: `Promoted thread with ${imported.messageIds.length} imported message(s).`,
                Params: params.Params,
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { Success: false, ResultCode: 'ERROR', Message: msg };
        }
    }

    /**
     * Parse + validate the MessagesJSON payload into typed PromotedMessageInput[].
     * Throws an Error with a descriptive message on any validation failure.
     */
    private parseMessages(raw: string): PromotedMessageInput[] {
        if (!raw || !raw.trim()) {
            throw new Error('MessagesJSON is required (a JSON array of messages to import).');
        }
        let data: unknown;
        try {
            data = JSON.parse(raw);
        } catch {
            throw new Error('MessagesJSON is not valid JSON.');
        }
        if (!Array.isArray(data) || data.length === 0) {
            throw new Error('MessagesJSON must be a non-empty JSON array.');
        }

        const messages: PromotedMessageInput[] = [];
        for (let i = 0; i < data.length; i++) {
            const item = data[i] as Record<string, unknown>;
            const direction = item.direction;
            const sender = item.sender;
            const content = item.content;
            if (direction !== 'Inbound' && direction !== 'Outbound') {
                throw new Error(`messages[${i}].direction must be 'Inbound' or 'Outbound'.`);
            }
            if (typeof sender !== 'string' || !sender.trim()) {
                throw new Error(`messages[${i}].sender is required.`);
            }
            if (typeof content !== 'string' || !content.trim()) {
                throw new Error(`messages[${i}].content is required.`);
            }
            messages.push({
                direction,
                sender,
                content,
                recipient: typeof item.recipient === 'string' ? item.recipient : undefined,
                subject: typeof item.subject === 'string' ? item.subject : undefined,
                receivedAt: typeof item.receivedAt === 'string' ? item.receivedAt : undefined,
            });
        }
        return messages;
    }

    /** Read an input param's value by name (case-insensitive). */
    private getParam(params: RunActionParams, name: string): string {
        const p = params.Params?.find(x => x.Name?.toLowerCase() === name.toLowerCase());
        const v = p?.Value;
        return typeof v === 'string' ? v : v != null ? String(v) : '';
    }
}
