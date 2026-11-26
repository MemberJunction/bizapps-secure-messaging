import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    BaseEntity,
    EntityInfo,
    IMetadataProvider,
    Metadata,
    RunView,
    RunViewParams,
    RunViewResult,
    UserInfo,
} from '@memberjunction/core';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration/registry';
import type { Request, Response } from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ArtifactFileStore,
    PortalAuthService,
} from '@mj-biz-apps/secure-messaging-core';
import { SecureMessagingEngineBase } from '@mj-biz-apps/secure-messaging-entities';
import type { PortalRequest } from '@mj-biz-apps/secure-messaging-server';
import {
    downloadAttachment,
    getThreadAttachments,
} from '../../../Server/dist/handlers/attachments.js';

interface UserCacheStatic {
    Instance: {
        GetSystemUser: () => UserInfo;
    };
}

function loadServerUserCache(): UserCacheStatic {
    const serverPkgPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../../Server/package.json');
    const req = createRequire(serverPkgPath);
    const mod = req('@memberjunction/sqlserver-dataprovider') as { UserCache: UserCacheStatic };
    return mod.UserCache;
}
import {
    E_ARTIFACT,
    E_ARTIFACT_TYPE,
    E_ARTIFACT_VERSION,
    E_FILE_REQUEST,
    E_MAGIC,
    E_MESSAGE,
    E_MESSAGE_FILE,
    E_ORGANIZATION,
    E_PERSON,
    E_SESSION,
    E_THREAD,
} from '../entity-names.js';
import { BuildInClause, ChunkIds, IN_CLAUSE_CHUNK_SIZE } from '../entity-io.js';
import {
    BuildSeedDensityReport,
    WORLD_ARTIFACTS,
    WORLD_ARTIFACT_VERSIONS,
    WORLD_FILE_REQUESTS,
    WORLD_MAGIC_LINKS,
    WORLD_MESSAGES,
    WORLD_MESSAGE_FILES,
    WORLD_ORGANIZATIONS,
    WORLD_PEOPLE,
    WORLD_THREADS,
} from '../world/seed-fixtures.js';
import { LoadWorld } from '../world/load-world.js';
import {
    BatchResolveThreadMessageFileArtifacts,
    EvaluateCrossTenantArtifactBoundary,
    VerifyAuthorizedTenantArtifactResolution,
} from '../checks/artifact-resolution.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INTEGRATION_SRC_DIR = resolve(__dirname, '..');

interface StoredEntityRow {
    ID: string;
    [field: string]: string | number | boolean | Date | null | undefined;
}

function makeUuid(prefixHex: string, index: number): string {
    const suffix = index.toString(16).padStart(12, '0');
    return `${prefixHex}-4000-8000-8000-${suffix}`;
}

/**
 * Realistic multi-tenant in-memory MJ provider that evaluates RunView / RunViews filters
 * (including `=`, `AND`, `IN (...)`, `LIKE`) and tracks BaseEntity save order for FK verification.
 */
class InMemoryWorldHarness {
    public readonly tables = new Map<string, StoredEntityRow[]>();
    public readonly saveOrder: string[] = [];
    public readonly runViewCalls: RunViewParams[] = [];
    public readonly runViewsBatches: RunViewParams[][] = [];
    public getSetCallCount = 0;
    private seq = 1;

    constructor(public readonly systemUser: UserInfo) {
        this.tables.set(E_ARTIFACT_TYPE, [
            { ID: makeUuid('10000001', 1), Name: 'Markdown', ContentType: 'text/markdown', Priority: 90, IsEnabled: true },
            { ID: makeUuid('10000001', 2), Name: 'JSON', ContentType: 'application/json', Priority: 85, IsEnabled: true },
            { ID: makeUuid('10000001', 3), Name: 'Document', ContentType: 'application/pdf', Priority: 50, IsEnabled: true },
        ]);
    }

