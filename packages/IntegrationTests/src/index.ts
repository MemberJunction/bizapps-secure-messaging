/**
 * @mj-biz-apps/secure-messaging-integration-tests
 *
 * Importing this module registers bundles on IntegrationCheckRegistry.
 *
 * BUNDLES
 *   messaging-world          CW1–CW7   commit multi-org SM-WORLD (orgs, people, threads, sessions, messages, versioned artifacts, files, requests)
 *   messaging-artifacts-rls  AR1–AR6   validate batched ArtifactFileStore + MessageFile.ArtifactID resolution & adversarial cross-tenant RLS isolation
 *
 * SM-WORLD COMMITS through typed BaseEntity subclasses. Never `test/seed-test-data.sql`.
 * Re-run to refresh relative dates.
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
import './checks/artifact-rls.checks.js';

export { MessagingWorldChecks } from './checks/world.checks.js';
export { MessagingArtifactRlsChecks } from './checks/artifact-rls.checks.js';
export * from './checks/artifact-resolution.js';
export * from './entity-names.js';
export * from './entity-io.js';
export * from './world/seed-fixtures.js';
export * from './world/world.js';
export * from './world/load-world.js';
