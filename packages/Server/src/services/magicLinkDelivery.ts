import { LogError, LogStatus, UserInfo } from '@memberjunction/core';
import { CommunicationEngine } from '@memberjunction/communication-engine';
import { Message } from '@memberjunction/communication-types';
import { PortalAuthService, getSecureMessagingConfig } from '@mj-biz-apps/secure-messaging-core';

/** Copy for the sign-in email whose body wraps the freshly-minted magic link. */
export interface MagicLinkEmailContent {
    subject: string;
    /** Plain-text intro line(s) shown above the link. */
    introText: string;
    /** HTML intro markup shown above the link. */
    introHtml: string;
}

/**
 * Mints a fresh single-use magic link on `sessionId` and emails it **out-of-band** to the session
 * contact's verified address. Returns true only when an email was actually sent.
 *
 * This is the safe delivery path for the (unauthenticated) magic-link request endpoint: the raw
 * token is NEVER returned to the caller — it can only reach the contact's own inbox — which is what
 * defeats the account-takeover where an attacker requested a link for a guessed session ID and read
 * the token straight out of the HTTP response.
 *
 * It degrades gracefully to a logged no-op (returning false) when the mailer isn't configured, the
 * session/contact can't be resolved, or the send fails — so a caller can always return the same
 * neutral acknowledgement regardless of outcome (which also prevents session-ID enumeration).
 */
export async function deliverMagicLinkEmail(
    sessionId: string,
    content: MagicLinkEmailContent,
    systemUser: UserInfo,
    deepLinkThreadId?: string,
): Promise<boolean> {
    const { notify } = getSecureMessagingConfig();
    if (!notify.emailProvider || !notify.fromEmail) {
        LogStatus('Secure Messaging magic link: skipped (email provider / from address not configured).');
        return false;
    }

    const contactEmail = await PortalAuthService.Instance.getSessionContactEmail(sessionId, systemUser);
    if (!contactEmail) {
        // Unknown/inactive session, or no email on file — stay silent-but-observable.
        LogStatus('Secure Messaging magic link: skipped (no active session / contact email).');
        return false;
    }

    const link = await PortalAuthService.Instance.generateMagicLink(sessionId, systemUser, deepLinkThreadId);
    if (!link.success || !link.rawToken) {
        LogError(`Secure Messaging magic link: mint failed: ${link.errorMessage ?? 'unknown error'}`);
        return false;
    }
    const portalUrl = `${notify.portalBaseUrl}/?ml=${encodeURIComponent(link.rawToken)}`;

    const message = new Message();
    message.From = notify.fromEmail;
    message.FromName = notify.fromName;
    message.To = contactEmail;
    message.Subject = content.subject;
    message.Body =
        `${content.introText}\n\n` +
        `Open the secure portal:\n${portalUrl}\n\n` +
        `This link is private to you. If you weren't expecting this, you can ignore it.`;
    message.HTMLBody =
        `${content.introHtml}` +
        `<p><a href="${portalUrl}">Open the secure portal</a>.</p>` +
        `<p style="color:#888;font-size:12px">This link is private to you. ` +
        `If you weren't expecting this, you can ignore it.</p>`;

    try {
        await CommunicationEngine.Instance.Config(false, systemUser);
        const result = await CommunicationEngine.Instance.SendSingleMessage(notify.emailProvider, 'Email', message);
        if (!result.Success) {
            LogError(`Secure Messaging magic link: send failed via ${notify.emailProvider}: ${result.Error}`);
            return false;
        }
        LogStatus(`Secure Messaging magic link: delivered to ${contactEmail}.`);
        return true;
    } catch (e) {
        LogError(`Secure Messaging magic link delivery error: ${e instanceof Error ? e.message : String(e)}`);
        return false;
    }
}