    public seedPrebuiltWorld(): {
        orgIds: Record<string, string>;
        personIds: Record<string, string>;
        threadIds: Record<string, string>;
        sessionIds: Record<string, string>;
        messageIds: Record<string, string>;
        artifactIds: Record<string, string>;
        artifactVersionIds: Record<string, string>;
        messageFileIds: Record<string, string>;
    } {
        const orgIds: Record<string, string> = {};
        WORLD_ORGANIZATIONS.forEach((org, i) => {
            const id = makeUuid('20000001', i + 1);
            orgIds[org.key] = id;
            this.insertRow(E_ORGANIZATION, { ID: id, Name: org.name, Status: org.status });
        });

        const personIds: Record<string, string> = {};
        WORLD_PEOPLE.forEach((p, i) => {
            const id = makeUuid('20000002', i + 1);
            personIds[p.key] = id;
            this.insertRow(E_PERSON, {
                ID: id,
                FirstName: p.first,
                LastName: p.last,
                Email: p.email,
                Title: p.title,
                Status: p.personStatus,
            });
        });

        const threadIds: Record<string, string> = {};
        WORLD_THREADS.forEach((t, i) => {
            const id = makeUuid('20000003', i + 1);
            threadIds[t.key] = id;
            this.insertRow(E_THREAD, {
                ID: id,
                ContactID: personIds[t.contactKey],
                Subject: t.subject,
                Status: t.status,
                SourceChannel: t.sourceChannel,
                CreatedByUserID: this.systemUser.ID,
                IsDeleted: false,
            });
        });

        const sessionIds: Record<string, string> = {};
        WORLD_PEOPLE.forEach((p, i) => {
            const id = makeUuid('20000004', i + 1);
            sessionIds[p.key] = id;
            this.insertRow(E_SESSION, {
                ID: id,
                ContactID: personIds[p.key],
                Status: p.sessionStatus,
            });
        });

        const messageIds: Record<string, string> = {};
        WORLD_MESSAGES.forEach((m, i) => {
            const id = makeUuid('20000005', i + 1);
            messageIds[m.key] = id;
            this.insertRow(E_MESSAGE, {
                ID: id,
                PortalSessionID: sessionIds[m.contactKey],
                ThreadID: threadIds[m.threadKey],
                PersonID: personIds[m.contactKey],
                Direction: m.direction,
                Sender: m.direction === 'Inbound' ? `${m.contactKey}@com-world.test` : 'staff@bluecypress.example',
                Recipient: m.direction === 'Inbound' ? 'staff@bluecypress.example' : `${m.contactKey}@com-world.test`,
                Subject: null,
                Content: `<!--sm-world:${m.key}-->\n${m.body}`,
                IsSecure: true,
                Status: m.status,
                ReceivedAt: new Date(Date.now() - m.receivedOffsetHours * 3_600_000).toISOString(),
                IsStarred: m.starred,
                IsImported: m.imported,
                SourceChannel: m.sourceChannel,
            });
        });

        const artifactIds: Record<string, string> = {};
        WORLD_ARTIFACTS.forEach((a, i) => {
            const id = makeUuid('20000006', i + 1);
            artifactIds[a.key] = id;
            this.insertRow(E_ARTIFACT, {
                ID: id,
                Name: a.name,
                Description: a.description,
                TypeID: makeUuid('10000001', a.mimeType === 'application/json' ? 2 : 1),
                UserID: this.systemUser.ID,
            });
        });

        const artifactVersionIds: Record<string, string> = {};
        WORLD_ARTIFACT_VERSIONS.forEach((v, i) => {
            const id = makeUuid('20000007', i + 1);
            artifactVersionIds[v.key] = id;
            this.insertRow(E_ARTIFACT_VERSION, {
                ID: id,
                ArtifactID: artifactIds[v.artifactKey],
                VersionNumber: v.versionNumber,
                Name: v.name,
                Description: v.description,
                ContentMode: 'Text',
                MimeType: v.mimeType,
                Content: v.content,
                FileID: null,
                ContentSizeBytes: Buffer.byteLength(v.content, 'utf8'),
                UserID: this.systemUser.ID,
            });
        });

        const messageFileIds: Record<string, string> = {};
        WORLD_MESSAGE_FILES.forEach((mf, i) => {
            const id = makeUuid('20000008', i + 1);
            messageFileIds[mf.key] = id;
            this.insertRow(E_MESSAGE_FILE, {
                ID: id,
                SecureMessageID: messageIds[mf.messageKey],
                ExternalMessageID: null,
                ThreadID: threadIds[mf.threadKey],
                ArtifactID: mf.artifactKey ? artifactIds[mf.artifactKey] : null,
                FileID: makeUuid('20000009', i + 1),
                Filename: mf.filename,
                ContentType: mf.contentType,
                Size: mf.size,
                __mj_CreatedAt: new Date(Date.now() - (i + 1) * 60_000).toISOString(),
            });
        });

        return {
            orgIds,
            personIds,
            threadIds,
            sessionIds,
            messageIds,
            artifactIds,
            artifactVersionIds,
            messageFileIds,
        };
    }

