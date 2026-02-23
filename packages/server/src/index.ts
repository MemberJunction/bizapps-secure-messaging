// Services
export { PortalAuthService } from './services/PortalAuthService.js';
export type { PortalSessionContext, MagicLinkResult, MagicLinkRedemptionResult } from './services/PortalAuthService.js';

// Communication Provider (auto-registers via @RegisterClass on import)
export { SecureWebCommunicationProvider } from './services/SecureWebCommunicationProvider.js';

// Express Router
export { createSecureMessagingRouter, mountSecureMessagingRoutes } from './routes.js';

// Middleware types
export type { PortalRequest } from './handlers/middleware.js';
