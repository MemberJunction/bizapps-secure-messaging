// Services
export { PortalAuthService } from './services/PortalAuthService.js';
export type { PortalSessionContext, MagicLinkResult, MagicLinkRedemptionResult } from './services/PortalAuthService.js';

// Communication Provider (auto-registers via @RegisterClass on import)
export { SecureWebCommunicationProvider } from './services/SecureWebCommunicationProvider.js';

// E-signature provider drivers (DocuSign / PandaDoc / Dropbox Sign). Importing each package
// runs its @RegisterClass(BaseSignatureProvider, '<DriverKey>') side-effect, so the MJ
// SignatureEngine can resolve the driver named by an MJ: Signature Provider's ServerDriverKey.
import '@memberjunction/esignature-docusign';
import '@memberjunction/esignature-pandadoc';
import '@memberjunction/esignature-dropboxsign';

// Server-side Actions (auto-register via @RegisterClass on import). Lets MJ-authenticated
// staff surfaces invoke server-only portal logic (e.g. issuing a magic link) through the
// data provider, instead of the contact-facing portal REST API.
export { IssuePortalMagicLinkAction } from './actions/IssuePortalMagicLinkAction.js';

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
