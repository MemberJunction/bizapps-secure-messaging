/**
 * Cross-stack batched MessageFile.ArtifactID resolution and adversarial cross-tenant
 * RLS boundary verification helpers.
 *
 * Uses ArtifactFileStore, PortalAuthService, SecureMessagingEngineBase, and batched
 * RunView.RunViews([...]) with ResultType: 'simple' and chunked ID IN (...) clauses
 * (max 200 IDs per chunk, zero N+1 hydration loops, zero raw SQL subqueries, zero any/unknown).
 */
import { RunView, type RunViewParams } from '@memberjunction/core';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration/registry';
import {
    ArtifactFileStore,
    PortalAuthService,
    type StoredFile,
} from '@mj-biz-apps/secure-messaging-core';
import { SecureMessagingEngineBase } from '@mj-biz-apps/secure-messaging-entities';
import { E_ARTIFACT, E_ARTIFACT_VERSION } from '../entity-names.js';
import { BuildInClause, ChunkIds, IN_CLAUSE_CHUNK_SIZE } from '../entity-io.js';

export interface ArtifactSummaryRow {
    ID: string;
    Name: string;
    Description: string | null;
    TypeID: string;
    UserID: string;
}

export interface ArtifactVersionSummaryRow {
    ID: string;
    ArtifactID: string;
    VersionNumber: number;
    Name: string | null;
    ContentMode: 'File' | 'Text' | null;
    MimeType: string | null;
    Content: string | null;
    FileID: string | null;
    ContentSizeBytes: number | null;
}

export interface ResolvedThreadAttachment {
    readonly messageFileId: string;
    readonly filename: string;
    readonly contentType: string;
    readonly size: number;
    readonly fileId: string;
    readonly kind: 'artifact' | 'binary-fallback';
    readonly artifactId: string | null;
    readonly artifactName: string | null;
    readonly latestVersionNumber: number | null;
    readonly latestVersionId: string | null;
    readonly latestVersionMimeType: string | null;
    readonly latestVersionContent: string | null;
}

export interface BatchArtifactResolutionResult {
    readonly threadId: string;
    readonly attachments: readonly ResolvedThreadAttachment[];
    readonly artifactCount: number;
    readonly binaryFallbackCount: number;
    readonly batchedQueryChunks: number;
}

export interface CrossTenantAccessAudit {
    readonly attackerContactId: string;
    readonly victimThreadId: string;
    readonly victimMessageFileId: string;
    readonly threadStatusResult: 'Active' | 'Closed' | 'Archived' | null;
    readonly threadAccessDenied: boolean;
    readonly crossThreadDownloadRejected: boolean;
    readonly crossThreadDownloadError: string;
    readonly cacheIsolatedOnViewerSwitch: boolean;
}

/**
 * Resolves all attachments for a thread using ArtifactFileStore.listThreadFiles followed by
 * ONE batched RunView.RunViews([...]) call with chunked `ID IN (...)` / `ArtifactID IN (...)`
 * filters (`ResultType: 'simple'`, explicit `Fields`) — zero N+1 hydration loops.
 */
export async function BatchResolveThreadMessageFileArtifacts(
    ctx: IntegrationCheckContext,
    threadId: string,
    fileStore: ArtifactFileStore = new ArtifactFileStore(),
): Promise<BatchArtifactResolutionResult> {
    const files: StoredFile[] = await fileStore.listThreadFiles(threadId, ctx.User);
    const artifactIds: string[] = [];
    for (const f of files) {
        const trimmed = f.artifactId.trim();
        if (trimmed.length > 0) {
            artifactIds.push(trimmed);
        }
    }

    const idChunks = ChunkIds(artifactIds, IN_CLAUSE_CHUNK_SIZE);
    const artifactsById = new Map<string, ArtifactSummaryRow>();
    const latestVersionByArtifactId = new Map<string, ArtifactVersionSummaryRow>();

    if (idChunks.length > 0) {
        const views: RunViewParams[] = [];
        for (const chunk of idChunks) {
            views.push({
                EntityName: E_ARTIFACT,
                ExtraFilter: BuildInClause('ID', chunk),
                Fields: ['ID', 'Name', 'Description', 'TypeID', 'UserID'],
                ResultType: 'simple',
            });
            views.push({
                EntityName: E_ARTIFACT_VERSION,
                ExtraFilter: BuildInClause('ArtifactID', chunk),
                Fields: [
                    'ID',
                    'ArtifactID',
                    'VersionNumber',
                    'Name',
                    'ContentMode',
                    'MimeType',
                    'Content',
                    'FileID',
                    'ContentSizeBytes',
                ],
                OrderBy: 'VersionNumber DESC',
                ResultType: 'simple',
            });
        }

        const rv = RunView.FromMetadataProvider(ctx.Provider);
        const batchResults = await rv.RunViews(views, ctx.User);

        for (let i = 0; i < idChunks.length; i++) {
            const artRes = batchResults[i * 2];
            const verRes = batchResults[i * 2 + 1];

            if (!artRes?.Success) {
                throw new Error(`Batched artifact lookup failed: ${artRes?.ErrorMessage || 'query error'}`);
            }
            if (!verRes?.Success) {
                throw new Error(`Batched artifact version lookup failed: ${verRes?.ErrorMessage || 'query error'}`);
            }

            const artRows = (artRes.Results ?? []) as ArtifactSummaryRow[];
            for (const row of artRows) {
                artifactsById.set(row.ID.toLowerCase(), row);
            }

            const verRows = (verRes.Results ?? []) as ArtifactVersionSummaryRow[];
            for (const ver of verRows) {
                const key = ver.ArtifactID.toLowerCase();
                const current = latestVersionByArtifactId.get(key);
                if (!current || ver.VersionNumber > current.VersionNumber) {
                    latestVersionByArtifactId.set(key, ver);
                }
            }
        }
    }

    const resolved: ResolvedThreadAttachment[] = files.map((file) => {
        const normalizedArtifactId = file.artifactId.trim() || null;
        if (!normalizedArtifactId) {
            return {
                messageFileId: file.messageFileId,
                filename: file.filename,
                contentType: file.contentType,
                size: file.size,
                fileId: file.fileId,
                kind: 'binary-fallback',
                artifactId: null,
                artifactName: null,
                latestVersionNumber: null,
                latestVersionId: null,
                latestVersionMimeType: null,
                latestVersionContent: null,
            };
        }

        const lookupKey = normalizedArtifactId.toLowerCase();
        const artifact = artifactsById.get(lookupKey) ?? null;
        const latestVer = latestVersionByArtifactId.get(lookupKey) ?? null;

        return {
            messageFileId: file.messageFileId,
            filename: file.filename,
            contentType: file.contentType,
            size: file.size,
            fileId: file.fileId,
            kind: 'artifact',
            artifactId: normalizedArtifactId,
            artifactName: artifact?.Name ?? null,
            latestVersionNumber: latestVer?.VersionNumber ?? null,
            latestVersionId: latestVer?.ID ?? null,
            latestVersionMimeType: latestVer?.MimeType ?? null,
            latestVersionContent: latestVer?.Content ?? null,
        };
    });

    const artifactCount = resolved.filter((a) => a.kind === 'artifact').length;
    const binaryFallbackCount = resolved.filter((a) => a.kind === 'binary-fallback').length;

    return {
        threadId,
        attachments: resolved,
        artifactCount,
        binaryFallbackCount,
        batchedQueryChunks: idChunks.length,
    };
}

