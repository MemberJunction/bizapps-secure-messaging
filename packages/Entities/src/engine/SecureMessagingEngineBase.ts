import {
    BaseEngine,
    BaseEnginePropertyConfig,
    BaseEntityEvent,
    IMetadataProvider,
    RegisterForStartup,
    RemoteInvalidatePayload,
    RunView,
    RunViewParams,
    UserInfo,
} from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';
import {
    mjBizAppsSecureMessagingFileRequestEntity,
    mjBizAppsSecureMessagingMessageFileEntity,
    mjBizAppsSecureMessagingSecureMessageEntity,
    mjBizAppsSecureMessagingSecureThreadEntity,
} from '../generated/entities/__mj_BizAppsSecureMessaging.js';

/** Canonical entity names referenced by Secure Messaging. */
export const SECURE_MESSAGING_ENTITY_NAMES = {
    SECURE_THREADS: 'MJ_BizApps_SecureMessaging: Secure Threads',
    SECURE_MESSAGES: 'MJ_BizApps_SecureMessaging: Secure Messages',
    MESSAGE_FILES: 'MJ_BizApps_SecureMessaging: Message Files',
    FILE_REQUESTS: 'MJ_BizApps_SecureMessaging: File Requests',
    PORTAL_SESSIONS: 'MJ_BizApps_SecureMessaging: Portal Sessions',
    PORTAL_MAGIC_LINKS: 'MJ_BizApps_SecureMessaging: Portal Magic Links',
    MJ_ACTIONS: 'MJ: Actions',
    MJ_ARTIFACT_TYPES: 'MJ: Artifact Types',
    MJ_FILE_STORAGE_ACCOUNTS: 'MJ: File Storage Accounts',
    MJ_SIGNATURE_ACCOUNTS: 'MJ: Signature Accounts',
} as const;

/** Bounded list of MJ Action names invoked by Secure Messaging UIs and services. */
export const SECURE_MESSAGING_ACTION_NAMES: readonly string[] = [
    'Send Secure Message',
    'Issue Portal Magic Link',
    'Start Secure Thread',
    'Promote Thread to Secure',
    'Send Document for Signature',
];

/** Default Artifact Type name used when no MIME-specific type matches. */
const FALLBACK_ARTIFACT_TYPE_NAME = 'Document';

/** Projected shape for cached `MJ: Actions` rows (ResultType: 'simple'). */
export interface SecureMessagingActionRef {
    ID: string;
    Name: string;
    Status?: string | null;
}

/** Projected shape for cached `MJ: Artifact Types` rows (ResultType: 'simple'). */
export interface SecureMessagingArtifactTypeRef {
    ID: string;
    Name?: string | null;
    ContentType: string | null;
    Priority: number;
    IsEnabled?: boolean;
}

/** Projected shape for cached `MJ: File Storage Accounts` rows (ResultType: 'simple'). */
export interface SecureMessagingStorageAccountRef {
    ID: string;
    Name?: string | null;
    ProviderID: string;
}

/** Projected shape for cached `MJ: Signature Accounts` rows (ResultType: 'simple'). */
export interface SecureMessagingSignatureAccountRef {
    ID: string;
    Name: string;
    SignatureProvider?: string | null;
    IsDefault?: boolean;
    IsActive?: boolean;
}

/** Projected shape for cached thread messages in {@link CachedThreadWindow}. */
export interface CachedSecureMessageRow {
    ID: string;
    ThreadID: string;
    PortalSessionID: string;
    PersonID: string | null;
    Direction: mjBizAppsSecureMessagingSecureMessageEntity['Direction'];
    Sender: string;
    Recipient: string;
    Subject: string | null;
    Content: string;
    IsSecure: boolean;
    Status: mjBizAppsSecureMessagingSecureMessageEntity['Status'];
    ReceivedAt: string | Date;
    IsStarred: boolean;
    IsImported: boolean;
    SourceChannel: string | null;
}

/** Projected shape for cached thread files in {@link CachedThreadWindow}. */
export interface CachedMessageFileRow {
    ID: string;
    ThreadID: string;
    SecureMessageID: string | null;
    ExternalMessageID: string | null;
    ArtifactID: string | null;
    FileID: string | null;
    Filename: string;
    ContentType: string | null;
    Size: number | null;
    __mj_CreatedAt?: string | Date;
}

