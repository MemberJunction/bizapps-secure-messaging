import { LogError, LogStatus } from '@memberjunction/core';
import { getSystemUser } from '@memberjunction/server';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import {
    MessageNotification,
    PortalAuthService,
    getSecureMessagingConfig,
} from '@mj-biz-apps/secure-messaging-core';

/**
 * The notify hook (PRD §9). Registered at server bootstrap via {@link setMessageNotifier}, this
 * fires after every message is persisted and — for the **first cut** — emails the **contact** a
 * nudge with a fresh magic link when **staff send an outbound** message. The contact otherwise
 * has no signal there's something waiting (delivery is pull-only), mirroring how Cisco Secure
 * Email / TitanFile notify recipients.
 *
 * Delivery goes through MJ's `CommunicationEngine` using the provider configured via
 * `SECURE_MESSAGING_EMAIL_PROVIDER`. If the provider / from-address aren't configured, it
 * **no-ops gracefully** (logs and returns) — the app never hard-depends on a mailer.
 *
 * Inbound (contact → staff) notification is intentionally deferred to a fast-follow.
 */
export async function secureMessagingNotifier(event: MessageNotification): Promise<void> {
    // Only nudge the contact on staff → contact messages for now.
    if (event.direction !== 'Outbound') {
        return;
    }

    const { notify } = getSecureMessagingConfig();
    if (!notify.emailProvider || !notify.fromEmail) {
        // Not configured — no mailer. Stay silent-but-observable so deployments know why.
        LogStatus('Secure Messaging notify: skipped (SECURE_MESSAGING_EMAIL_PROVIDER / FROM_EMAIL not set).');
        return;
    }
    if (!event.contactEmail) {
        LogStatus('Secure Messaging notify: skipped (no contact email on the notification).');
        return;
    }

    try {
        const systemUser = await getSystemUser();

        // Mint a fresh single-use magic link for this thread's session so the contact can click in.
        let portalUrl = notify.portalBaseUrl;
        if (event.sessionId) {
            const link = await PortalAuthService.Instance.generateMagicLink(event.sessionId, systemUser);
            if (link.success && link.rawToken) {
                portalUrl = `${notify.portalBaseUrl}/?ml=${encodeURIComponent(link.rawToken)}`;
            }
        }

        const message = new Message();
        message.From = notify.fromEmail;
        message.FromName = notify.fromName;
        message.To = event.contactEmail;
        message.Subject = 'You have a new secure message';
        message.Body =
            `You have a new secure message waiting for you.\n\n` +
            `Open the secure portal to read and reply:\n${portalUrl}\n\n` +
            `This link is private to you. If you weren't expecting this, you can ignore it.`;
        message.HTMLBody =
            `<p>You have a new secure message waiting for you.</p>` +
            `<p><a href="${portalUrl}">Open the secure portal</a> to read and reply.</p>` +
            `<p style="color:#888;font-size:12px">This link is private to you. ` +
            `If you weren't expecting this, you can ignore it.</p>`;

        // Ensure the engine has metadata loaded (idempotent), then send via the configured provider.
        await CommunicationEngine.Instance.Config(false, systemUser);
        const result = await CommunicationEngine.Instance.SendSingleMessage(notify.emailProvider, 'Email', message);
        if (!result.Success) {
            LogError(`Secure Messaging notify: send failed via ${notify.emailProvider}: ${result.Error}`);
        } else {
            LogStatus(`Secure Messaging notify: nudged ${event.contactEmail} for thread ${event.threadId}.`);
        }
    } catch (e) {
        // A failing notifier must never break message persistence — swallow after logging.
        LogError(`Secure Messaging notify error: ${e instanceof Error ? e.message : String(e)}`);
    }
}
