/**
 * messaging-artifacts-rls — end-to-end cross-stack ArtifactFileStore.ts + MessageFile.ArtifactID
 * resolution and adversarial cross-tenant RLS boundary checks.
 *
 * Tests existing RLS/security enforcement without modifying auth, security, or migrations paths.
 */
import {
    Assert,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration/registry';
import { ArtifactFileStore } from '@mj-biz-apps/secure-messaging-core';
import { E_ARTIFACT, E_ARTIFACT_VERSION, E_MESSAGE_FILE } from '../entity-names.js';
import { FindRowsByIds } from '../entity-io.js';
import { LoadWorld } from '../world/load-world.js';
import { BuildSeedDensityReport } from '../world/seed-fixtures.js';
import {
    BatchResolveThreadMessageFileArtifacts,
    EvaluateCrossTenantArtifactBoundary,
    VerifyAuthorizedTenantArtifactResolution,
    type ArtifactSummaryRow,
    type ArtifactVersionSummaryRow,
} from './artifact-resolution.js';

export const MessagingArtifactRlsChecks: NamedCheck[] = [
    {
        Id: 'messaging-artifacts-rls.AR1',
        Name: 'AR1 — Seed density meets >=20 multi-entity records across >=3 orgs, roles, periods, and versioned artifacts',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            const report = BuildSeedDensityReport();
            Assert(report.overallPassed, `Seed density violations: ${report.pillars.seedDensity.violations.join('; ')}`);
            Assert(report.totalRecords >= 20, `Expected >=20 seed records, got ${report.totalRecords}`);
            Assert(report.organizationsCount >= 3, `Expected >=3 organizations, got ${report.organizationsCount}`);

            const artifactIds = Object.values(world.Artifacts);
            Assert(artifactIds.length >= 6, `Expected >=6 seeded MJ: Artifacts, got ${artifactIds.length}`);

            const persistedArtifacts = await FindRowsByIds<ArtifactSummaryRow>(
                ctx,
                E_ARTIFACT,
                'ID',
                artifactIds,
                ['ID', 'Name', 'Description', 'TypeID', 'UserID'],
            );
            Assert(
                persistedArtifacts.length === artifactIds.length,
                `Expected ${artifactIds.length} persisted MJ: Artifacts, got ${persistedArtifacts.length}`,
            );

            const persistedVersions = await FindRowsByIds<ArtifactVersionSummaryRow>(
                ctx,
                E_ARTIFACT_VERSION,
                'ArtifactID',
                artifactIds,
                ['ID', 'ArtifactID', 'VersionNumber', 'Name', 'ContentMode', 'MimeType'],
                'VersionNumber DESC',
            );
            Assert(
                persistedVersions.length >= 10,
                `Expected >=10 persisted MJ: Artifact Versions, got ${persistedVersions.length}`,
            );
        },
    },
    {
        Id: 'messaging-artifacts-rls.AR2',
        Name: 'AR2 — Authorized Org A (Northstar) participant resolves MessageFile.ArtifactID v2 deliverable end-to-end via batched RunView',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            const { threadStatus, resolution } = await VerifyAuthorizedTenantArtifactResolution(
                ctx,
                world.People.priya.ID,
                world.Threads.northstarEngagement,
            );

            Assert(threadStatus === 'Active', `Expected Active Northstar thread, got ${threadStatus}`);
            Assert(resolution.artifactCount >= 1, `Expected >=1 artifact-linked file, got ${resolution.artifactCount}`);
            Assert(resolution.binaryFallbackCount >= 1, `Expected >=1 binary fallback file, got ${resolution.binaryFallbackCount}`);
            Assert(resolution.batchedQueryChunks === 1, `Expected 1 batched IN-clause chunk, got ${resolution.batchedQueryChunks}`);

            const msaAttachment = resolution.attachments.find(
                (a) => a.artifactId?.toLowerCase() === world.Artifacts.northstarMsaDoc.toLowerCase(),
            );
            Assert(!!msaAttachment, 'Northstar MSA MessageFile.ArtifactID attachment missing');
            Assert(msaAttachment.kind === 'artifact', `Expected kind=artifact, got ${msaAttachment.kind}`);
            Assert(msaAttachment.latestVersionNumber === 2, `Expected latest version 2, got ${msaAttachment.latestVersionNumber}`);
            Assert(
                (msaAttachment.latestVersionContent ?? '').includes('Section 4.2'),
                'Expected v2 MSA content containing Section 4.2',
            );
        },
    },
    {
        Id: 'messaging-artifacts-rls.AR3',
        Name: 'AR3 — Adversarial Org B (Meridian) caller is rejected from Org A (Northstar) thread, MessageFile, and viewer cache',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            const audit = await EvaluateCrossTenantArtifactBoundary(ctx, {
                victimContactId: world.People.priya.ID,
                victimThreadId: world.Threads.northstarEngagement,
                victimMessageFileId: world.MessageFiles.northstarMsaFile,
                attackerContactId: world.People.samantha.ID,
                attackerThreadId: world.Threads.meridianHipaa,
            });

            Assert(
                audit.threadAccessDenied,
                `Org B caller unexpectedly received thread status '${audit.threadStatusResult}' on Org A thread`,
            );
            Assert(
                audit.crossThreadDownloadRejected,
                'Org B caller was not rejected when requesting Org A MessageFile ID against Org B thread',
            );
            Assert(
                /not found/i.test(audit.crossThreadDownloadError),
                `Unexpected cross-thread rejection error: ${audit.crossThreadDownloadError}`,
            );
            Assert(
                audit.cacheIsolatedOnViewerSwitch,
                'SecureMessagingEngineBase thread cache failed to isolate Org A window when switching to Org B viewerScopeKey',
            );
        },
    },
    {
        Id: 'messaging-artifacts-rls.AR4',
        Name: 'AR4 — Adversarial Org A caller cannot enumerate or resolve Org B (Meridian HIPAA) MessageFile.ArtifactID records',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            const audit = await EvaluateCrossTenantArtifactBoundary(ctx, {
                victimContactId: world.People.samantha.ID,
                victimThreadId: world.Threads.meridianHipaa,
                victimMessageFileId: world.MessageFiles.meridianHipaaFile,
                attackerContactId: world.People.derek.ID,
                attackerThreadId: world.Threads.northstarAudit,
            });

            Assert(audit.threadAccessDenied, 'Org A caller unexpectedly accessed Org B HIPAA thread');
            Assert(audit.crossThreadDownloadRejected, 'Org A caller unexpectedly downloaded Org B HIPAA MessageFile');
            Assert(audit.cacheIsolatedOnViewerSwitch, 'Cache isolation failed between Org B and Org A viewers');
        },
    },
    {
        Id: 'messaging-artifacts-rls.AR5',
        Name: 'AR5 — Authorized Org B (Meridian) participant resolves own HIPAA BAA v2 artifact end-to-end',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            const { threadStatus, resolution } = await VerifyAuthorizedTenantArtifactResolution(
                ctx,
                world.People.samantha.ID,
                world.Threads.meridianHipaa,
            );
            Assert(threadStatus === 'Active', `Expected Active Meridian thread, got ${threadStatus}`);
            const hipaaDoc = resolution.attachments.find(
                (a) => a.artifactId?.toLowerCase() === world.Artifacts.meridianHipaaBaaDoc.toLowerCase(),
            );
            Assert(!!hipaaDoc, 'Meridian HIPAA BAA artifact attachment missing');
            Assert(hipaaDoc.latestVersionNumber === 2, `Expected HIPAA BAA v2, got ${hipaaDoc.latestVersionNumber}`);
        },
    },
    {
        Id: 'messaging-artifacts-rls.AR6',
        Name: 'AR6 — Non-artifact binary MessageFiles (ArtifactID = null) resolve cleanly to binary-fallback without artifact lookup',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            const store = new ArtifactFileStore();
            const resolution = await BatchResolveThreadMessageFileArtifacts(ctx, world.Threads.invoice, store);

            Assert(resolution.artifactCount === 0, `Expected 0 artifact attachments on invoice thread, got ${resolution.artifactCount}`);
            Assert(resolution.binaryFallbackCount >= 1, `Expected >=1 binary fallback attachment on invoice thread`);
            Assert(resolution.batchedQueryChunks === 0, `Expected 0 artifact IN-clause queries for non-artifact thread, got ${resolution.batchedQueryChunks}`);

            const binaryFiles = await FindRowsByIds<{ ID: string; ArtifactID: string | null }>(
                ctx,
                E_MESSAGE_FILE,
                'ID',
                [
                    world.MessageFiles.manuscriptPdfBinary,
                    world.MessageFiles.northstarWetInkScan,
                    world.MessageFiles.meridianIntakeZip,
                    world.MessageFiles.invoiceReceiptPdf,
                ],
                ['ID', 'ArtifactID'],
            );
            Assert(binaryFiles.length === 4, `Expected 4 non-artifact binary MessageFiles, got ${binaryFiles.length}`);
            for (const row of binaryFiles) {
                Assert(row.ArtifactID === null, `Binary fallback file ${row.ID} unexpectedly has ArtifactID=${row.ArtifactID}`);
            }
        },
    },
];

for (const check of MessagingArtifactRlsChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('messaging-artifacts-rls', {
    Setup: async () => undefined,
    Teardown: async () => undefined,
});
