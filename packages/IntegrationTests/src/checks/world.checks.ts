/**
 * messaging-world — commit SM-WORLD and prove it is a living multi-org secure inbox
 * with versioned MJ Doc artifacts and binary fallback files.
 *
 * COMMITS. Re-run updates dates so the Executive Inbox and Client Workspace stay current.
 */
import {
    Assert,
    IntegrationCheckRegistry,
    type IntegrationCheckContext,
    type NamedCheck,
} from '@memberjunction/testing-integration/registry';
import {
    E_FILE_REQUEST,
    E_MAGIC,
    E_MESSAGE,
    E_MESSAGE_FILE,
    E_SESSION,
    E_THREAD,
    WORLD_MARK,
} from '../entity-names.js';
import { FindRows } from '../entity-io.js';
import { LoadWorld } from '../world/load-world.js';
import { BuildSeedDensityReport } from '../world/seed-fixtures.js';

export const MessagingWorldChecks: NamedCheck[] = [
    {
        Id: 'messaging-world.CW1',
        Name: 'CW1 — SM-WORLD is loaded: multi-org contacts, threads, sessions',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            Assert(Object.keys(world.Organizations).length >= 3, `expected >=3 orgs, got ${Object.keys(world.Organizations).length}`);
            Assert(Object.keys(world.People).length >= 12, `expected >=12 contacts, got ${Object.keys(world.People).length}`);
            Assert(!!world.People.nora && !!world.People.grace && !!world.People.priya && !!world.People.samantha, 'Required personas missing');
            Assert(Object.keys(world.Threads).length >= 12, `expected >=12 threads, got ${Object.keys(world.Threads).length}`);

            const threads = await FindRows<{ Subject: string; Status: string }>(
                ctx,
                E_THREAD,
                `Subject LIKE '${WORLD_MARK} — %'`,
                ['ID', 'Subject', 'Status'],
            );
            Assert(threads.length >= 12, `SM-WORLD threads: ${threads.length}`);
        },
    },
    {
        Id: 'messaging-world.CW2',
        Name: 'CW2 — Executive Inbox has New inbound (Nora dues + James invoice + Samantha HIPAA)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            const unread = await FindRows<{ Status: string; Direction: string }>(
                ctx,
                E_MESSAGE,
                `ThreadID IN ('${world.Threads.dues}', '${world.Threads.invoice}', '${world.Threads.meridianHipaa}') AND Direction = 'Inbound' AND Status = 'New'`,
                ['ID', 'Status', 'Direction'],
            );
            Assert(unread.length >= 3, `New inbound on dues/invoice/meridianHipaa: ${unread.length}`);
        },
    },
    {
        Id: 'messaging-world.CW3',
        Name: 'CW3 — Grace & Priya have Pending file requests (the portal callout)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            const rows = await FindRows<{ Status: string; Title: string }>(
                ctx,
                E_FILE_REQUEST,
                `ThreadID IN ('${world.Threads.w9}', '${world.Threads.northstarEngagement}') AND Status = 'Pending'`,
                ['ID', 'Status', 'Title'],
            );
            Assert(rows.length >= 2, `Pending file requests: ${rows.length}`);
        },
    },
    {
        Id: 'messaging-world.CW4',
        Name: 'CW4 — Jordan’s thread was promoted from Email (imported history)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            const threads = await FindRows<{ SourceChannel: string | null }>(
                ctx,
                E_THREAD,
                `ID = '${world.Threads.promote}'`,
                ['ID', 'SourceChannel'],
            );
            Assert(threads.length === 1, 'promote thread missing');
            Assert(threads[0].SourceChannel === 'Email', `SourceChannel ${threads[0].SourceChannel}, expected Email`);

            const imported = await FindRows<{ IsImported: boolean }>(
                ctx,
                E_MESSAGE,
                `ThreadID = '${world.Threads.promote}' AND IsImported = 1`,
                ['ID', 'IsImported'],
            );
            Assert(imported.length >= 1, 'promoted thread should keep imported history');
        },
    },
    {
        Id: 'messaging-world.CW5',
        Name: 'CW5 — Nora Active, James Expired + Pending magic link, Omar Revoked',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            const nora = await FindRows<{ Status: string }>(
                ctx,
                E_SESSION,
                `ID = '${world.Sessions.nora}'`,
                ['ID', 'Status'],
            );
            Assert(nora[0]?.Status === 'Active', `Nora session ${nora[0]?.Status}, expected Active`);

            const james = await FindRows<{ Status: string }>(
                ctx,
                E_SESSION,
                `ID = '${world.Sessions.james}'`,
                ['ID', 'Status'],
            );
            Assert(james[0]?.Status === 'Expired', `James session ${james[0]?.Status}, expected Expired`);

            const omar = await FindRows<{ Status: string }>(
                ctx,
                E_SESSION,
                `ID = '${world.Sessions.omar}'`,
                ['ID', 'Status'],
            );
            Assert(omar[0]?.Status === 'Revoked', `Omar session ${omar[0]?.Status}, expected Revoked`);

            const links = await FindRows<{ Status: string }>(
                ctx,
                E_MAGIC,
                `ID = '${world.MagicLinks.james}' AND Status = 'Pending'`,
                ['ID', 'Status'],
            );
            Assert(links.length >= 1, 'James should have a pending magic link');
        },
    },
    {
        Id: 'messaging-world.CW6',
        Name: 'CW6 — Starred (Ada), Closed (Alan), Archived (Marcus), Fulfilled request (Ada)',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            const starred = await FindRows<{ IsStarred: boolean }>(
                ctx,
                E_MESSAGE,
                `ThreadID = '${world.Threads.manuscript}' AND IsStarred = 1`,
                ['ID', 'IsStarred'],
            );
            Assert(starred.length >= 1, 'Ada manuscript should be starred');

            const closed = await FindRows<{ Status: string }>(
                ctx,
                E_THREAD,
                `ID = '${world.Threads.deskcopy}'`,
                ['ID', 'Status'],
            );
            Assert(closed[0]?.Status === 'Closed', `desk copy ${closed[0]?.Status}, expected Closed`);

            const archived = await FindRows<{ Status: string }>(
                ctx,
                E_THREAD,
                `ID = '${world.Threads.quote}'`,
                ['ID', 'Status'],
            );
            Assert(archived[0]?.Status === 'Archived', `quote ${archived[0]?.Status}, expected Archived`);

            const fulfilled = await FindRows<{ Status: string }>(
                ctx,
                E_FILE_REQUEST,
                `ThreadID = '${world.Threads.manuscript}' AND Status = 'Fulfilled'`,
                ['ID', 'Status'],
            );
            Assert(fulfilled.length >= 1, 'Ada chapter-12 request should be Fulfilled');
        },
    },
    {
        Id: 'messaging-world.CW7',
        Name: 'CW7 — Versioned MJ Doc MessageFiles (ArtifactID) and binary fallback MessageFiles coexist cleanly',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const world = await LoadWorld(ctx);
            const density = BuildSeedDensityReport();
            Assert(density.overallPassed, `Seed density failed: ${density.pillars.seedDensity.violations.join('; ')}`);

            const files = await FindRows<{ ID: string; ArtifactID: string | null; Filename: string }>(
                ctx,
                E_MESSAGE_FILE,
                `Filename LIKE '${WORLD_MARK}-%'`,
                ['ID', 'ArtifactID', 'Filename'],
            );
            const artifactBacked = files.filter((f) => Boolean(f.ArtifactID));
            const binaryFallback = files.filter((f) => !f.ArtifactID);
            Assert(artifactBacked.length >= 6, `Expected >=6 artifact-backed MessageFiles, got ${artifactBacked.length}`);
            Assert(binaryFallback.length >= 4, `Expected >=4 binary fallback MessageFiles, got ${binaryFallback.length}`);
            Assert(Object.keys(world.ArtifactVersions).length >= 10, 'Expected >=10 seeded artifact versions');
        },
    },
];

for (const check of MessagingWorldChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle('messaging-world', {
    Setup: async () => undefined,
    Teardown: async () => undefined,
});
