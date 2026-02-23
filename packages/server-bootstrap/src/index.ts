import { LogStatus } from '@memberjunction/core';

// Side-effect import: triggers @RegisterClass for SecureWebCommunicationProvider
import '@memberjunction/secure-messaging-server';

/**
 * Bootstrap function called by MJ server during dynamic package loading.
 * Registered via mj-app.json manifest: packages.server[].startupExport.
 *
 * The import of @memberjunction/secure-messaging-server above handles
 * all @RegisterClass registrations (SecureWebCommunicationProvider).
 */
export function LoadSecureMessaging(): void {
    LogStatus('MJ Secure Messaging: Server bootstrap loaded.');
}
