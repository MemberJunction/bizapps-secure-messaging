#!/usr/bin/env node
/**
 * pg-bake-codegen.mjs — bake MJ CodeGen's PostgreSQL output into the migration set.
 *
 * WHY THIS EXISTS
 * ---------------
 * `mj migrate convert` cannot translate T-SQL CREATE PROCEDURE or CREATE TRIGGER bodies. For each one
 * it emits a `-- SKIPPED: …` marker with the body commented out and truncated. On PostgreSQL those
 * objects are produced natively by `mj codegen`, which makes a PG install THREE stages
 * (`mj migrate` -> `mj codegen` -> `mj sync push`) where SQL Server needs one.
 *
 * The sibling BizApps repos (common 1bfe93c, tasks 10ce453, issues 5cd9357) all collapsed that back to
 * ONE stage by shipping CodeGen's own output inside the migrations — "extracted verbatim from a
 * post-codegen v5.44 database (CodeGen's fixed point)". This script automates that extraction so it is
 * reproducible rather than a one-time hand-edit, and so it can be re-run when the baseline changes or
 * the targeted MJ core version moves.
 *
 * WHAT IT BAKES (exactly the migrate -> codegen delta, nothing else)
 * -----------------------------------------------------------------
 *  1. 18 CRUD functions  — one per `-- SKIPPED: procedure` marker, matched by sproc name.
 *  2.  6 trigger pairs   — one per `-- SKIPPED: trigger` marker: CodeGen's `fn_trg_update_*` function
 *                          plus its `trg_update_*` trigger, matched by the table the marker names.
 *  3. 12 column defaults — CodeGen rewrites `__mj_CreatedAt` / `__mj_UpdatedAt` DEFAULT from `now()`
 *                          to `(now() AT TIME ZONE 'UTC')` on every app table.
 *  4. 67 EntityField rows — into the CodeGen_Metadata_Backfill migration. The converter translated the
 *                          metadata literals into PG-flavored values (`UUID`/`TEXT`/`TIMESTAMPTZ`
 *                          instead of MJ's canonical `uniqueidentifier`/`nvarchar`/`datetimeoffset`,
 *                          sequences offset by 100000, DefaultColumnWidth NULL) that CodeGen
 *                          normalizes back on its first run.
 *
 * Deliberately NOT baked: the 24 `GRANT EXECUTE` ACLs CodeGen adds. They are unnecessary — the
 * baseline already carries its own `GRANT EXECUTE ON FUNCTION … TO "cdp_Developer", "cdp_Integration"`
 * statements (wrapped in `DO $$ … EXCEPTION WHEN others THEN NULL; END $$;`, which is why they
 * silently no-op today: the functions did not exist yet). With the functions baked in ahead of the
 * grant section, those grants land on their own and SQL Server parity is preserved exactly.
 *
 * USAGE
 * -----
 *   node scripts/pg-bake-codegen.mjs --db <reference-db> [--container <docker-container>]
 *
 * The reference DB must be a database where `mj migrate` (this migration set) then `mj codegen` have
 * both run — i.e. CodeGen's fixed point. See docs/PG_INSTALL_VERIFICATION.md for how to build one.
 *
 * IDEMPOTENT: baking replaces the markers, so a second run finds none and does nothing. Re-running
 * `mj migrate convert --force` restores the markers; re-run pg-finalize.mjs then this script.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PG_DIR = join(HERE, '..', 'migrations-pg');

const APP_SCHEMA = '__mj_BizAppsSecureMessaging';
const PHYSICAL_SCHEMA = APP_SCHEMA.toLowerCase();
const BACKFILL_MARKER = '-- (populated by scripts/pg-bake-codegen.mjs — see docs/PG_INSTALL_VERIFICATION.md)';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const DB = arg('db');
const CONTAINER = arg('container', 'sm-pg-test');
const PGUSER = arg('user', 'mj_admin');
if (!DB) {
  console.error('usage: pg-bake-codegen.mjs --db <reference-db> [--container <c>] [--user <u>]');
  process.exit(2);
}

/**
 * Run a SQL statement and return rows as arrays of column values.
 * Separators embed control characters (SOH/STX) rather than being plain words, because function and
 * trigger definitions are multi-line SQL containing every ordinary delimiter -- and any English word
 * used as a separator eventually appears in the source itself ('FOR EACH ROW' is in every single
 * pg_get_triggerdef output, so a bare 'ROW' separator would shred all six trigger definitions).
 */
