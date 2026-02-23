import { LogStatus } from '@memberjunction/core';

/**
 * Client-side bootstrap function for MJ Secure Messaging.
 * Called by MJ's dynamic package loader during client startup.
 *
 * The Angular Element widget (<mj-secure-messaging>) is a standalone
 * bundle — it does not need to be loaded through the MJ Explorer build.
 * This bootstrap is a placeholder for any future client-side class
 * registrations needed by the MJ Explorer UI.
 */
export function LoadSecureMessagingClient(): void {
    LogStatus('MJ Secure Messaging: Client bootstrap loaded.');
}
