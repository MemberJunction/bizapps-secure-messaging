/**
 * MemberJunction API Server (MJ minimal architecture) — test harness for MJ Secure Messaging.
 * All initialization logic lives in @memberjunction/server-bootstrap.
 */
import { createMJServer } from '@memberjunction/server-bootstrap';

// Import the Secure Messaging server bootstrap (registers entities, actions, resolvers,
// the SecureWebCommunicationProvider, and the SecureMessagingMiddleware that mounts the
// portal REST API pre-auth). RESOLVER_PATHS feeds the host's schema build.
import { RESOLVER_PATHS as SECURE_MESSAGING_RESOLVER_PATHS, LoadSecureMessagingServer } from '@mj-biz-apps/secure-messaging-server';

// BizAppsCommon server: registers the shared common entities (People, etc.) and serves their
// GraphQL resolvers. Secure Messaging references MJ_BizApps_Common: People, so the host MUST
// load these resolvers or client-side Person.Load() fails with "Cannot query field
// mjBizAppsCommonPerson on type Query".
import { RESOLVER_PATHS as COMMON_RESOLVER_PATHS, LoadBizAppsCommonServer } from '@mj-biz-apps/common-server';

// Anchor the bootstraps so every @RegisterClass side-effect is guaranteed to fire.
LoadSecureMessagingServer();
LoadBizAppsCommonServer();

const RESOLVER_PATHS = [
  ...COMMON_RESOLVER_PATHS,
  ...SECURE_MESSAGING_RESOLVER_PATHS,
];

// Pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import '@memberjunction/server-bootstrap/mj-class-registrations';

// Start the server
createMJServer({ resolverPaths: RESOLVER_PATHS }).catch(console.error);
