/**
 * @mj-biz-apps/secure-messaging-integration-tests
 *
 * Importing this module registers bundles on IntegrationCheckRegistry.
 *
 * BUNDLES
 *   messaging-world   CW1–CW6   commit SM-WORLD (people, threads, sessions, messages, requests)
 *
 * SM-WORLD COMMITS through BaseEntity. Never `test/seed-test-data.sql`.
 * Re-run to refresh relative dates. Other bundles (when added) should roll back.
 */
import { LoadGeneratedEntities as LoadCommonEntities } from '@mj-biz-apps/common-entities';
import { LoadGeneratedEntities } from '@mj-biz-apps/secure-messaging-entities';
import { LoadSecureMessagingServer } from '@mj-biz-apps/secure-messaging-server';

// People / Organizations — without this, ClassFactory falls back to raw BaseEntity
// (same registration Orders does for the party directory).
LoadCommonEntities();
LoadGeneratedEntities();
LoadSecureMessagingServer();

import './checks/world.checks.js';

export { MessagingWorldChecks } from './checks/world.checks.js';
export * from './entity-names.js';
export * from './entity-io.js';
export * from './world/world.js';
export * from './world/load-world.js';