const RS = 'ROW';
const FS = 'COL';
function rows(selectList, from, orderBy) {
  // ORDER BY belongs INSIDE string_agg — a trailing ORDER BY on an aggregate query is a grouping error.
  const ord = orderBy ? ` ORDER BY ${orderBy}` : '';
  const sql = `SELECT coalesce(string_agg(${selectList}, '${RS}'${ord}), '') FROM ${from}`;
  const out = execFileSync(
    'docker',
    ['exec', CONTAINER, 'psql', '-U', PGUSER, '-d', DB, '-At', '-c', sql],
    { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }
  );
  // Strip psql's own trailing newline before splitting. Without this the LAST row's LAST field carries
  // it (e.g. 'fn_trg_update_secure_thread\n'), so exactly one lookup per query silently misses.
  return out.replace(/\n$/, '').split(RS).filter((r) => r.trim() !== '').map((r) => r.split(FS));
}

// ---- pull CodeGen's fixed point out of the reference database ---------------------------------

/** CRUD + trigger functions, keyed by unqualified name. */
const functionDefs = new Map(
  rows(
    `p.proname || '${FS}' || pg_get_functiondef(p.oid)`,
    `pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = '${PHYSICAL_SCHEMA}'`
  ).map(([name, def]) => [name, def])
);

/** Triggers, keyed by the table they fire on: [triggerName, triggerDef, functionName]. */
const triggersByTable = new Map(
  rows(
    `c.relname || '${FS}' || t.tgname || '${FS}' || pg_get_triggerdef(t.oid) || '${FS}' || tf.proname`,
    `pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_proc tf ON tf.oid = t.tgfoid
     WHERE n.nspname = '${PHYSICAL_SCHEMA}' AND NOT t.tgisinternal`
  ).map(([table, tgname, tgdef, fnName]) => [table, { tgname, tgdef, fnName }])
);

/** Timestamp-column defaults CodeGen rewrites. */
const columnDefaults = rows(
  `table_name || '${FS}' || column_name || '${FS}' || column_default`,
  `information_schema.columns
   WHERE table_schema = '${PHYSICAL_SCHEMA}' AND column_name IN ('__mj_CreatedAt', '__mj_UpdatedAt')`,
  'table_name, column_name'
);

/** EntityField metadata at CodeGen's fixed point. */
const entityFields = rows(
  `ef."ID"::text || '${FS}' || ef."Sequence" || '${FS}' || ef."Type" || '${FS}' ||
   coalesce(ef."DefaultColumnWidth"::text, '') || '${FS}' || coalesce(ef."RelatedEntityNameFieldMap", '') || '${FS}' ||
   e."Name" || '.' || ef."Name"`,
  `__mj."EntityField" ef JOIN __mj."Entity" e ON e."ID" = ef."EntityID"
   WHERE lower(e."SchemaName") = '${PHYSICAL_SCHEMA}'`,
  'e."Name", ef."Sequence"'
);

console.log(`reference DB ${DB}: ${functionDefs.size} functions, ${triggersByTable.size} triggers, ` +
            `${columnDefaults.length} timestamp defaults, ${entityFields.length} entity fields`);

// ---- splice into the baseline -----------------------------------------------------------------

/** The converter's skipped blocks run from the marker to the next blank line. */
function blockEnd(lines, start) {
  let i = start + 1;
  while (i < lines.length && lines[i].trim() !== '') i++;
  return i;
}

/** `-- CREATE PROCEDURE [schema].[spCreateFileRequest]` -> `spCreateFileRequest` */
const sprocNameFrom = (line) => (line.match(/\[\s*([A-Za-z0-9_]+)\s*\]\s*$/) || [])[1];

/**
 * The table a skipped trigger fires on. The marker's own `CREATE TRIGGER` line is unreliable — the
 * converter mangles the bracket/quote pairing (`[schema".trgUpdateMessageFile`) — but the following
 * `ON "schema"."Table"` line is intact.
 */
function triggerTableFrom(lines, start, end) {
  for (let i = start; i < end; i++) {
    const m = lines[i].match(/ON\s+"?[A-Za-z0-9_]+"?\."([A-Za-z0-9_]+)"/i);
    if (m) return m[1];
  }
  return undefined;
}

function bakeBaseline(sql) {
  const lines = sql.split('\n');
  const out = [];
  let procs = 0, trigs = 0;
  const missing = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^--\s*SKIPPED:\s*procedure/i.test(line)) {
      const end = blockEnd(lines, i);
      const name = sprocNameFrom(lines[i + 1] ?? '');
      const def = name && functionDefs.get(name);
      if (!def) { missing.push(`procedure ${name ?? '<unparsed>'}`); out.push(...lines.slice(i, end)); i = end - 1; continue; }
      out.push(`-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the`);
      out.push(`-- converter's '-- SKIPPED: procedure' marker for ${name}).`);
      out.push(`${def};`);
      procs++;
      i = end - 1;
      continue;
    }

    if (/^--\s*SKIPPED:\s*trigger/i.test(line)) {
      const end = blockEnd(lines, i);
      const table = triggerTableFrom(lines, i, end);
      const trg = table && triggersByTable.get(table);
      const fnDef = trg && functionDefs.get(trg.fnName);
      if (!trg || !fnDef) { missing.push(`trigger on ${table ?? '<unparsed>'}`); out.push(...lines.slice(i, end)); i = end - 1; continue; }
      out.push(`-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the`);
      out.push(`-- converter's '-- SKIPPED: trigger' marker for ${table}).`);
      out.push(`${fnDef};`);
      out.push(`DROP TRIGGER IF EXISTS "${trg.tgname}" ON ${PHYSICAL_SCHEMA}."${table}";`);
      out.push(`${trg.tgdef};`);
      trigs++;
      i = end - 1;
      continue;
    }

    out.push(line);
  }

  if (missing.length) {
    console.error(`pg-bake-codegen: no CodeGen definition found in ${DB} for: ${missing.join(', ')}`);
    process.exit(1);
  }
  return { sql: out.join('\n'), procs, trigs };
}

