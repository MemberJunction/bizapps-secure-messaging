// Services
export { PortalAuthService } from './services/PortalAuthService.js';
export type { PortalSessionContext, MagicLinkResult, MagicLinkRedemptionResult } from './services/PortalAuthService.js';

// Communication Provider (auto-registers via @RegisterClass on import)
export { SecureWebCommunicationProvider } from './services/SecureWebCommunicationProvider.js';

// Signature Provider boundary (DocuSign stub auto-registers via @RegisterClass on import)
export { BaseSignatureProvider, DocuSignSignatureProvider } from './services/SignatureProvider.js';
export type {
    CreateEnvelopeParams,
    CreateEnvelopeResult,
    EnvelopeStatusResult,
} from './services/SignatureProvider.js';

// File store + message store abstractions (app-agnostic core)
export { ArtifactFileStore, getFileStore } from './stores/ArtifactFileStore.js';
export { getMessageStore, OwnedMessageStore, ChannelMessageStore } from './stores/index.js';
export type { MessageStore, SecureMessageView } from './stores/index.js';
export { getSecureMessagingConfig, setSecureMessagingConfig } from './config.js';
export type { SecureMessagingConfig, MessageBackend } from './config.js';

// Express Router
export { createSecureMessagingRouter, mountSecureMessagingRoutes } from './routes.js';

// Middleware types
export type { PortalRequest } from './handlers/middleware.js';
