/**
 * MemberJunction API Server (MJ minimal architecture) — test harness for MJ Secure Messaging.
 * All initialization logic lives in @memberjunction/server-bootstrap.
 */
import { createMJServer } from '@memberjunction/server-bootstrap';

// Import the Secure Messaging server bootstrap (registers entities, actions, resolvers,
// the SecureWebCommunicationProvider, and the SecureMessagingMiddleware that mounts the
// portal REST API pre-auth). RESOLVER_PATHS feeds the host's schema build.
import { RESOLVER_PATHS as SECURE_MESSAGING_RESOLVER_PATHS, LoadSecureMessagingServer } from '@mj-biz-apps/secure-messaging-server';

// Anchor the bootstrap so every @RegisterClass side-effect is guaranteed to fire.
LoadSecureMessagingServer();

const RESOLVER_PATHS = [
  ...SECURE_MESSAGING_RESOLVER_PATHS,
];

// Pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import '@memberjunction/server-bootstrap/mj-class-registrations';

// Start the server
createMJServer({ resolverPaths: RESOLVER_PATHS }).catch(console.error);