/**
 * Verifies an authorized participant of Organization A can access their thread and
 * resolve attached MJ Doc artifacts + binary fallback files end-to-end.
 */
export async function VerifyAuthorizedTenantArtifactResolution(
    ctx: IntegrationCheckContext,
    authorizedContactId: string,
    threadId: string,
    fileStore: ArtifactFileStore = new ArtifactFileStore(),
): Promise<{
    readonly threadStatus: 'Active' | 'Closed' | 'Archived';
    readonly resolution: BatchArtifactResolutionResult;
}> {
    const status = await PortalAuthService.Instance.contactThreadStatus(
        authorizedContactId,
        threadId,
        ctx.User,
    );
    if (!status) {
        throw new Error(
            `Authorized contact '${authorizedContactId}' was unexpectedly denied access to thread '${threadId}'`,
        );
    }

    const resolution = await BatchResolveThreadMessageFileArtifacts(ctx, threadId, fileStore);
    return { threadStatus: status, resolution };
}

/**
 * Adversarial cross-tenant RLS boundary verifier:
 * Proves an authenticated user from Organization B (`attackerContactId`) cannot:
 *  1. Pass `PortalAuthService.contactThreadStatus` for Organization A's thread (`victimThreadId`)
 *  2. Supply Organization A's `victimMessageFileId` against Organization B's `attackerThreadId`
 *     in `ArtifactFileStore.getDownloadUrl`
 *  3. Read Organization A's cached thread window from `SecureMessagingEngineBase` after
 *     viewer scope switches from Organization A (`victimContactId`) to Organization B (`attackerContactId`).
 */
export async function EvaluateCrossTenantArtifactBoundary(
    ctx: IntegrationCheckContext,
    params: {
        readonly victimContactId: string;
        readonly victimThreadId: string;
        readonly victimMessageFileId: string;
        readonly attackerContactId: string;
        readonly attackerThreadId: string;
    },
    fileStore: ArtifactFileStore = new ArtifactFileStore(),
): Promise<CrossTenantAccessAudit> {
    // 1. Cross-tenant thread authorization must fail closed (null)
    const threadStatusResult = await PortalAuthService.Instance.contactThreadStatus(
        params.attackerContactId,
        params.victimThreadId,
        ctx.User,
    );
    const threadAccessDenied = threadStatusResult === null;

    // 2. Cross-thread MessageFile ID injection into ArtifactFileStore.getDownloadUrl must reject
    let crossThreadDownloadRejected = false;
    let crossThreadDownloadError = '';
    try {
        await fileStore.getDownloadUrl(
            params.victimMessageFileId,
            params.attackerThreadId,
            ctx.User,
        );
    } catch (err) {
        crossThreadDownloadRejected = true;
        crossThreadDownloadError = err instanceof Error ? err.message : String(err);
    }

    // 3. Per-thread LRU window cache must isolate across viewerScopeKey switch (Org A -> Org B)
    const engine = SecureMessagingEngineBase.Instance;
    engine.ClearThreadCache();
    await engine.LoadThreadWindow(params.victimThreadId, {
        contextUser: ctx.User,
        provider: ctx.Provider,
        viewerScopeKey: params.victimContactId,
    });
    const hadVictimCached = engine.GetCachedThreadWindow(params.victimThreadId) !== undefined;

    await engine.LoadThreadWindow(params.attackerThreadId, {
        contextUser: ctx.User,
        provider: ctx.Provider,
        viewerScopeKey: params.attackerContactId,
    });
    const victimEvictedForAttacker = engine.GetCachedThreadWindow(params.victimThreadId) === undefined;
    const cacheIsolatedOnViewerSwitch = hadVictimCached && victimEvictedForAttacker;

    return {
        attackerContactId: params.attackerContactId,
        victimThreadId: params.victimThreadId,
        victimMessageFileId: params.victimMessageFileId,
        threadStatusResult,
        threadAccessDenied,
        crossThreadDownloadRejected,
        crossThreadDownloadError,
        cacheIsolatedOnViewerSwitch,
    };
}
