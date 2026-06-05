/**
 * Runtime configuration for the Secure Messaging app.
 *
 * The app is designed to be **app-agnostic** — its core runs in any MemberJunction
 * instance using only core entities (MJ: Files, MJ: Artifacts) plus the configured
 * contact entity. The message backend is pluggable: by default messages live in the
 * self-contained secure_messaging.SecureMessage table; when running inside an instance
 * that has the Channel Messages entity (e.g. Izzy), the 'channel' backend mirrors
 * messages there so they flow through the AI pipeline.
 */
export type MessageBackend = 'owned' | 'channel';

export interface SecureMessagingConfig {
    /**
     * Which message store to use.
     * - 'owned'   — self-contained secure_messaging.SecureMessage (default; no external deps)
     * - 'channel' — mirror into the 'Channel Messages' entity (requires that entity to exist)
     */
    messageBackend: MessageBackend;
}

/**
 * Reads config from environment variables with app-agnostic defaults.
 *   SECURE_MESSAGING_MESSAGE_BACKEND = 'owned' | 'channel'  (default 'owned')
 */
export function loadSecureMessagingConfig(): SecureMessagingConfig {
    const backend = (process.env.SECURE_MESSAGING_MESSAGE_BACKEND || '').toLowerCase();
    return {
        messageBackend: backend === 'channel' ? 'channel' : 'owned',
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
