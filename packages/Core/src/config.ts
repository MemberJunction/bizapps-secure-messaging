/**
 * Runtime configuration for the Secure Messaging app.
 *
 * The app is designed to be **app-agnostic** — its core runs in any MemberJunction
 * instance using only core entities (MJ: Files, MJ: Artifacts) plus the configured
 * contact entity. The message backend is pluggable: by default messages live in the
 * self-contained __mj_BizAppsSecureMessaging.SecureMessage table; when running inside an instance
 * that has the Channel Messages entity (e.g. Izzy), the 'channel' backend mirrors
 * messages there so they flow through the AI pipeline.
 */
export type MessageBackend = 'owned' | 'channel';

export interface SecureMessagingConfig {
    /**
     * Which message store to use.
     * - 'owned'   — self-contained __mj_BizAppsSecureMessaging.SecureMessage (default; no external deps)
     * - 'channel' — mirror into the 'Channel Messages' entity (requires that entity to exist)
     */
    messageBackend: MessageBackend;

    /**
     * Shared signing secret for the server-to-server **promote** endpoint (PRD §10). When set,
     * inbound promote calls (Izzy / the Outlook add-in backend) must present a valid
     * HMAC-SHA256 signature over `${timestamp}:${rawBody}` in the `x-sm-signature` header
     * (mirroring MJ's Slack signing-secret pattern). When empty, the promote REST route is
     * **disabled** (returns 503) — promotion is then only reachable via the authenticated
     * GraphQL RunAction surface. There is no insecure default.
     */
    promoteSecret: string;
}

/**
 * Reads config from environment variables with app-agnostic defaults.
 *   SECURE_MESSAGING_MESSAGE_BACKEND = 'owned' | 'channel'  (default 'owned')
 *   SECURE_MESSAGING_PROMOTE_SECRET  = <shared signing secret>  (default '' → promote REST disabled)
 */
export function loadSecureMessagingConfig(): SecureMessagingConfig {
    const backend = (process.env.SECURE_MESSAGING_MESSAGE_BACKEND || '').toLowerCase();
    return {
        messageBackend: backend === 'channel' ? 'channel' : 'owned',
        promoteSecret: process.env.SECURE_MESSAGING_PROMOTE_SECRET || '',
    };
}

let _config: SecureMessagingConfig | null = null;

/** Returns the singleton config, loading it from the environment on first use. */
export function getSecureMessagingConfig(): SecureMessagingConfig {
    if (!_config) {
        _config = loadSecureMessagingConfig();
    }
    return _config;
}

/** Overrides config (primarily for tests or programmatic bootstrap). */
export function setSecureMessagingConfig(config: Partial<SecureMessagingConfig>): void {
    _config = { ...getSecureMessagingConfig(), ...config };
}
