import { LogStatus } from '@memberjunction/core';
import { LoadSecureMessagingComponent } from './lib/secure-messaging-executive.resource';

// Module
export * from './lib/secure-messaging.module';

// Components & Application
export * from './lib/secure-messaging-executive.component';
export * from './lib/secure-messaging-client-workspace.component';
export * from './lib/secure-messaging-executive.resource';
export * from './lib/secure-messaging.application';

/**
 * Client-side bootstrap function for MJ Secure Messaging.
 * Called by MJ's dynamic package loader during client startup.
 * Registers both the Executive resource component and the SecureMessagingApplication
 * in MJ Explorer's ClassFactory via @RegisterClass decorators.
 */
export function LoadSecureMessagingClient(): void {
    LoadSecureMessagingComponent();
    LogStatus('MJ Secure Messaging: Client bootstrap loaded.');
}