    public insertRow(entityName: string, row: StoredEntityRow): void {
        const list = this.tables.get(entityName) ?? [];
        const existingIdx = list.findIndex((r) => r.ID.toLowerCase() === row.ID.toLowerCase());
        if (existingIdx >= 0) {
            list[existingIdx] = { ...list[existingIdx], ...row };
        } else {
            list.push({ ...row });
        }
        this.tables.set(entityName, list);
    }

    public query(params: RunViewParams): RunViewResult<StoredEntityRow> {
        const rows = this.tables.get(params.EntityName) ?? [];
        let filtered = rows.filter((row) => matchesSqlFilter(row, params.ExtraFilter ?? ''));

        if (params.OrderBy) {
            const [rawField, rawDir] = params.OrderBy.trim().split(/\s+/);
            const desc = (rawDir ?? 'ASC').toUpperCase() === 'DESC';
            filtered = [...filtered].sort((a, b) => {
                const av = a[rawField];
                const bv = b[rawField];
                if (av === bv) return 0;
                if (av == null) return desc ? 1 : -1;
                if (bv == null) return desc ? -1 : 1;
                if (typeof av === 'number' && typeof bv === 'number') {
                    return desc ? bv - av : av - bv;
                }
                return desc ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
            });
        }

        if (params.MaxRows !== undefined && params.MaxRows > 0) {
            filtered = filtered.slice(0, params.MaxRows);
        }

        const projected = params.Fields && params.Fields.length > 0
            ? filtered.map((row) => {
                const out: StoredEntityRow = { ID: row.ID };
                for (const field of params.Fields ?? []) {
                    out[field] = row[field] ?? null;
                }
                return out;
            })
            : filtered.map((row) => ({ ...row }));

        return {
            Success: true,
            Results: projected,
            UserViewID: '',
            ErrorMessage: '',
            ExecutionTime: 1,
            RowCount: projected.length,
            TotalRowCount: projected.length,
        };
    }

    public createProvider(options?: { deniedEntities?: ReadonlySet<string> }): IMetadataProvider {
        const denied = options?.deniedEntities ?? new Set<string>();
        const entityNames = [
            E_ORGANIZATION,
            E_PERSON,
            E_THREAD,
            E_SESSION,
            E_MESSAGE,
            E_ARTIFACT,
            E_ARTIFACT_VERSION,
            E_ARTIFACT_TYPE,
            E_MESSAGE_FILE,
            E_FILE_REQUEST,
            E_MAGIC,
            'MJ: Actions',
            'MJ: File Storage Accounts',
            'MJ: Signature Accounts',
        ];

        const entityInfoMap = new Map<string, EntityInfo>();
        for (const name of entityNames) {
            const info = {
                Name: name,
                GetUserPermisions: () => ({
                    CanRead: !denied.has(name),
                    CanCreate: !denied.has(name),
                    CanUpdate: !denied.has(name),
                    CanDelete: !denied.has(name),
                }),
            } as EntityInfo;
            entityInfoMap.set(name, info);
        }

        const harness = this;
        const provider = {
            CurrentUser: this.systemUser,
            Entities: Array.from(entityInfoMap.values()),
            EntityByName(name: string): EntityInfo | undefined {
                return entityInfoMap.get(name);
            },
            async GetEntityObject<T extends BaseEntity>(entityName: string): Promise<T> {
                const backing: StoredEntityRow = { ID: '' };
                const entityStub = {
                    LatestResult: { Errors: [], CompleteMessage: '' },
                    NewRecord(): void {
                        backing.ID = makeUuid('30000001', harness.seq++);
                    },
                    async InnerLoad(key: { KeyValuePairs: Array<{ FieldName: string; Value: string }> }): Promise<boolean> {
                        const idPair = key.KeyValuePairs.find((k) => k.FieldName === 'ID');
                        const list = harness.tables.get(entityName) ?? [];
                        const found = list.find((r) => r.ID === idPair?.Value);
                        if (!found) return false;
                        Object.assign(backing, found);
                        return true;
                    },
                    Get(): never {
                        harness.getSetCallCount++;
                        throw new Error('BaseEntity.Get() is forbidden');
                    },
                    Set(): never {
                        harness.getSetCallCount++;
                        throw new Error('BaseEntity.Set() is forbidden');
                    },
                    async Save(): Promise<boolean> {
                        harness.saveOrder.push(entityName);
                        harness.insertRow(entityName, { ...backing });
                        return true;
                    },
                };
                const proxy = new Proxy(entityStub, {
                    get(target, prop: string) {
                        if (prop in target) {
                            return target[prop as keyof typeof target];
                        }
                        return backing[prop];
                    },
                    set(_target, prop: string, value: string | number | boolean | Date | null | undefined) {
                        backing[prop] = value;
                        return true;
                    },
                });
                return proxy as BaseEntity as T;
            },
            async RunView<T>(params: RunViewParams): Promise<RunViewResult<T>> {
                harness.runViewCalls.push(params);
                const res = harness.query(params);
                return {
                    ...res,
                    Results: res.Results as T[],
                };
            },
            async RunViews(paramsList: RunViewParams[]): Promise<RunViewResult[]> {
                harness.runViewsBatches.push(paramsList);
                return paramsList.map((p) => harness.query(p));
            },
        } as IMetadataProvider;

        return provider;
    }

