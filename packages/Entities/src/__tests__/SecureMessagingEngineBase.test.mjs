import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { BaseEntity, Metadata, RunView } from '@memberjunction/core';
import { MJEventType, MJGlobal } from '@memberjunction/global';
import {
    SecureMessagingEngineBase,
    SECURE_MESSAGING_ENTITY_NAMES,
} from '../../dist/index.js';

/**
 * Creates a minimal mock IMetadataProvider + IRunViewProvider with configurable
 * entity permissions and RunView/RunViews stubs.
 */
function createMockProvider({
    userId = '11111111-1111-1111-1111-111111111111',
    entities = {},
    runViewHandler = async () => ({ Success: true, Results: [] }),
    runViewsHandler = async (params) => params.map(() => ({ Success: true, Results: [] })),
} = {}) {
    const entityList = Object.entries(entities).map(([name, cfg]) => ({
        ID: cfg.id ?? `id-${name}`,
        Name: name,
        GetUserPermisions: (user) => {
            if (typeof cfg.canRead === 'function') {
                return { CanRead: cfg.canRead(user) };
            }
            return { CanRead: cfg.canRead ?? true };
        },
    }));

    const provider = {
        CurrentUser: { ID: userId, Name: `User ${userId}`, Email: `${userId}@example.com` },
        Entities: entityList,
        EntityByName: (name) => entityList.find((e) => e.Name === name),
        RunView: runViewHandler,
        RunViews: runViewsHandler,
    };
    return provider;
}

/** Resets singleton mutable state between tests without breaking BaseSingleton identity. */
function resetEngine(engine) {
    engine.ClearThreadCache();
    engine.MaxCachedThreads = SecureMessagingEngineBase.DEFAULT_MAX_CACHED_THREADS;
    engine.MaxMessagesPerThread = SecureMessagingEngineBase.DEFAULT_MAX_MESSAGES_PER_THREAD;
    engine.MaxFilesPerThread = SecureMessagingEngineBase.DEFAULT_MAX_FILES_PER_THREAD;
    engine.MaxFileRequestsPerThread = SecureMessagingEngineBase.DEFAULT_MAX_FILE_REQUESTS_PER_THREAD;
    engine._activeProvider = null;
    engine._configuredProvider = null;
    engine._threadCacheViewerScopeKey = null;
    engine._threadCacheProvider = null;
    engine._artifactTypes = [];
    engine._actions = [];
    engine._fileStorageAccounts = [];
    engine._signatureAccounts = [];
    engine._actionIdByName = new Map();
    engine._loaded = false;
}