/** Projected shape for cached thread file requests in {@link CachedThreadWindow}. */
export interface CachedFileRequestRow {
    ID: string;
    ThreadID: string;
    PortalSessionID: string;
    Title: string;
    Instructions: string | null;
    Status: mjBizAppsSecureMessagingFileRequestEntity['Status'];
    DueAt: string | Date | null;
    FulfilledAt: string | Date | null;
    __mj_CreatedAt?: string | Date;
}

/**
 * Bounded per-thread cache entry (ConversationEngine pattern).
 * Scoped to the active viewer & metadata provider and automatically invalidated
 * on BaseEntity save/delete/remote-invalidate events for thread-scoped entities.
 */
export interface CachedThreadWindow {
    threadId: string;
    viewerScopeKey: string;
    messages: readonly CachedSecureMessageRow[];
    files: readonly CachedMessageFileRow[];
    fileRequests: readonly CachedFileRequestRow[];
    includesFileRequests: boolean;
    loadedAt: number;
}

/** Options for {@link SecureMessagingEngineBase.LoadThreadWindow}. */
export interface LoadThreadWindowOptions {
    /** Include `File Requests` in the batched thread load. Defaults to `false`. */
    includeFileRequests?: boolean;
    /** Force bypassing the in-memory per-thread LRU cache. Defaults to `false`. */
    forceRefresh?: boolean;
    /** Optional user context (required server-side). */
    contextUser?: UserInfo;
    /** Optional explicit metadata provider override. */
    provider?: IMetadataProvider;
    /**
     * Explicit cache isolation key for the active viewer (for example a portal
     * `contactId` when a server route executes as `systemUser`). Falls back to
     * `contextUser?.ID ?? activeProvider?.CurrentUser?.ID ?? 'anonymous'`.
     */
    viewerScopeKey?: string;
}

/** Normalized entity names whose mutations invalidate the per-thread window cache. */
const THREAD_SCOPED_ENTITY_NAMES: ReadonlySet<string> = new Set([
    SECURE_MESSAGING_ENTITY_NAMES.SECURE_MESSAGES.toLowerCase(),
    SECURE_MESSAGING_ENTITY_NAMES.MESSAGE_FILES.toLowerCase(),
    SECURE_MESSAGING_ENTITY_NAMES.FILE_REQUESTS.toLowerCase(),
    SECURE_MESSAGING_ENTITY_NAMES.SECURE_THREADS.toLowerCase(),
    SECURE_MESSAGING_ENTITY_NAMES.PORTAL_SESSIONS.toLowerCase(),
]);