    public createContext(provider?: IMetadataProvider): IntegrationCheckContext {
        return {
            User: this.systemUser,
            Provider: provider ?? this.createProvider(),
        } as IntegrationCheckContext;
    }
}

function matchesSqlFilter(row: StoredEntityRow, filter: string): boolean {
    const trimmed = filter.trim();
    if (!trimmed) return true;
    const clauses = trimmed.split(/\s+AND\s+/i);
    for (const rawClause of clauses) {
        const clause = rawClause.trim();
        const inMatch = /^([A-Za-z0-9_]+)\s+IN\s*\((.+)\)$/i.exec(clause);
        if (inMatch) {
            const col = inMatch[1];
            const values = inMatch[2]
                .split(',')
                .map((v) => v.trim().replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'").toLowerCase());
            const actual = String(row[col] ?? '').toLowerCase();
            if (!values.includes(actual)) return false;
            continue;
        }
        const likeMatch = /^([A-Za-z0-9_]+)\s+LIKE\s+'(.*)'$/i.exec(clause);
        if (likeMatch) {
            const col = likeMatch[1];
            const pattern = likeMatch[2].replace(/''/g, "'").replace(/%/g, '.*');
            const regex = new RegExp(`^${pattern}$`, 'is');
            if (!regex.test(String(row[col] ?? ''))) return false;
            continue;
        }
        const eqStrMatch = /^([A-Za-z0-9_]+)\s*=\s*'(.*)'$/i.exec(clause);
        if (eqStrMatch) {
            const col = eqStrMatch[1];
            const expected = eqStrMatch[2].replace(/''/g, "'").toLowerCase();
            if (String(row[col] ?? '').toLowerCase() !== expected) return false;
            continue;
        }
        const eqNumMatch = /^([A-Za-z0-9_]+)\s*=\s*(-?\d+)$/i.exec(clause);
        if (eqNumMatch) {
            const col = eqNumMatch[1];
            const expectedNum = Number(eqNumMatch[2]);
            const actual = row[col];
            if (typeof actual === 'boolean') {
                if ((actual ? 1 : 0) !== expectedNum) return false;
            } else if (Number(actual) !== expectedNum) {
                return false;
            }
            continue;
        }
    }
    return true;
}

function createSystemUser(): UserInfo {
    return new UserInfo(null, {
        ID: '99999999-4000-8000-8000-000000000001',
        Name: 'Integration System User',
        Email: 'staff@bluecypress.example',
    });
}

function wireGlobalRunViewToHarness(harness: InMemoryWorldHarness): () => void {
    const origRunView = RunView.prototype.RunView;
    const origRunViews = RunView.prototype.RunViews;
    const origFromProvider = RunView.FromMetadataProvider;

    RunView.prototype.RunView = async function <T>(params: RunViewParams): Promise<RunViewResult<T>> {
        harness.runViewCalls.push(params);
        const res = harness.query(params);
        return { ...res, Results: res.Results as T[] };
    };

    RunView.prototype.RunViews = async function (paramsList: RunViewParams[]): Promise<RunViewResult[]> {
        harness.runViewsBatches.push(paramsList);
        return paramsList.map((p) => harness.query(p));
    };

    RunView.FromMetadataProvider = function (): RunView {
        return new RunView(null);
    };

    return () => {
        RunView.prototype.RunView = origRunView;
        RunView.prototype.RunViews = origRunViews;
        RunView.FromMetadataProvider = origFromProvider;
    };
}

interface MockExpressResponseState {
    statusCode: number;
    body: object | null;
}

function createMockExpressResponse(): { res: Response; state: MockExpressResponseState } {
    const state: MockExpressResponseState = { statusCode: 200, body: null };
    const mock = {
        status(code: number) {
            state.statusCode = code;
            return this;
        },
        json(payload: object) {
            state.body = payload;
            return this;
        },
    };
    return { res: mock as Response, state };
}

function collectSourceFiles(dir: string): string[] {
    const files: string[] = [];
    for (const entry of readdirSync(dir)) {
        if (entry === '__tests__' || entry === 'node_modules' || entry === 'dist') continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            files.push(...collectSourceFiles(full));
        } else if (extname(entry) === '.ts') {
            files.push(full);
        }
    }
    return files;
}