describe('SecureMessagingEngineBase', () => {
    /** @type {SecureMessagingEngineBase} */
    let engine;

    beforeEach(() => {
        engine = SecureMessagingEngineBase.Instance;
        resetEngine(engine);
    });

    it('returns a single BaseSingleton instance across repeated Instance accesses', () => {
        assert.strictEqual(SecureMessagingEngineBase.Instance, engine);
    });

    describe('Config: taxonomy caching, CacheLocal RLS safety, ProviderToUse, and CanRead gating', () => {
        it('caches bounded lookup entities with CacheLocal: true on global non-RLS tables and CacheLocal: false on account config tables, never loading transactional tables', async () => {
            const capturedLoads = [];
            const origLoad = Object.getPrototypeOf(SecureMessagingEngineBase.prototype).Load;

            const provider = createMockProvider({
                entities: {
                    [SECURE_MESSAGING_ENTITY_NAMES.MJ_ARTIFACT_TYPES]: { canRead: true },
                    [SECURE_MESSAGING_ENTITY_NAMES.MJ_ACTIONS]: { canRead: true },
                    [SECURE_MESSAGING_ENTITY_NAMES.MJ_FILE_STORAGE_ACCOUNTS]: { canRead: true },
                    [SECURE_MESSAGING_ENTITY_NAMES.MJ_SIGNATURE_ACCOUNTS]: { canRead: true },
                },
            });

            Object.getPrototypeOf(SecureMessagingEngineBase.prototype).Load = async function (
                configs,
                passedProvider,
                forceRefresh,
                contextUser
            ) {
                capturedLoads.push({ configs, passedProvider, forceRefresh, contextUser });
                // Populate backing properties as BaseEngine.Load would
                this._artifactTypes = [
                    { ID: 'at-pdf', Name: 'PDF', ContentType: 'application/pdf', Priority: 100 },
                    { ID: 'at-img', Name: 'Image', ContentType: 'image/*', Priority: 80 },
                    { ID: 'at-doc', Name: 'Document', ContentType: 'application/octet-stream', Priority: 10 },
                ];
                this._actions = [
                    { ID: 'act-send', Name: 'Send Secure Message' },
                    { ID: 'act-ml', Name: 'Issue Portal Magic Link' },
                ];
                this._fileStorageAccounts = [
                    { ID: 'acct-1', Name: 'Primary S3', ProviderID: 'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA' },
                ];
                this._signatureAccounts = [
                    { ID: 'sig-1', Name: 'DocuSign Prod', SignatureProvider: 'DocuSign', IsDefault: true, IsActive: true },
                ];
                await this.AdditionalLoading(contextUser);
            };

            try {
                await engine.Config(false, provider.CurrentUser, provider);

                assert.equal(capturedLoads.length, 1);
                const { configs, passedProvider, forceRefresh } = capturedLoads[0];
                assert.strictEqual(passedProvider, provider, 'must pass explicit provider unchanged to super.Load');
                assert.strictEqual(engine.ProviderToUse, provider, 'ProviderToUse must return active provider');
                assert.equal(forceRefresh, false);

                const byEntity = new Map(configs.map((c) => [c.EntityName, c]));
                assert.equal(byEntity.size, 4);

                // Global non-RLS reference tables use CacheLocal: true
                assert.equal(byEntity.get(SECURE_MESSAGING_ENTITY_NAMES.MJ_ARTIFACT_TYPES)?.CacheLocal, true);
                assert.equal(byEntity.get(SECURE_MESSAGING_ENTITY_NAMES.MJ_ACTIONS)?.CacheLocal, true);

                // RLS/permission-scoped account config tables MUST use CacheLocal: false
                assert.equal(byEntity.get(SECURE_MESSAGING_ENTITY_NAMES.MJ_FILE_STORAGE_ACCOUNTS)?.CacheLocal, false);
                assert.equal(byEntity.get(SECURE_MESSAGING_ENTITY_NAMES.MJ_SIGNATURE_ACCOUNTS)?.CacheLocal, false);

                // Transactional / security-sensitive tables must NEVER be globally cached
                for (const forbidden of [
                    SECURE_MESSAGING_ENTITY_NAMES.SECURE_THREADS,
                    SECURE_MESSAGING_ENTITY_NAMES.SECURE_MESSAGES,
                    SECURE_MESSAGING_ENTITY_NAMES.MESSAGE_FILES,
                    SECURE_MESSAGING_ENTITY_NAMES.FILE_REQUESTS,
                    SECURE_MESSAGING_ENTITY_NAMES.PORTAL_SESSIONS,
                    SECURE_MESSAGING_ENTITY_NAMES.PORTAL_MAGIC_LINKS,
                ]) {
                    assert.equal(byEntity.has(forbidden), false, `must never globally cache ${forbidden}`);
                }

                // Lookup helpers work from cached metadata
                assert.equal(engine.GetActionId('send secure message'), 'act-send');
                assert.equal(engine.GetActionId('Issue Portal Magic Link'), 'act-ml');
                assert.equal(engine.ResolveArtifactTypeId('application/pdf'), 'at-pdf');
                assert.equal(engine.ResolveArtifactTypeId('image/png'), 'at-img');
                assert.equal(engine.ResolveArtifactTypeId('application/x-custom'), 'at-doc');
                assert.equal(
                    engine.FindStorageAccountByProviderId('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')?.ID,
                    'acct-1'
                );
                assert.deepEqual(engine.GetActiveSignatureAccountOptions(), [
                    { id: 'sig-1', label: 'DocuSign Prod (DocuSign)' },
                ]);
            } finally {
                Object.getPrototypeOf(SecureMessagingEngineBase.prototype).Load = origLoad;
            }
        });

        it('gates out missing or non-CanRead entities cleanly for restricted portal/external users', async () => {
            const capturedLoads = [];
            const origLoad = Object.getPrototypeOf(SecureMessagingEngineBase.prototype).Load;

            const restrictedProvider = createMockProvider({
                userId: '22222222-2222-2222-2222-222222222222',
                entities: {
                    [SECURE_MESSAGING_ENTITY_NAMES.MJ_ARTIFACT_TYPES]: { canRead: true },
                    [SECURE_MESSAGING_ENTITY_NAMES.MJ_ACTIONS]: { canRead: false },
                    [SECURE_MESSAGING_ENTITY_NAMES.MJ_FILE_STORAGE_ACCOUNTS]: { canRead: false },
                    // MJ: Signature Accounts intentionally absent (not installed)
                },
            });

            // Pre-seed stale data to verify denied configs are cleared
            engine._actions = [{ ID: 'stale', Name: 'Send Secure Message' }];
            engine._fileStorageAccounts = [{ ID: 'stale-acct', ProviderID: 'p1' }];
            engine._signatureAccounts = [{ ID: 'stale-sig', Name: 'Stale' }];

            Object.getPrototypeOf(SecureMessagingEngineBase.prototype).Load = async function (configs) {
                capturedLoads.push(configs);
            };

            try {
                await engine.Config(false, restrictedProvider.CurrentUser, restrictedProvider);

                assert.equal(capturedLoads.length, 1);
                const entityNames = capturedLoads[0].map((c) => c.EntityName);
                assert.deepEqual(entityNames, [SECURE_MESSAGING_ENTITY_NAMES.MJ_ARTIFACT_TYPES]);
                assert.deepEqual(engine.Actions, []);
                assert.deepEqual(engine.FileStorageAccounts, []);
                assert.deepEqual(engine.ActiveSignatureAccounts, []);
            } finally {
                Object.getPrototypeOf(SecureMessagingEngineBase.prototype).Load = origLoad;
            }
        });

        it('switches active ProviderToUse, forces refresh, and clears thread cache when provider changes', async () => {
            const capturedLoads = [];
            const origLoad = Object.getPrototypeOf(SecureMessagingEngineBase.prototype).Load;
            const origFromProvider = RunView.FromMetadataProvider;

            const providerA = createMockProvider({
                userId: '11111111-1111-1111-1111-111111111111',
                entities: {
                    [SECURE_MESSAGING_ENTITY_NAMES.MJ_ARTIFACT_TYPES]: { canRead: true },
                },
            });
            const providerB = createMockProvider({
                userId: '11111111-1111-1111-1111-111111111111',
                entities: {
                    [SECURE_MESSAGING_ENTITY_NAMES.MJ_ARTIFACT_TYPES]: { canRead: true },
                },
            });

            Object.getPrototypeOf(SecureMessagingEngineBase.prototype).Load = async function (
                configs,
                passedProvider,
                forceRefresh
            ) {
                capturedLoads.push({ passedProvider, forceRefresh });
            };
            RunView.FromMetadataProvider = () => ({
                RunViews: async () => [
                    { Success: true, Results: [{ ID: 'm1', ThreadID: 't1', Content: 'hi' }] },
                    { Success: true, Results: [] },
                ],
            });

            try {
                await engine.Config(false, providerA.CurrentUser, providerA);
                assert.strictEqual(engine.ProviderToUse, providerA);

                await engine.LoadThreadWindow('AAAAAAAA-1111-1111-1111-111111111111', { provider: providerA });
                assert.equal(engine.CachedThreadCount, 1);

                // Switch to providerB with forceRefresh=false -> engine must force refresh and clear thread cache
                await engine.Config(false, providerB.CurrentUser, providerB);
                assert.strictEqual(engine.ProviderToUse, providerB);
                assert.equal(engine.CachedThreadCount, 0, 'thread cache must clear on provider switch');
                assert.equal(capturedLoads.length, 2);
                assert.strictEqual(capturedLoads[1].passedProvider, providerB);
                assert.equal(capturedLoads[1].forceRefresh, true);
            } finally {
                Object.getPrototypeOf(SecureMessagingEngineBase.prototype).Load = origLoad;
                RunView.FromMetadataProvider = origFromProvider;
            }
        });
    });

    describe('Bounded per-thread LRU window cache & BaseEntity event invalidation', () => {
        it('batches messages + files in ONE RunViews call, serves cache hits with 0 calls, and enforces LRU eviction', async () => {
            const origFromProvider = RunView.FromMetadataProvider;
            const runViewsCalls = [];

            const provider = createMockProvider({
                userId: '33333333-3333-3333-3333-333333333333',
                entities: {
                    [SECURE_MESSAGING_ENTITY_NAMES.FILE_REQUESTS]: { canRead: true },
                },
            });

            RunView.FromMetadataProvider = (p) => ({
                RunViews: async (views) => {
                    runViewsCalls.push({ provider: p, views });
                    return views.map((v) => {
                        if (v.EntityName === SECURE_MESSAGING_ENTITY_NAMES.SECURE_MESSAGES) {
                            return {
                                Success: true,
                                Results: [{ ID: `msg-${runViewsCalls.length}`, ThreadID: v.ExtraFilter, Content: 'hello' }],
                            };
                        }
                        if (v.EntityName === SECURE_MESSAGING_ENTITY_NAMES.MESSAGE_FILES) {
                            return { Success: true, Results: [{ ID: `file-${runViewsCalls.length}`, Filename: 'a.pdf' }] };
                        }
                        return { Success: true, Results: [{ ID: `req-${runViewsCalls.length}`, Title: 'W9', Status: 'Pending' }] };
                    });
                },
            });

            try {
                engine.MaxCachedThreads = 2;
                const t1 = 'AAAAAAAA-0000-0000-0000-000000000001';
                const t2 = 'AAAAAAAA-0000-0000-0000-000000000002';
                const t3 = 'AAAAAAAA-0000-0000-0000-000000000003';

                // First load of T1: 1 batched RunViews call with 2 views (messages + files)
                const w1 = await engine.LoadThreadWindow(t1, { provider });
                assert.equal(runViewsCalls.length, 1);
                assert.equal(runViewsCalls[0].views.length, 2);
                assert.equal(runViewsCalls[0].views[0].ResultType, 'simple');
                assert.ok(Array.isArray(runViewsCalls[0].views[0].Fields));
                assert.equal(w1.messages.length, 1);
                assert.equal(w1.files.length, 1);

                // Second load of T1 (lowercase UUID): cache hit, 0 additional RunViews calls!
                const w1Hit = await engine.LoadThreadWindow(t1.toLowerCase(), { provider });
                assert.strictEqual(w1Hit, w1);
                assert.equal(runViewsCalls.length, 1);

                // Load T2: cache now holds [T1, T2]
                await engine.LoadThreadWindow(t2, { provider });
                assert.equal(runViewsCalls.length, 2);
                assert.equal(engine.CachedThreadCount, 2);

                // Touch T1 so T2 becomes LRU, then load T3 -> evicts T2, keeps T1 and T3
                assert.ok(engine.GetCachedThreadWindow(t1));
                await engine.LoadThreadWindow(t3, { provider });
                assert.equal(engine.CachedThreadCount, 2);
                assert.ok(engine.GetCachedThreadWindow(t1), 'recently used T1 should remain cached');
                assert.equal(engine.GetCachedThreadWindow(t2), undefined, 'LRU T2 should be evicted');
                assert.ok(engine.GetCachedThreadWindow(t3), 'newly loaded T3 should be cached');

                // Requesting includeFileRequests=true upgrades T3 in ONE batched 3-view call
                const w3Full = await engine.LoadThreadWindow(t3, { provider, includeFileRequests: true });
                assert.equal(runViewsCalls.length, 4);
                assert.equal(runViewsCalls[3].views.length, 3);
                assert.equal(w3Full.includesFileRequests, true);
                assert.equal(w3Full.fileRequests.length, 1);

                // Subsequent includeFileRequests=true hits cache
                await engine.LoadThreadWindow(t3, { provider, includeFileRequests: true });
                assert.equal(runViewsCalls.length, 4);
            } finally {
                RunView.FromMetadataProvider = origFromProvider;
            }
        });

        it('clears the thread cache whenever the active viewer userId or viewerScopeKey changes', async () => {
            const origFromProvider = RunView.FromMetadataProvider;
            let callCount = 0;

            const provider = createMockProvider({ userId: '44444444-4444-4444-4444-444444444444' });
            RunView.FromMetadataProvider = () => ({
                RunViews: async () => {
                    callCount++;
                    return [
                        { Success: true, Results: [{ ID: `m-${callCount}` }] },
                        { Success: true, Results: [] },
                    ];
                },
            });

            try {
                const threadId = 'BBBBBBBB-0000-0000-0000-000000000001';
                const userA = { ID: '44444444-4444-4444-4444-444444444444' };
                const userB = { ID: '55555555-5555-5555-5555-555555555555' };

                const wA = await engine.LoadThreadWindow(threadId, { provider, contextUser: userA });
                assert.equal(callCount, 1);
                assert.equal(wA.messages[0].ID, 'm-1');

                // Different user MUST NOT receive userA's cached window
                const wB = await engine.LoadThreadWindow(threadId, { provider, contextUser: userB });
                assert.equal(callCount, 2);
                assert.equal(wB.messages[0].ID, 'm-2');
            } finally {
                RunView.FromMetadataProvider = origFromProvider;
            }
        });

        it('invalidates only the affected thread on local BaseEntity save/delete events and clears conservatively on opaque remote-invalidate', async () => {
            const origFromProvider = RunView.FromMetadataProvider;
            let callCount = 0;
            const provider = createMockProvider({ userId: '66666666-6666-6666-6666-666666666666' });

            RunView.FromMetadataProvider = () => ({
                RunViews: async () => {
                    callCount++;
                    return [
                        { Success: true, Results: [{ ID: `m-${callCount}` }] },
                        { Success: true, Results: [] },
                    ];
                },
            });

            try {
                const t1 = 'CCCCCCCC-0000-0000-0000-000000000001';
                const t2 = 'CCCCCCCC-0000-0000-0000-000000000002';

                await engine.LoadThreadWindow(t1, { provider });
                await engine.LoadThreadWindow(t2, { provider });
                assert.equal(engine.CachedThreadCount, 2);

                // Emit a save event for a Secure Message on T1 via MJGlobal
                MJGlobal.Instance.RaiseEvent({
                    component: {},
                    event: MJEventType.ComponentEvent,
                    eventCode: BaseEntity.BaseEventCode,
                    args: {
                        type: 'save',
                        baseEntity: {
                            EntityInfo: { Name: SECURE_MESSAGING_ENTITY_NAMES.SECURE_MESSAGES },
                            ThreadID: t1,
                        },
                    },
                });
                // Allow async event subscriber microtask to settle
                await new Promise((r) => setTimeout(r, 10));

                assert.equal(engine.GetCachedThreadWindow(t1), undefined, 'T1 must be invalidated on message save');
                assert.ok(engine.GetCachedThreadWindow(t2), 'T2 must remain cached when only T1 changed');

                // Reload T1, then emit delete event on Message Files for T2
                await engine.LoadThreadWindow(t1, { provider });
                MJGlobal.Instance.RaiseEvent({
                    component: {},
                    event: MJEventType.ComponentEvent,
                    eventCode: BaseEntity.BaseEventCode,
                    args: {
                        type: 'delete',
                        baseEntity: {
                            EntityInfo: { Name: SECURE_MESSAGING_ENTITY_NAMES.MESSAGE_FILES },
                            ThreadID: t2,
                        },
                    },
                });
                await new Promise((r) => setTimeout(r, 10));

                assert.ok(engine.GetCachedThreadWindow(t1), 'T1 must stay cached');
                assert.equal(engine.GetCachedThreadWindow(t2), undefined, 'T2 must be invalidated on file delete');

                // Emit remote-invalidate with recordData targeting T1
                MJGlobal.Instance.RaiseEvent({
                    component: {},
                    event: MJEventType.ComponentEvent,
                    eventCode: BaseEntity.BaseEventCode,
                    args: {
                        type: 'remote-invalidate',
                        entityName: SECURE_MESSAGING_ENTITY_NAMES.FILE_REQUESTS,
                        payload: {
                            action: 'save',
                            primaryKeyValues: 'ID|fr-1',
                            sourceServerId: 'srv-2',
                            timestamp: new Date().toISOString(),
                            recordData: JSON.stringify({ ID: 'fr-1', ThreadID: t1 }),
                        },
                    },
                });
                await new Promise((r) => setTimeout(r, 10));
                assert.equal(engine.GetCachedThreadWindow(t1), undefined, 'T1 must be invalidated by remote-invalidate recordData');

                // Reload both, then emit opaque remote-invalidate without recordData -> conservative clear
                await engine.LoadThreadWindow(t1, { provider });
                await engine.LoadThreadWindow(t2, { provider });
                assert.equal(engine.CachedThreadCount, 2);

                MJGlobal.Instance.RaiseEvent({
                    component: {},
                    event: MJEventType.ComponentEvent,
                    eventCode: BaseEntity.BaseEventCode,
                    args: {
                        type: 'remote-invalidate',
                        entityName: SECURE_MESSAGING_ENTITY_NAMES.SECURE_MESSAGES,
                        payload: {
                            action: 'delete',
                            primaryKeyValues: 'ID|msg-99',
                            sourceServerId: 'srv-2',
                            timestamp: new Date().toISOString(),
                        },
                    },
                });
                await new Promise((r) => setTimeout(r, 10));
                assert.equal(engine.CachedThreadCount, 0, 'opaque remote-invalidate must conservatively clear thread cache');
            } finally {
                RunView.FromMetadataProvider = origFromProvider;
            }
        });

        it('ResolveActionId uses cached action map first and falls back to projected RunView only on miss', async () => {
            const origLoad = Object.getPrototypeOf(SecureMessagingEngineBase.prototype).Load;
            const origFromProvider = RunView.FromMetadataProvider;
            const fallbackCalls = [];

            const provider = createMockProvider({
                entities: {
                    [SECURE_MESSAGING_ENTITY_NAMES.MJ_ACTIONS]: { canRead: true },
                },
            });

            Object.getPrototypeOf(SecureMessagingEngineBase.prototype).Load = async function (
                _configs,
                _provider,
                forceRefresh
            ) {
                if (this._loaded && !forceRefresh) return;
                this._actions = [{ ID: 'act-cached', Name: 'Send Secure Message' }];
                this._loaded = true;
                await this.AdditionalLoading();
            };
            RunView.FromMetadataProvider = () => ({
                RunView: async (params) => {
                    fallbackCalls.push(params);
                    return { Success: true, Results: [{ ID: 'act-extra', Name: 'Custom Action' }] };
                },
            });

            try {
                // Hit in cached actions -> 0 RunView calls
                const id1 = await engine.ResolveActionId('Send Secure Message', provider.CurrentUser, provider);
                assert.equal(id1, 'act-cached');
                assert.equal(fallbackCalls.length, 0);

                // Miss -> 1 projected RunView call, then memoized
                const id2 = await engine.ResolveActionId('Custom Action', provider.CurrentUser, provider);
                assert.equal(id2, 'act-extra');
                assert.equal(fallbackCalls.length, 1);
                assert.deepEqual(fallbackCalls[0].Fields, ['ID', 'Name']);
                assert.equal(fallbackCalls[0].ResultType, 'simple');

                const id2Again = await engine.ResolveActionId('Custom Action', provider.CurrentUser, provider);
                assert.equal(id2Again, 'act-extra');
                assert.equal(fallbackCalls.length, 1, 'fallback result should be memoized');
            } finally {
                Object.getPrototypeOf(SecureMessagingEngineBase.prototype).Load = origLoad;
                RunView.FromMetadataProvider = origFromProvider;
            }
        });
    });
});