/** Escape single quotes for SQL literal interpolation. */
function escapeSqlLiteral(value: string): string {
    return (value || '').replace(/'/g, "''");
}

/**
 * Shared client + server metadata and bounded thread-window engine for MJ Secure Messaging.
 *
 * Lives in `@mj-biz-apps/secure-messaging-entities` (`shared` tier in `mj-app.json`) so both
 * Angular (`@mj-biz-apps/secure-messaging-ng`) and server packages (`core`/`server`/`actions`)
 * share one `BaseSingleton`-backed cache without crossing client/server package boundaries.
 *
 * ### What this engine caches globally (in {@link Config})
 * Only bounded lookup/configuration metadata:
 * - `MJ: Artifact Types` (`IsEnabled = 1`, `CacheLocal: true` — global non-RLS taxonomy)
 * - `MJ: Actions` (bounded to the 5 Secure Messaging + eSignature action names, `CacheLocal: true`)
 * - `MJ: File Storage Accounts` (`CacheLocal: false` — org account config; may be RLS/permission-scoped)
 * - `MJ: Signature Accounts` (`IsActive = 1`, `CacheLocal: false` — org eSignature config; may be RLS/permission-scoped)
 *
 * Every config entry is gated on entity existence AND `GetUserPermisions(user).CanRead` so
 * restricted/external users never hit permission errors during engine warmup.
 *
 * ### What this engine NEVER caches globally
 * Unbounded transactional or security-sensitive tables (`Secure Threads`, `Secure Messages`,
 * `Message Files`, `File Requests`, `Portal Sessions`, `Portal Magic Links`) are never loaded
 * globally. Instead, {@link LoadThreadWindow} maintains a bounded ConversationEngine-style LRU
 * cache per thread ID, scoped to the active viewer and provider, and automatically invalidated
 * on `BaseEntity` save/delete/remote-invalidate events.
 */
@RegisterForStartup()
export class SecureMessagingEngineBase extends BaseEngine<SecureMessagingEngineBase> {
    public static readonly DEFAULT_MAX_CACHED_THREADS = 50;
    public static readonly DEFAULT_MAX_MESSAGES_PER_THREAD = 200;
    public static readonly DEFAULT_MAX_FILES_PER_THREAD = 100;
    public static readonly DEFAULT_MAX_FILE_REQUESTS_PER_THREAD = 100;

    /** Maximum number of threads held in the per-thread LRU window cache. */
    public MaxCachedThreads: number = SecureMessagingEngineBase.DEFAULT_MAX_CACHED_THREADS;
    /** Maximum messages fetched per thread window. */
    public MaxMessagesPerThread: number = SecureMessagingEngineBase.DEFAULT_MAX_MESSAGES_PER_THREAD;
    /** Maximum files fetched per thread window. */
    public MaxFilesPerThread: number = SecureMessagingEngineBase.DEFAULT_MAX_FILES_PER_THREAD;
    /** Maximum file requests fetched per thread window. */
    public MaxFileRequestsPerThread: number = SecureMessagingEngineBase.DEFAULT_MAX_FILE_REQUESTS_PER_THREAD;

    // Backing arrays populated by BaseEngine.Load(...)
    private _artifactTypes: SecureMessagingArtifactTypeRef[] = [];
    private _actions: SecureMessagingActionRef[] = [];
    private _fileStorageAccounts: SecureMessagingStorageAccountRef[] = [];
    private _signatureAccounts: SecureMessagingSignatureAccountRef[] = [];

    // Derived lookup index rebuilt in AdditionalLoading
    private _actionIdByName: Map<string, string> = new Map();

    // Active provider tracking for multi-provider / impersonation safety
    private _activeProvider: IMetadataProvider | null = null;
    private _configuredProvider: IMetadataProvider | null = null;

    // Bounded per-thread window LRU cache (keyed by NormalizeUUID(threadId))
    private _threadCache: Map<string, CachedThreadWindow> = new Map();
    private _threadCacheViewerScopeKey: string | null = null;
    private _threadCacheProvider: IMetadataProvider | null = null;

    public static get Instance(): SecureMessagingEngineBase {
        return super.getInstance<SecureMessagingEngineBase>();
    }

    /**
     * Returns the explicitly bound provider from the latest {@link Config} call when present,
     * falling back to `BaseEngine.ProviderToUse`. Ensures multi-provider Angular hosts and
     * server impersonation paths never silently fall back to the global `Metadata.Provider`.
     */
    public override get ProviderToUse(): IMetadataProvider {
        return this._activeProvider ?? super.ProviderToUse;
    }

    protected override get EngineDefaultResultType(): 'simple' | 'entity_object' {
        return 'simple';
    }

    /** Cached enabled `MJ: Artifact Types` ordered by `Priority DESC`. */
    public get ArtifactTypes(): readonly SecureMessagingArtifactTypeRef[] {
        return this._artifactTypes;
    }

    /** Cached Secure Messaging / eSignature `MJ: Actions` references. */
    public get Actions(): readonly SecureMessagingActionRef[] {
        return this._actions;
    }

    /** Cached `MJ: File Storage Accounts` (loaded with `CacheLocal: false`). */
    public get FileStorageAccounts(): readonly SecureMessagingStorageAccountRef[] {
        return this._fileStorageAccounts;
    }

    /** Cached active `MJ: Signature Accounts` ordered by `IsDefault DESC, Name ASC` (`CacheLocal: false`). */
    public get ActiveSignatureAccounts(): readonly SecureMessagingSignatureAccountRef[] {
        return this._signatureAccounts;
    }

    /** Number of thread windows currently held in the bounded LRU cache. */
    public get CachedThreadCount(): number {
        return this._threadCache.size;
    }

    /**
     * Loads bounded lookup/configuration metadata via `BaseEngine.Load`.
     *
     * - Tracks `provider` via {@link ProviderToUse} and passes it unchanged to `super.Load`.
     * - Forces a refresh and clears per-thread caches if the provider switches.
     * - Gates each entity config on entity existence + `CanRead` permission.
     * - Uses `CacheLocal: true` ONLY on global non-RLS reference tables (`MJ: Artifact Types`,
     *   `MJ: Actions`) and `CacheLocal: false` on permissioned/RLS-eligible account config tables
     *   (`MJ: File Storage Accounts`, `MJ: Signature Accounts`).
     */
    public async Config(
        forceRefresh: boolean = false,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<void> {
        const incomingProvider = provider ?? null;
        const targetProvider = incomingProvider ?? super.ProviderToUse;
        const providerSwitched =
            this._configuredProvider != null &&
            targetProvider != null &&
            targetProvider !== this._configuredProvider;

        const incomingViewerKey = this.resolveViewerScopeKey(undefined, contextUser, targetProvider);
        const viewerSwitched =
            this._threadCacheViewerScopeKey != null &&
            incomingViewerKey !== this._threadCacheViewerScopeKey;

        if (providerSwitched || viewerSwitched) {
            this.ClearThreadCache();
        }
        if (providerSwitched) {
            this.resetMetadataState();
        }

        this._activeProvider = incomingProvider;
        this._configuredProvider = targetProvider ?? null;

        const effectiveForceRefresh = forceRefresh || providerSwitched;
        const configs = this.buildAuthorizedPropertyConfigs(targetProvider, contextUser);

        // Pass `provider` unchanged to super.Load — never hardcode Metadata.Provider.
        await super.Load(configs, provider as IMetadataProvider, effectiveForceRefresh, contextUser);
    }

    protected override async AdditionalLoading(_contextUser?: UserInfo): Promise<void> {
        this.rebuildActionIndex();
    }

    // =========================================================================
    // LOOKUP HELPERS (ZERO-ROUND-TRIP READS OVER CACHED METADATA)
    // =========================================================================

    /**
     * Resolves a cached MJ Action ID by case-insensitive name.
     * Returns `null` if the action is not present in the cached set.
     */
    public GetActionId(actionName: string): string | null {
        const key = actionName?.trim().toLowerCase();
        if (!key) {
            return null;
        }
        const indexed = this._actionIdByName.get(key);
        if (indexed) {
            return indexed;
        }
        const matched = this._actions.find(a => a.Name?.trim().toLowerCase() === key);
        if (matched?.ID) {
            this._actionIdByName.set(key, matched.ID);
            return matched.ID;
        }
        return null;
    }

    /**
     * Resolves an Action ID from cache first, falling back to a single projected `RunView`
     * only when the requested action name is outside the preloaded Secure Messaging set.
     */
    public async ResolveActionId(
        actionName: string,
        contextUser?: UserInfo,
        provider?: IMetadataProvider
    ): Promise<string | null> {
        await this.Config(false, contextUser, provider);
        const cached = this.GetActionId(actionName);
        if (cached) {
            return cached;
        }

        const activeProvider = provider ?? this.ProviderToUse;
        if (!this.canReadEntity(SECURE_MESSAGING_ENTITY_NAMES.MJ_ACTIONS, activeProvider, contextUser)) {
            return null;
        }

        const rv = RunView.FromMetadataProvider(activeProvider);
        const res = await rv.RunView<SecureMessagingActionRef>(
            {
                EntityName: SECURE_MESSAGING_ENTITY_NAMES.MJ_ACTIONS,
                ExtraFilter: `Name = '${escapeSqlLiteral(actionName)}'`,
                Fields: ['ID', 'Name'],
                MaxRows: 1,
                ResultType: 'simple',
            },
            contextUser
        );
        if (!res.Success || !res.Results || res.Results.length === 0) {
            return null;
        }
        const found = res.Results[0];
        if (found?.ID) {
            this._actionIdByName.set(actionName.trim().toLowerCase(), found.ID);
            return found.ID;
        }
        return null;
    }

    /**
     * Resolves the best matching `MJ: Artifact Types.ID` for a MIME type using the cached
     * enabled artifact types (ordered by `Priority DESC`):
     *   1. Exact `ContentType` match
     *   2. Wildcard match (e.g. `image/*`)
     *   3. Generic `'Document'` fallback (by `ContentType` or `Name`)
     *   4. Highest-priority enabled artifact type
     */
    public ResolveArtifactTypeId(contentType: string): string | null {
        const types = this._artifactTypes;
        if (types.length === 0) {
            return null;
        }
        const ct = (contentType || '').toLowerCase().trim();
        const exact = types.find(t => (t.ContentType || '').toLowerCase() === ct);
        if (exact) {
            return exact.ID;
        }
        const wildcard = types.find(t => {
            const pat = (t.ContentType || '').toLowerCase();
            return pat.endsWith('/*') && ct.startsWith(pat.slice(0, -1));
        });
        if (wildcard) {
            return wildcard.ID;
        }
        const fallback =
            types.find(t => (t.ContentType || '').toLowerCase() === FALLBACK_ARTIFACT_TYPE_NAME.toLowerCase()) ??
            types.find(t => (t.Name || '').toLowerCase() === FALLBACK_ARTIFACT_TYPE_NAME.toLowerCase());
        return fallback?.ID ?? types[0].ID;
    }

    /**
     * Finds the first cached `MJ: File Storage Accounts` row matching `providerId`
     * using UUID-case-insensitive {@link UUIDsEqual}.
     */
    public FindStorageAccountByProviderId(providerId: string): SecureMessagingStorageAccountRef | undefined {
        if (!providerId) {
            return undefined;
        }
        return this._fileStorageAccounts.find(a => UUIDsEqual(a.ProviderID, providerId));
    }

    /**
     * Formats cached active `MJ: Signature Accounts` as picker options for Angular UIs.
     */
    public GetActiveSignatureAccountOptions(): Array<{ id: string; label: string }> {
        return this._signatureAccounts.map(r => ({
            id: String(r.ID),
            label: `${r.Name}${r.SignatureProvider ? ` (${r.SignatureProvider})` : ''}`,
        }));
    }

    // =========================================================================
    // BOUNDED PER-THREAD WINDOW CACHE (ConversationEngine PATTERN)
    // =========================================================================

    /**
     * Returns a cached thread window without issuing any network/DB request,
     * refreshing its LRU recency if present.
     */
    public GetCachedThreadWindow(threadId: string): CachedThreadWindow | undefined {
        if (!threadId) {
            return undefined;
        }
        const key = NormalizeUUID(threadId);
        const entry = this._threadCache.get(key);
        if (!entry) {
            return undefined;
        }
        // Refresh LRU recency
        this._threadCache.delete(key);
        this._threadCache.set(key, entry);
        return entry;
    }

    /**
     * Loads a single thread's bounded window (messages + files, and optionally file requests)
     * in ONE batched `rv.RunViews([...])` call, caching the result in a bounded LRU map scoped
     * to the active viewer and provider.
     *
     * Automatically clears the cache when the active viewer or provider changes, and evicts
     * the least-recently-used thread once {@link MaxCachedThreads} is exceeded.
     */
    public async LoadThreadWindow(
        threadId: string,
        options?: LoadThreadWindowOptions
    ): Promise<CachedThreadWindow> {
        // Ensure global BaseEntity event listener is active even if called prior to Config()
        await this.SetupGlobalEventListener();

        const includeFileRequests = options?.includeFileRequests === true;
        const activeProvider = options?.provider ?? this.ProviderToUse;
        const viewerScopeKey = this.resolveViewerScopeKey(
            options?.viewerScopeKey,
            options?.contextUser,
            activeProvider
        );

        if (
            (this._threadCacheViewerScopeKey != null && viewerScopeKey !== this._threadCacheViewerScopeKey) ||
            (this._threadCacheProvider != null && activeProvider !== this._threadCacheProvider)
        ) {
            this.ClearThreadCache();
        }
        this._threadCacheViewerScopeKey = viewerScopeKey;
        this._threadCacheProvider = activeProvider ?? null;

        const key = NormalizeUUID(threadId);
        if (!options?.forceRefresh) {
            const cached = this.GetCachedThreadWindow(threadId);
            if (cached && (!includeFileRequests || cached.includesFileRequests)) {
                return cached;
            }
        }

        const escapedThreadId = escapeSqlLiteral(threadId);
        const views: RunViewParams[] = [
            {
                EntityName: SECURE_MESSAGING_ENTITY_NAMES.SECURE_MESSAGES,
                ExtraFilter: `ThreadID = '${escapedThreadId}'`,
                OrderBy: 'ReceivedAt ASC',
                MaxRows: this.MaxMessagesPerThread,
                Fields: [
                    'ID',
                    'ThreadID',
                    'PortalSessionID',
                    'PersonID',
                    'Direction',
                    'Sender',
                    'Recipient',
                    'Subject',
                    'Content',
                    'IsSecure',
                    'Status',
                    'ReceivedAt',
                    'IsStarred',
                    'IsImported',
                    'SourceChannel',
                ],
                ResultType: 'simple',
            },
            {
                EntityName: SECURE_MESSAGING_ENTITY_NAMES.MESSAGE_FILES,
                ExtraFilter: `ThreadID = '${escapedThreadId}'`,
                OrderBy: '__mj_CreatedAt ASC',
                MaxRows: this.MaxFilesPerThread,
                Fields: [
                    'ID',
                    'ThreadID',
                    'SecureMessageID',
                    'ExternalMessageID',
                    'ArtifactID',
                    'FileID',
                    'Filename',
                    'ContentType',
                    'Size',
                    '__mj_CreatedAt',
                ],
                ResultType: 'simple',
            },
        ];

        const canLoadFileRequests =
            includeFileRequests &&
            this.canReadEntity(SECURE_MESSAGING_ENTITY_NAMES.FILE_REQUESTS, activeProvider, options?.contextUser);

        if (canLoadFileRequests) {
            views.push({
                EntityName: SECURE_MESSAGING_ENTITY_NAMES.FILE_REQUESTS,
                ExtraFilter: `ThreadID = '${escapedThreadId}'`,
                OrderBy: '__mj_CreatedAt DESC',
                MaxRows: this.MaxFileRequestsPerThread,
                Fields: [
                    'ID',
                    'ThreadID',
                    'PortalSessionID',
                    'Title',
                    'Instructions',
                    'Status',
                    'DueAt',
                    'FulfilledAt',
                    '__mj_CreatedAt',
                ],
                ResultType: 'simple',
            });
        }

        const rv = RunView.FromMetadataProvider(activeProvider);
        const results = await rv.RunViews(views, options?.contextUser);

        const messagesResult = results[0];
        const filesResult = results[1];
        const fileRequestsResult = canLoadFileRequests ? results[2] : undefined;

        const windowEntry: CachedThreadWindow = {
            threadId,
            viewerScopeKey,
            messages: messagesResult?.Success && Array.isArray(messagesResult.Results)
                ? (messagesResult.Results as CachedSecureMessageRow[]).slice(0, this.MaxMessagesPerThread)
                : [],
            files: filesResult?.Success && Array.isArray(filesResult.Results)
                ? (filesResult.Results as CachedMessageFileRow[]).slice(0, this.MaxFilesPerThread)
                : [],
            fileRequests: fileRequestsResult?.Success && Array.isArray(fileRequestsResult.Results)
                ? (fileRequestsResult.Results as CachedFileRequestRow[]).slice(0, this.MaxFileRequestsPerThread)
                : [],
            includesFileRequests: includeFileRequests,
            loadedAt: Date.now(),
        };

        // Only cache when the core message/file reads succeeded so transient failures aren't pinned.
        if (messagesResult?.Success && filesResult?.Success && (!canLoadFileRequests || fileRequestsResult?.Success)) {
            this.storeThreadWindow(key, windowEntry);
        }

        return windowEntry;
    }

    /** Removes a single thread from the per-thread LRU window cache. */
    public InvalidateThread(threadId: string): void {
        if (!threadId) {
            return;
        }
        this._threadCache.delete(NormalizeUUID(threadId));
    }

    /** Evicts all cached thread windows. */
    public ClearThreadCache(): void {
        this._threadCache.clear();
    }

    // =========================================================================
    // ENTITY EVENT INVALIDATION
    // =========================================================================

    /**
     * Watches `BaseEntity` save, delete, and remote-invalidate events for thread-scoped entities
     * (`Secure Messages`, `Message Files`, `File Requests`, `Secure Threads`, `Portal Sessions`)
     * so the bounded per-thread window cache never serves stale state after edits, sends, uploads,
     * archives, or deletes. All other entities delegate to `super.HandleIndividualBaseEntityEvent`.
     */
    protected override async HandleIndividualBaseEntityEvent(event: BaseEntityEvent): Promise<boolean> {
        const entityName = event.baseEntity?.EntityInfo?.Name || event.entityName;
        if (entityName) {
            const normalizedName = entityName.toLowerCase().trim();
            if (THREAD_SCOPED_ENTITY_NAMES.has(normalizedName)) {
                if (
                    event.type === 'save' ||
                    event.type === 'delete' ||
                    event.type === 'remote-invalidate'
                ) {
                    if (normalizedName === SECURE_MESSAGING_ENTITY_NAMES.PORTAL_SESSIONS.toLowerCase()) {
                        this.ClearThreadCache();
                    } else {
                        const threadId = this.extractThreadIdFromEvent(event, normalizedName);
                        if (threadId) {
                            this.InvalidateThread(threadId);
                        } else {
                            // Conservative fallback when ThreadID cannot be extracted (e.g. minimal remote-invalidate)
                            this.ClearThreadCache();
                        }
                    }
                }
                return true;
            }
        }

        return await super.HandleIndividualBaseEntityEvent(event);
    }

    // =========================================================================
    // PRIVATE HELPERS
    // =========================================================================

    /**
     * Builds the `BaseEnginePropertyConfig[]` array gated by entity existence and `CanRead`.
     * Entities that are absent or unreadable by the current user have their backing array cleared
     * and are omitted so restricted users never trigger permission errors.
     */
    private buildAuthorizedPropertyConfigs(
        provider: IMetadataProvider | undefined,
        contextUser?: UserInfo
    ): Partial<BaseEnginePropertyConfig>[] {
        const configs: Partial<BaseEnginePropertyConfig>[] = [];

        if (this.canReadEntity(SECURE_MESSAGING_ENTITY_NAMES.MJ_ARTIFACT_TYPES, provider, contextUser)) {
            configs.push({
                Type: 'entity',
                EntityName: SECURE_MESSAGING_ENTITY_NAMES.MJ_ARTIFACT_TYPES,
                PropertyName: '_artifactTypes',
                Filter: 'IsEnabled = 1',
                OrderBy: 'Priority DESC',
                ResultType: 'simple',
                CacheLocal: true,
            });
        } else {
            this._artifactTypes = [];
        }

        if (this.canReadEntity(SECURE_MESSAGING_ENTITY_NAMES.MJ_ACTIONS, provider, contextUser)) {
            const actionNameFilter = SECURE_MESSAGING_ACTION_NAMES
                .map(name => `'${escapeSqlLiteral(name)}'`)
                .join(', ');
            configs.push({
                Type: 'entity',
                EntityName: SECURE_MESSAGING_ENTITY_NAMES.MJ_ACTIONS,
                PropertyName: '_actions',
                Filter: `Name IN (${actionNameFilter})`,
                OrderBy: 'Name ASC',
                ResultType: 'simple',
                CacheLocal: true,
            });
        } else {
            this._actions = [];
            this._actionIdByName.clear();
        }

        // Org storage accounts can be RLS/tenant-scoped or admin-restricted → CacheLocal: false
        if (this.canReadEntity(SECURE_MESSAGING_ENTITY_NAMES.MJ_FILE_STORAGE_ACCOUNTS, provider, contextUser)) {
            configs.push({
                Type: 'entity',
                EntityName: SECURE_MESSAGING_ENTITY_NAMES.MJ_FILE_STORAGE_ACCOUNTS,
                PropertyName: '_fileStorageAccounts',
                OrderBy: 'Name ASC',
                ResultType: 'simple',
                CacheLocal: false,
            });
        } else {
            this._fileStorageAccounts = [];
        }

        // Org eSignature accounts can be RLS/tenant-scoped or admin-restricted → CacheLocal: false
        if (this.canReadEntity(SECURE_MESSAGING_ENTITY_NAMES.MJ_SIGNATURE_ACCOUNTS, provider, contextUser)) {
            configs.push({
                Type: 'entity',
                EntityName: SECURE_MESSAGING_ENTITY_NAMES.MJ_SIGNATURE_ACCOUNTS,
                PropertyName: '_signatureAccounts',
                Filter: 'IsActive = 1',
                OrderBy: 'IsDefault DESC, Name ASC',
                ResultType: 'simple',
                CacheLocal: false,
            });
        } else {
            this._signatureAccounts = [];
        }

        return configs;
    }

    /**
     * Checks both entity existence in metadata AND the active user's `CanRead` permission.
     * Safe when optional entities (e.g. `MJ: Signature Accounts`) are not installed or when
     * restricted portal/external users lack read access.
     */
    protected canReadEntity(
        entityName: string,
        provider: IMetadataProvider | undefined,
        contextUser?: UserInfo
    ): boolean {
        if (!provider) {
            return false;
        }
        const entityInfo =
            typeof provider.EntityByName === 'function'
                ? provider.EntityByName(entityName)
                : provider.Entities?.find(e => e.Name === entityName);
        if (!entityInfo) {
            return false;
        }
        const user = contextUser ?? provider.CurrentUser;
        if (!user) {
            return true;
        }
        if (typeof entityInfo.GetUserPermisions !== 'function') {
            return true;
        }
        try {
            const perms = entityInfo.GetUserPermisions(user);
            return perms?.CanRead === true;
        } catch {
            return false;
        }
    }

    private resolveViewerScopeKey(
        explicitScopeKey: string | undefined,
        contextUser: UserInfo | undefined,
        provider: IMetadataProvider | undefined
    ): string {
        if (explicitScopeKey && explicitScopeKey.trim().length > 0) {
            return NormalizeUUID(explicitScopeKey.trim());
        }
        const userId = contextUser?.ID ?? provider?.CurrentUser?.ID;
        if (userId && userId.trim().length > 0) {
            return NormalizeUUID(userId.trim());
        }
        return 'anonymous';
    }

    private storeThreadWindow(normalizedKey: string, entry: CachedThreadWindow): void {
        if (this.MaxCachedThreads <= 0) {
            return;
        }
        if (this._threadCache.has(normalizedKey)) {
            this._threadCache.delete(normalizedKey);
        } else {
            while (this._threadCache.size >= this.MaxCachedThreads) {
                const oldestKey = this._threadCache.keys().next().value;
                if (oldestKey === undefined) {
                    break;
                }
                this._threadCache.delete(oldestKey);
            }
        }
        this._threadCache.set(normalizedKey, entry);
    }

    private rebuildActionIndex(): void {
        this._actionIdByName.clear();
        for (const action of this._actions) {
            if (action.Name && action.ID) {
                this._actionIdByName.set(action.Name.trim().toLowerCase(), action.ID);
            }
        }
    }

    private resetMetadataState(): void {
        this._artifactTypes = [];
        this._actions = [];
        this._fileStorageAccounts = [];
        this._signatureAccounts = [];
        this._actionIdByName.clear();
    }

    private extractThreadIdFromEvent(event: BaseEntityEvent, normalizedEntityName: string): string | null {
        const isThreadEntity = normalizedEntityName === SECURE_MESSAGING_ENTITY_NAMES.SECURE_THREADS.toLowerCase();
        const entity = event.baseEntity;

        if (entity) {
            if (isThreadEntity) {
                if (entity instanceof mjBizAppsSecureMessagingSecureThreadEntity && entity.ID) {
                    return entity.ID;
                }
                const pkVal = entity.PrimaryKey?.GetValueByIndex?.(0);
                if (typeof pkVal === 'string' && pkVal.length > 0) {
                    return pkVal;
                }
                const typedThread = entity as Partial<Pick<mjBizAppsSecureMessagingSecureThreadEntity, 'ID'>>;
                if (typeof typedThread.ID === 'string' && typedThread.ID.length > 0) {
                    return typedThread.ID;
                }
            } else {
                if (
                    entity instanceof mjBizAppsSecureMessagingSecureMessageEntity ||
                    entity instanceof mjBizAppsSecureMessagingMessageFileEntity ||
                    entity instanceof mjBizAppsSecureMessagingFileRequestEntity
                ) {
                    if (entity.ThreadID) {
                        return entity.ThreadID;
                    }
                }
                const typedChild = entity as Partial<Pick<mjBizAppsSecureMessagingSecureMessageEntity, 'ThreadID'>>;
                if (typeof typedChild.ThreadID === 'string' && typedChild.ThreadID.length > 0) {
                    return typedChild.ThreadID;
                }
            }
        }

        if (event.type === 'remote-invalidate' && event.payload && typeof event.payload === 'object') {
            const payload = event.payload as RemoteInvalidatePayload;
            if (payload.recordData) {
                try {
                    const parsed = JSON.parse(payload.recordData) as Partial<{ ID: string; ThreadID: string }>;
                    if (isThreadEntity && typeof parsed.ID === 'string' && parsed.ID.length > 0) {
                        return parsed.ID;
                    }
                    if (!isThreadEntity && typeof parsed.ThreadID === 'string' && parsed.ThreadID.length > 0) {
                        return parsed.ThreadID;
                    }
                } catch {
                    // Fall through to conservative invalidation
                }
            }
            if (isThreadEntity && typeof payload.primaryKeyValues === 'string' && payload.primaryKeyValues.length > 0) {
                const parsedId = this.parsePrimaryKeyValue(payload.primaryKeyValues);
                if (parsedId) {
                    return parsedId;
                }
            }
        }

        return null;
    }

    private parsePrimaryKeyValue(primaryKeyValues: string): string | null {
        const trimmed = primaryKeyValues.trim();
        if (!trimmed) {
            return null;
        }
        // Handle formats like "ID|uuid" or raw "uuid"
        const pipeIdx = trimmed.indexOf('|');
        if (pipeIdx >= 0 && pipeIdx < trimmed.length - 1) {
            return trimmed.slice(pipeIdx + 1).trim() || null;
        }
        return trimmed;
    }
}