afterEach(() => {
    vi.restoreAllMocks();
    SecureMessagingEngineBase.Instance.ClearThreadCache();
});

describe('SM-WORLD Multi-Entity Seed Fixtures & FK Ordering', () => {
    it('satisfies OpenApp v3 seed density (>=20 records across >=3 organizations, roles, statuses, periods, and versioned artifacts)', () => {
        const report = BuildSeedDensityReport();
        expect(report.overallPassed).toBe(true);
        expect(report.pillars.seedDensity.violationCount).toBe(0);
        expect(report.totalRecords).toBeGreaterThanOrEqual(80);
        expect(report.organizationsCount).toBeGreaterThanOrEqual(4);
        expect(report.peopleCount).toBeGreaterThanOrEqual(12);
        expect(report.rolesCovered.length).toBeGreaterThanOrEqual(4);
        expect(report.periodsCovered.length).toBeGreaterThanOrEqual(4);
        expect(report.threadStatusesCovered).toEqual(expect.arrayContaining(['Active', 'Closed', 'Archived']));
        expect(report.artifactsCount).toBeGreaterThanOrEqual(6);
        expect(report.artifactVersionsCount).toBeGreaterThanOrEqual(10);
        expect(report.artifactLinkedFilesCount).toBeGreaterThanOrEqual(6);
        expect(report.nonArtifactFilesCount).toBeGreaterThanOrEqual(4);
    });

    it('maintains strict tenant and foreign-key referential integrity across every fixture collection', () => {
        const orgKeys = new Set(WORLD_ORGANIZATIONS.map((o) => o.key));
        const personByKey = new Map(WORLD_PEOPLE.map((p) => [p.key, p]));
        const threadByKey = new Map(WORLD_THREADS.map((t) => [t.key, t]));
        const messageByKey = new Map(WORLD_MESSAGES.map((m) => [m.key, m]));
        const artifactByKey = new Map(WORLD_ARTIFACTS.map((a) => [a.key, a]));

        for (const p of WORLD_PEOPLE) {
            expect(orgKeys.has(p.orgKey)).toBe(true);
        }
        for (const t of WORLD_THREADS) {
            const contact = personByKey.get(t.contactKey);
            expect(contact).toBeDefined();
            expect(contact?.orgKey).toBe(t.orgKey);
        }
        for (const v of WORLD_ARTIFACT_VERSIONS) {
            expect(artifactByKey.has(v.artifactKey)).toBe(true);
        }
        for (const mf of WORLD_MESSAGE_FILES) {
            const thread = threadByKey.get(mf.threadKey);
            const msg = messageByKey.get(mf.messageKey);
            expect(thread).toBeDefined();
            expect(msg).toBeDefined();
            expect(thread?.orgKey).toBe(mf.orgKey);
            if (mf.artifactKey) {
                const art = artifactByKey.get(mf.artifactKey);
                expect(art).toBeDefined();
                expect(art?.orgKey).toBe(mf.orgKey);
            }
        }
        for (const fr of WORLD_FILE_REQUESTS) {
            expect(threadByKey.has(fr.threadKey)).toBe(true);
            expect(personByKey.has(fr.contactKey)).toBe(true);
        }
        for (const ml of WORLD_MAGIC_LINKS) {
            expect(threadByKey.has(ml.threadKey)).toBe(true);
            expect(personByKey.has(ml.contactKey)).toBe(true);
        }
    });

    it('LoadWorld seeds parent MJ: Artifacts strictly before MJ: Artifact Versions and Message Files with zero BaseEntity.Get()/Set()', async () => {
        const harness = new InMemoryWorldHarness(createSystemUser());
        const restore = wireGlobalRunViewToHarness(harness);
        try {
            const ctx = harness.createContext();
            const world = await LoadWorld(ctx);

            expect(harness.getSetCallCount).toBe(0);
            expect(Object.keys(world.Organizations).length).toBe(4);
            expect(Object.keys(world.People).length).toBe(12);
            expect(Object.keys(world.Threads).length).toBe(12);
            expect(Object.keys(world.Artifacts).length).toBe(6);
            expect(Object.keys(world.ArtifactVersions).length).toBe(10);
            expect(Object.keys(world.MessageFiles).length).toBe(10);

            const lastArtifactIdx = harness.saveOrder.lastIndexOf(E_ARTIFACT);
            const firstVersionIdx = harness.saveOrder.indexOf(E_ARTIFACT_VERSION);
            const firstMessageFileIdx = harness.saveOrder.indexOf(E_MESSAGE_FILE);

            expect(lastArtifactIdx).toBeGreaterThan(-1);
            expect(firstVersionIdx).toBeGreaterThan(lastArtifactIdx);
            expect(firstMessageFileIdx).toBeGreaterThan(lastArtifactIdx);
        } finally {
            restore();
        }
    });
});

