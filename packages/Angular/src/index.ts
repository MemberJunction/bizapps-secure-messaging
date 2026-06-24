import { LogStatus } from '@memberjunction/core';
import { LoadSecureMessagingComponent } from './lib/secure-messaging-executive.resource';

// Module
export * from './lib/secure-messaging.module';

// Staff components & Application
export * from './lib/secure-messaging.contracts';
export * from './lib/secure-messaging-executive.component';
export * from './lib/secure-messaging-client-workspace.component';
export * from './lib/secure-messaging-action-panel.component';
export * from './lib/secure-messaging-executive.resource';
export * from './lib/secure-messaging.application';

// Shared conversation UI (used by the external widget + any host) + its data-source contract
export * from './lib/conversation/data-source';
export * from './lib/conversation/conversation.module';
export * from './lib/conversation/components/secure-messaging.component';
export * from './lib/conversation/components/conversation.component';
export * from './lib/conversation/components/compose-box.component';
export * from './lib/conversation/components/message-bubble.component';
export * from './lib/conversation/components/auth-view.component';
export * from './lib/conversation/services/api.service';
export * from './lib/conversation/services/auth.service';

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