/**
 * CodeGen rewrites the timestamp defaults from `now()` to `(now() AT TIME ZONE 'UTC')`. Appended as a
 * clearly-fenced block so a re-run replaces it wholesale rather than duplicating it.
 */
const DEFAULTS_BEGIN = '-- >>> BEGIN baked CodeGen timestamp defaults (scripts/pg-bake-codegen.mjs) <<<';
const DEFAULTS_END = '-- >>> END baked CodeGen timestamp defaults <<<';

function bakeTimestampDefaults(sql) {
  const body = columnDefaults
    .map(([table, col, def]) => `ALTER TABLE ${PHYSICAL_SCHEMA}."${table}" ALTER COLUMN "${col}" SET DEFAULT ${def};`)
    .join('\n');
  const block = [
    '',
    DEFAULTS_BEGIN,
    '-- CodeGen normalizes every app table\'s __mj_CreatedAt / __mj_UpdatedAt DEFAULT from the',
    '-- converter\'s now() to (now() AT TIME ZONE \'UTC\'). Baking it keeps `mj codegen` a no-op.',
    body,
    DEFAULTS_END,
    '',
  ].join('\n');

  const begin = sql.indexOf(DEFAULTS_BEGIN);
  if (begin >= 0) {
    const end = sql.indexOf(DEFAULTS_END, begin) + DEFAULTS_END.length;
    return sql.slice(0, begin).replace(/\n+$/, '') + block + sql.slice(end).replace(/^\n+/, '');
  }
  return sql.replace(/\n*$/, '') + '\n' + block;
}

// ---- write the EntityField normalization into the backfill migration --------------------------

function entityFieldUpdates() {
  return entityFields.map(([id, seq, type, width, rnfm, label]) => {
    const sets = [`"Sequence" = ${seq}`, `"Type" = '${type.replace(/'/g, "''")}'`];
    if (width !== '') sets.push(`"DefaultColumnWidth" = ${width}`);
    if (rnfm !== '') sets.push(`"RelatedEntityNameFieldMap" = '${rnfm.replace(/'/g, "''")}'`);
    return `UPDATE __mj."EntityField" SET ${sets.join(', ')} WHERE "ID" = '${id}';  -- ${label}`;
  }).join('\n');
}

const FIELDS_BEGIN = '-- >>> BEGIN baked CodeGen EntityField normalization (scripts/pg-bake-codegen.mjs) <<<';
const FIELDS_END = '-- >>> END baked CodeGen EntityField normalization <<<';

function bakeBackfill(sql) {
  const block = [FIELDS_BEGIN, entityFieldUpdates(), FIELDS_END].join('\n');
  const begin = sql.indexOf(FIELDS_BEGIN);
  if (begin >= 0) {
    const end = sql.indexOf(FIELDS_END, begin) + FIELDS_END.length;
    return sql.slice(0, begin) + block + sql.slice(end);
  }
  if (sql.includes(BACKFILL_MARKER)) return sql.replace(BACKFILL_MARKER, block);
  return sql.replace(/\n*$/, '') + '\n' + block + '\n';
}

function main() {
  const baselines = readdirSync(PG_DIR).filter((f) => f.endsWith('.pg.sql'));
  for (const f of baselines) {
    const p = join(PG_DIR, f);
    const before = readFileSync(p, 'utf8');
    const { sql, procs, trigs } = bakeBaseline(before);
    const after = bakeTimestampDefaults(sql);
    if (after !== before) {
      writeFileSync(p, after);
      console.log(`  baked ${f}: ${procs} procedure(s), ${trigs} trigger(s), ${columnDefaults.length} default(s)`);
    } else {
      console.log(`  ${f}: already baked (no markers)`);
    }
  }

  const backfills = readdirSync(PG_DIR).filter((f) => f.endsWith('.pgonly.sql'));
  for (const f of backfills) {
    const p = join(PG_DIR, f);
    const before = readFileSync(p, 'utf8');
    const after = bakeBackfill(before);
    if (after !== before) {
      writeFileSync(p, after);
      console.log(`  baked ${f}: ${entityFields.length} EntityField normalization(s)`);
    }
  }
}

main();