describe('Cross-Stack ArtifactFileStore + MessageFile.ArtifactID Batched Resolution', () => {
    it('chunks large ID lists at 200 max and deduplicates without raw SQL subqueries', () => {
        const ids: string[] = [];
        for (let i = 0; i < 450; i++) {
            ids.push(makeUuid('40000001', i));
        }
        ids.push(ids[0], ids[1]); // duplicates
        const chunks = ChunkIds(ids);
        expect(chunks.length).toBe(3);
        expect(chunks[0].length).toBe(IN_CLAUSE_CHUNK_SIZE);
        expect(chunks[1].length).toBe(IN_CLAUSE_CHUNK_SIZE);
        expect(chunks[2].length).toBe(50);

        const clause = BuildInClause('ID', chunks[0].slice(0, 2));
        expect(clause).toContain('ID IN (');
        expect(clause).not.toMatch(/SELECT\s+/i);
    });

    it('resolves Organization A (Northstar) MessageFile.ArtifactID v2 deliverable + binary fallback using ONE batched RunViews call (zero N+1)', async () => {
        const harness = new InMemoryWorldHarness(createSystemUser());
        const ids = harness.seedPrebuiltWorld();
        const restore = wireGlobalRunViewToHarness(harness);

        try {
            const ctx = harness.createContext();
            const { threadStatus, resolution } = await VerifyAuthorizedTenantArtifactResolution(
                ctx,
                ids.personIds.priya,
                ids.threadIds.northstarEngagement,
            );

            expect(threadStatus).toBe('Active');
            expect(resolution.artifactCount).toBe(1);
            expect(resolution.binaryFallbackCount).toBe(1);
            expect(resolution.batchedQueryChunks).toBe(1);

            const msa = resolution.attachments.find((a) => a.kind === 'artifact');
            expect(msa?.artifactId).toBe(ids.artifactIds.northstarMsaDoc);
            expect(msa?.latestVersionNumber).toBe(2);
            expect(msa?.latestVersionContent).toContain('Section 4.2 Indemnity & Tenant Isolation');

            const binary = resolution.attachments.find((a) => a.kind === 'binary-fallback');
            expect(binary?.artifactId).toBeNull();
            expect(binary?.filename).toContain('northstar-signature-scan.png');

            // Verify zero N+1: exactly 1 RunViews batch for Artifacts + Artifact Versions (ResultType: 'simple')
            expect(harness.runViewsBatches.length).toBe(1);
            expect(harness.runViewsBatches[0].length).toBe(2);
            expect(harness.runViewsBatches[0][0].EntityName).toBe(E_ARTIFACT);
            expect(harness.runViewsBatches[0][0].ResultType).toBe('simple');
            expect(harness.runViewsBatches[0][0].ExtraFilter).toMatch(/^ID IN \(/);
            expect(harness.runViewsBatches[0][1].EntityName).toBe(E_ARTIFACT_VERSION);
            expect(harness.runViewsBatches[0][1].ResultType).toBe('simple');
            expect(harness.runViewsBatches[0][1].ExtraFilter).toMatch(/^ArtifactID IN \(/);
        } finally {
            restore();
        }
    });

    it('skips artifact RunViews completely for threads containing only non-artifact binary files', async () => {
        const harness = new InMemoryWorldHarness(createSystemUser());
        const ids = harness.seedPrebuiltWorld();
        const restore = wireGlobalRunViewToHarness(harness);

        try {
            const ctx = harness.createContext();
            const resolution = await BatchResolveThreadMessageFileArtifacts(ctx, ids.threadIds.invoice);

            expect(resolution.artifactCount).toBe(0);
            expect(resolution.binaryFallbackCount).toBe(1);
            expect(resolution.batchedQueryChunks).toBe(0);
            expect(harness.runViewsBatches.length).toBe(0);
            expect(resolution.attachments[0].kind).toBe('binary-fallback');
        } finally {
            restore();
        }
    });
});

describe('Adversarial Cross-Tenant RLS & Portal Boundary Isolation', () => {
    it('rejects Organization B (Meridian) caller from reading, downloading, or caching Organization A (Northstar) MessageFile.ArtifactID', async () => {
        const harness = new InMemoryWorldHarness(createSystemUser());
        const ids = harness.seedPrebuiltWorld();
        const restore = wireGlobalRunViewToHarness(harness);

        try {
            const ctx = harness.createContext();
            const audit = await EvaluateCrossTenantArtifactBoundary(ctx, {
                victimContactId: ids.personIds.priya,
                victimThreadId: ids.threadIds.northstarEngagement,
                victimMessageFileId: ids.messageFileIds.northstarMsaFile,
                attackerContactId: ids.personIds.samantha,
                attackerThreadId: ids.threadIds.meridianHipaa,
            });

            expect(audit.threadAccessDenied).toBe(true);
            expect(audit.threadStatusResult).toBeNull();
            expect(audit.crossThreadDownloadRejected).toBe(true);
            expect(audit.crossThreadDownloadError).toMatch(/not found in this thread/i);
            expect(audit.cacheIsolatedOnViewerSwitch).toBe(true);
        } finally {
            restore();
        }
    });

    it('rejects Organization A (Northstar) caller from reading Organization B (Meridian HIPAA) MessageFile.ArtifactID', async () => {
        const harness = new InMemoryWorldHarness(createSystemUser());
        const ids = harness.seedPrebuiltWorld();
        const restore = wireGlobalRunViewToHarness(harness);

        try {
            const ctx = harness.createContext();
            const audit = await EvaluateCrossTenantArtifactBoundary(ctx, {
                victimContactId: ids.personIds.samantha,
                victimThreadId: ids.threadIds.meridianHipaa,
                victimMessageFileId: ids.messageFileIds.meridianHipaaFile,
                attackerContactId: ids.personIds.derek,
                attackerThreadId: ids.threadIds.northstarAudit,
            });

            expect(audit.threadAccessDenied).toBe(true);
            expect(audit.crossThreadDownloadRejected).toBe(true);
            expect(audit.cacheIsolatedOnViewerSwitch).toBe(true);
        } finally {
            restore();
        }
    });

    it('server REST attachment handlers return HTTP 403 for cross-tenant Org B caller and HTTP 200 for authorized Org A participant', async () => {
        const harness = new InMemoryWorldHarness(createSystemUser());
        const ids = harness.seedPrebuiltWorld();
        const restore = wireGlobalRunViewToHarness(harness);
        const origProvider = Metadata.Provider;
        const UserCache = loadServerUserCache();
        const origGetSystemUser = UserCache.Instance.GetSystemUser;

        UserCache.Instance.GetSystemUser = () => harness.systemUser;
        Metadata.Provider = harness.createProvider();

        try {
            const listSpy = vi.spyOn(ArtifactFileStore.prototype, 'listThreadFiles');

            // 1. Adversarial Org B (Samantha) requests Org A (Northstar) attachments -> HTTP 403
            const attackerReq = {
                params: { threadId: ids.threadIds.northstarEngagement },
                portalSession: {
                    sessionId: ids.sessionIds.samantha,
                    contactId: ids.personIds.samantha,
                    contactEmail: 'samantha.chen@com-world.test',
                },
            } as PortalRequest;
            const attackerRes = createMockExpressResponse();
            await getThreadAttachments(attackerReq as Request, attackerRes.res);

            expect(attackerRes.state.statusCode).toBe(403);
            expect(attackerRes.state.body).toEqual({ error: 'Access denied to this thread' });
            expect(listSpy).not.toHaveBeenCalled();

            // 2. Adversarial Org B attempts downloadAttachment on Org A's MessageFile -> HTTP 403
            const attackerDlReq = {
                params: {
                    threadId: ids.threadIds.northstarEngagement,
                    attachmentId: ids.messageFileIds.northstarMsaFile,
                },
                portalSession: {
                    sessionId: ids.sessionIds.samantha,
                    contactId: ids.personIds.samantha,
                    contactEmail: 'samantha.chen@com-world.test',
                },
            } as PortalRequest;
            const attackerDlRes = createMockExpressResponse();
            await downloadAttachment(attackerDlReq as Request, attackerDlRes.res);

            expect(attackerDlRes.state.statusCode).toBe(403);
            expect(attackerDlRes.state.body).toEqual({ error: 'Access denied to this thread' });

            // 3. Authorized Org A (Priya) requests her own Northstar thread attachments -> HTTP 200
            const authorizedReq = {
                params: { threadId: ids.threadIds.northstarEngagement },
                portalSession: {
                    sessionId: ids.sessionIds.priya,
                    contactId: ids.personIds.priya,
                    contactEmail: 'priya.nair@com-world.test',
                },
            } as PortalRequest;
            const authorizedRes = createMockExpressResponse();
            await getThreadAttachments(authorizedReq as Request, authorizedRes.res);

            expect(authorizedRes.state.statusCode).toBe(200);
            const payload = authorizedRes.state.body as {
                attachments: Array<{ id: string; artifactId: string; filename: string }>;
            };
            expect(payload.attachments.length).toBe(2);
            expect(payload.attachments.some((a) => a.artifactId === ids.artifactIds.northstarMsaDoc)).toBe(true);
            expect(payload.attachments.some((a) => a.artifactId === '')).toBe(true);
        } finally {
            UserCache.Instance.GetSystemUser = origGetSystemUser;
            Metadata.Provider = origProvider;
            restore();
        }
    });

    it('SecureMessagingEngineBase omits permission-denied entities cleanly during Config without throwing', async () => {
        const harness = new InMemoryWorldHarness(createSystemUser());
        const restrictedProvider = harness.createProvider({
            deniedEntities: new Set(['MJ: File Storage Accounts', 'MJ: Signature Accounts']),
        });
        const restore = wireGlobalRunViewToHarness(harness);

        try {
            await expect(
                SecureMessagingEngineBase.Instance.Config(true, harness.systemUser, restrictedProvider),
            ).resolves.toBeUndefined();
            expect(SecureMessagingEngineBase.Instance.FileStorageAccounts.length).toBe(0);
            expect(SecureMessagingEngineBase.Instance.ActiveSignatureAccounts.length).toBe(0);
        } finally {
            restore();
        }
    });

    it('enforces zero any, zero unknown casts, and zero BaseEntity.Get()/Set() across packages/IntegrationTests/src', () => {
        const files = collectSourceFiles(INTEGRATION_SRC_DIR);
        expect(files.length).toBeGreaterThanOrEqual(6);

        const violations: string[] = [];
        for (const file of files) {
            const content = readFileSync(file, 'utf8')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/^\s*\/\/.*$/gm, '');
            if (/:\s*any\b|\bas\s+any\b/.test(content)) {
                violations.push(`${relative(INTEGRATION_SRC_DIR, file)}: uses any`);
            }
            if (/\bas\s+unknown\b/.test(content)) {
                violations.push(`${relative(INTEGRATION_SRC_DIR, file)}: uses unknown cast`);
            }
            if (/\bentity\.(Get|Set)\s*\(/.test(content)) {
                violations.push(`${relative(INTEGRATION_SRC_DIR, file)}: uses BaseEntity.Get()/Set()`);
            }
        }

        expect(violations).toEqual([]);
    });

    it('PortalAuthService enforces strict contact ownership on thread status lookups', async () => {
        const harness = new InMemoryWorldHarness(createSystemUser());
        const ids = harness.seedPrebuiltWorld();
        const restore = wireGlobalRunViewToHarness(harness);

        try {
            const authorized = await PortalAuthService.Instance.contactThreadStatus(
                ids.personIds.samantha,
                ids.threadIds.meridianHipaa,
                harness.systemUser,
            );
            const unauthorized = await PortalAuthService.Instance.contactThreadStatus(
                ids.personIds.priya,
                ids.threadIds.meridianHipaa,
                harness.systemUser,
            );
            expect(authorized).toBe('Active');
            expect(unauthorized).toBeNull();
        } finally {
            restore();
        }
    });
});
