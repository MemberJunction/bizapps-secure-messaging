/**
 * Strongly-typed entity read/write helpers for SM-WORLD integration tests.
 *
 * Uses RunView.FromMetadataProvider (ResultType: 'simple', explicit Fields, chunked ID IN (...))
 * and generated BaseEntity subclasses with direct typed property mutation — zero `any`,
 * zero `unknown` casts, zero `BaseEntity.Get()/Set()`, and zero raw SQL subqueries.
 */
import {
    BaseEntity,
    CompositeKey,
    RunView,
    type RunViewParams,
} from '@memberjunction/core';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration/registry';

/** Maximum number of UUIDs per SQL `IN (...)` clause per BizApps Rule 5. */
export const IN_CLAUSE_CHUNK_SIZE = 200;

/** Strongly-typed entity subclass with a primary string ID column. */
export interface IdentifiableEntity extends BaseEntity {
    ID: string;
}

export function Quote(value: string): string {
    return value.replace(/'/g, "''");
}

/** Splits an ID array into deterministic chunks of at most {@link IN_CLAUSE_CHUNK_SIZE}. */
export function ChunkIds(ids: readonly string[], chunkSize: number = IN_CLAUSE_CHUNK_SIZE): string[][] {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const id of ids) {
        const trimmed = id.trim();
        if (trimmed && !seen.has(trimmed)) {
            seen.add(trimmed);
            unique.push(trimmed);
        }
    }
    const chunks: string[][] = [];
    for (let i = 0; i < unique.length; i += chunkSize) {
        chunks.push(unique.slice(i, i + chunkSize));
    }
    return chunks;
}

/** Builds a safe SQL `column IN ('id1', 'id2')` predicate for a non-empty chunk of IDs. */
export function BuildInClause(columnName: string, ids: readonly string[]): string {
    const literals = ids.map((id) => `'${Quote(id)}'`).join(', ');
    return `${columnName} IN (${literals})`;
}

export async function FindId(
    ctx: IntegrationCheckContext,
    entityName: string,
    extraFilter: string,
): Promise<string | null> {
    const rows = await FindRows<{ ID: string }>(ctx, entityName, extraFilter, ['ID'], 1);
    return rows[0]?.ID ?? null;
}

export async function FindRows<T extends object>(
    ctx: IntegrationCheckContext,
    entityName: string,
    extraFilter: string,
    fields: string[],
    maxRows?: number,
    orderBy?: string,
): Promise<T[]> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const params: RunViewParams = {
        EntityName: entityName,
        ExtraFilter: extraFilter || undefined,
        Fields: fields,
        ResultType: 'simple',
    };
    if (maxRows !== undefined) {
        params.MaxRows = maxRows;
    }
    if (orderBy) {
        params.OrderBy = orderBy;
    }
    const res = await rv.RunView<T>(params, ctx.User);
    if (!res.Success) {
        throw new Error(`RunView ${entityName} failed: ${res.ErrorMessage || 'query error'}`);
    }
    return res.Results ?? [];
}

/**
 * Executes a batch of projected `ResultType: 'simple'` RunView queries in a single round-trip.
 */
export async function FindRowsBatch(
    ctx: IntegrationCheckContext,
    views: RunViewParams[],
): Promise<Array<ReadonlyArray<object>>> {
    if (views.length === 0) {
        return [];
    }
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const results = await rv.RunViews(views, ctx.User);
    return results.map((res, idx) => {
        if (!res.Success) {
            const entityName = views[idx]?.EntityName ?? `view[${idx}]`;
            throw new Error(`Batched RunViews ${entityName} failed: ${res.ErrorMessage || 'query error'}`);
        }
        return (res.Results ?? []) as ReadonlyArray<object>;
    });
}

/**
 * Loads rows matching an array of IDs on `columnName` via chunked `IN (...)` predicates
 * batched in ONE `rv.RunViews([...])` call (RLS-safe two-step read, zero SQL subqueries).
 */
export async function FindRowsByIds<T extends object>(
    ctx: IntegrationCheckContext,
    entityName: string,
    columnName: string,
    ids: readonly string[],
    fields: string[],
    orderBy?: string,
): Promise<T[]> {
    const chunks = ChunkIds(ids);
    if (chunks.length === 0) {
        return [];
    }
    const views: RunViewParams[] = chunks.map((chunk) => ({
        EntityName: entityName,
        ExtraFilter: BuildInClause(columnName, chunk),
        Fields: fields,
        OrderBy: orderBy,
        ResultType: 'simple',
    }));
    const batched = await FindRowsBatch(ctx, views);
    const merged: T[] = [];
    for (const part of batched) {
        for (const row of part) {
            merged.push(row as T);
        }
    }
    return merged;
}

/**
 * Create or update a strongly-typed generated BaseEntity subclass row using direct
 * typed property assignment (`apply(entity)`) — zero `BaseEntity.Get()/Set()`.
 */
export async function UpsertEntity<T extends IdentifiableEntity>(
    ctx: IntegrationCheckContext,
    entityName: string,
    keyFilter: string,
    apply: (entity: T) => void,
): Promise<string> {
    const entity = await ctx.Provider.GetEntityObject<T>(entityName, ctx.User);
    const existing = await FindId(ctx, entityName, keyFilter);
    if (existing) {
        const key = new CompositeKey();
        key.KeyValuePairs.push({ FieldName: 'ID', Value: existing });
        const loaded = await entity.InnerLoad(key);
        if (!loaded) {
            throw new Error(`Could not load existing ${entityName} ${existing}`);
        }
    } else {
        entity.NewRecord();
    }

    apply(entity);

    if (!(await entity.Save())) {
        const result = entity.LatestResult;
        const detail =
            (result?.Errors ?? [])
                .map((e) => (typeof e === 'string' ? e : JSON.stringify(e)))
                .join('; ') || result?.CompleteMessage || 'no reason given';
        throw new Error(`Could not save '${entityName}' (${keyFilter}): ${detail}`);
    }

    const id = entity.ID;
    if (typeof id !== 'string' || !id) {
        throw new Error(`Saved '${entityName}' but ID is missing`);
    }
    return id;
}
