#!/usr/bin/env node
/**
 * pg-finalize.mjs — post-conversion patch layer for the BizApps Secure Messaging PostgreSQL migrations.
 *
 * WHY THIS EXISTS
 * ---------------
 * `mj migrate convert` (the @memberjunction/sql-converter rule pipeline) translates the canonical
 * SQL Server migrations under `migrations/` into PostgreSQL under `migrations-pg/`. The converter is
 * rule/string based; a small, well-understood set of T-SQL constructs it does not fully translate are
 * corrected here as a deterministic, idempotent post-pass — the "things we fix after the converter"
 * layer (converter → this finalize pass → `pg-bake-codegen.mjs`).
 *
 * It is intentionally SURGICAL and idempotent: re-running it on already-finalized files is a no-op,
 * and `mj migrate convert` itself never regenerates a `.pg.sql` that already exists, so these fixes
 * are preserved across normal conversion runs. If a migration is ever force-regenerated, re-run this
 * and then re-run `pg-bake-codegen.mjs`.
 *
 * NO MemberJunction-core changes are involved — this lives entirely in the bizapps-secure-messaging
 * repo. Adapted from the bizapps-issues / bizapps-common / bizapps-tasks pg-finalize pipeline; the
 * patches are generic, only the app schema name (`__mj_BizAppsSecureMessaging`) and the app's
 * boolean-column list differ.
 *
 * WHAT THIS SCRIPT DOES *NOT* DO
 * ------------------------------
 * The converter cannot translate the CodeGen CRUD procedures (18 `-- SKIPPED: procedure` markers in
 * the baseline) — it comments them out AND truncates each body at ~200 chars, so nothing live is left
 * behind and there is nothing here to neutralize. Those 18 functions, plus the 6 `__mj_UpdatedAt`
 * triggers, are supplied by `pg-bake-codegen.mjs`, which splices CodeGen's own native PL/pgSQL
 * (extracted verbatim from a post-codegen database — CodeGen's fixed point) in place of each marker.
 * That is what makes `mj migrate` alone a complete PG install and a subsequent `mj codegen` a no-op.
 *
 * PATCHES (each documented with the converter gap it compensates for):
 *
 *  1. FK-join alias quoting. CodeGen base views define their FK-join aliases quoted
 *     (`... AS "mjBizAppsSecureMessagingSecureThread_ThreadID"`) but the converter leaves the
 *     *references* unquoted, so PostgreSQL case-folds them to lowercase and raises "missing
 *     FROM-clause entry". We quote every `mj<Entity>_<FK>.` reference so it matches its definition.
 *
 *  2. Skipped-trigger / unrecognized-batch neutralization. The converter cannot translate T-SQL
 *     `AFTER UPDATE` triggers, so it emits a `-- SKIPPED: trigger ...` marker — but only comments the
 *     `CREATE TRIGGER` line, leaving the (truncated, and therefore syntactically invalid) body live.
 *     These are the `__mj_UpdatedAt` maintenance triggers; `pg-bake-codegen.mjs` replaces the whole
 *     neutralized block with CodeGen's native PostgreSQL trigger. Same treatment for
 *     `-- NOTE: unrecognized batch type (UNKNOWN)` passthroughs (none occur in this repo today; the
 *     patch is retained so a future migration carrying hand-written T-SQL fails safe rather than loud).
 *
 *  3. Cast core boolean INSERTs. The converter emits native TRUE/FALSE for app tables it sized from
 *     their CREATE TABLE, but cannot see the core `__mj` table types, so it leaves bare 0/1 — which
 *     PostgreSQL refuses to implicitly cast to boolean. Positionally cast 0/1 -> FALSE/TRUE for core
 *     `__mj` boolean columns (map in `pg-core-boolean-columns.json`).
 *
 *  4. Cast boolean comparisons. `"boolCol" = 0|1` / `<> 0|1` -> FALSE/TRUE in WHERE/UPDATE clauses
 *     (PostgreSQL has no implicit boolean=integer operator). Scoped to known boolean column names
 *     (MJ-core map ∪ this app's table booleans) so integer columns that legitimately equal 0/1 are
 *     never touched.
 *
 *  5. Quote core object refs. Unquoted mixed-case `__mj.vwGeneratedCodeCategories` folds to a
 *     non-existent lowercased relation; we quote mixed-case `__mj` object references.
 *
 *  6. Drop-before-create views. `CREATE OR REPLACE VIEW` cannot rename/reorder columns (42P16); a
 *     regeneration migration reshapes a view when an upstream table gains a column. We inject a
 *     `DROP VIEW IF EXISTS ... CASCADE` before each app-schema view block so the create is fresh.
 *     The app's base views have no inter-view dependencies, so the CASCADE is safe.
 *
 *  7. Cast `_Clear` flag args. The CodeGen "tolerant" CRUD sprocs take boolean `<field>_Clear` flags;
 *     the converter passes integer `:= 1` / `:= 0`, which PostgreSQL cannot match to the boolean
 *     parameter. The `_Clear` suffix is the CodeGen convention, so it is a safe key.
 *
 *  8. Defer app sproc seed blocks. A CodeGen-emitted metadata-sync block may seed reference tables by
 *     calling `__mj_BizAppsSecureMessaging."spCreate*"`. Those functions exist by the time they are
 *     called in this repo (they are baked into the same baseline by `pg-bake-codegen.mjs`, ahead of
 *     the seed section), but a *future* migration that seeds before its own sprocs exist would fail;
 *     the same seed data ships in `metadata/` and is loaded by `mj sync push`, so such blocks are
 *     commented out for PostgreSQL. Blocks that only call CORE `__mj."sp*"` functions are left intact.
 *
 *  9. Normalize app schema to its PHYSICAL (lowercase) form — BOTH identifiers and string literals.
 *     Two distinct substitutions, and BOTH are load-bearing:
 *       (a) identifiers: `"__mj_BizAppsSecureMessaging"."X"` -> `__mj_BizAppsSecureMessaging."X"`, so
 *           PostgreSQL folds the schema to lowercase itself — matching how `mj codegen` and the
 *           MJServer runtime emit schema references on PostgreSQL.
 *       (b) string literals: `'__mj_BizAppsSecureMessaging'` -> `'__mj_bizappssecuremessaging'`. These
 *           are the metadata values (`Entity.SchemaName`, spUpdateSchemaInfoFromDatabase arguments).
 *           Leaving them canonical-cased is what caused CodeGen to see the lowercase physical schema
 *           as a SECOND, unknown schema and duplicate the entire object model — 48 functions / 12
 *           views / 12 triggers instead of 24 / 6 / 6, plus 6 Entity rows suffixed
 *           `____mj_bizappssecuremessaging`. The fleet baselines are lowercase here for this reason.
 *     Setting `SchemaInfo.CanonicalSchemaName` (see the .pgonly.sql backfill) restores PascalCase
 *     GENERATED CLASS NAMES, but it does NOT prevent the duplication — both parts are required.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PG_DIR = join(HERE, '..', 'migrations-pg');

const APP_SCHEMA = '__mj_BizAppsSecureMessaging';

/**
 * Boolean-column map for the MJ-core `__mj` schema. Used by Patch 3 to positionally cast integer
 * 0/1 literals to FALSE/TRUE in INSERTs into core tables. Regenerate if the targeted MJ core version
 * changes (this repo targets MJ core v5.44):
 *   psql ... -c "SELECT json_object_agg(table_name, cols) FROM (SELECT table_name,
 *     json_agg(column_name ORDER BY column_name) cols FROM information_schema.columns
 *     WHERE table_schema='__mj' AND data_type='boolean' GROUP BY table_name) t" > pg-core-boolean-columns.json
 */
const CORE_BOOL_COLS = JSON.parse(readFileSync(join(HERE, 'pg-core-boolean-columns.json'), 'utf8'));

/** Split on top-level commas, respecting single-quoted strings ('' escapes) and parenthesis depth. */
function splitTopLevel(s) {
  const parts = [];
  let buf = '', depth = 0, inStr = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      buf += c;
      if (c === "'") {
        if (s[i + 1] === "'") { buf += s[++i]; } // escaped quote
        else inStr = false;
      }
      continue;
    }
    if (c === "'") { inStr = true; buf += c; continue; }
    if (c === '(') { depth++; buf += c; continue; }
    if (c === ')') { depth--; buf += c; continue; }
    if (c === ',' && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += c;
  }
  parts.push(buf);
  return parts;
}

/** Find index of the paren matching the `(` at openIdx, respecting quotes. */
function matchParen(s, openIdx) {
  let depth = 0, inStr = false;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === "'") { if (s[i + 1] === "'") i++; else inStr = false; } continue; }
    if (c === "'") inStr = true;
    else if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

const unquoteIdent = (t) => t.trim().replace(/^"|"$/g, '');

/** Patch 1: quote unquoted `mj<Pascal>_<Field>.` view-join alias references. */
function quoteFkJoinAliasReferences(sql) {
  // Only lowercase-`mj`-prefixed PascalCase aliases (the converter's generated FK-join aliases).
  // Negative lookbehind on `"` avoids re-quoting; lookahead on `.` targets references, not the
  // already-quoted `AS "..."` definitions (which are followed by a newline, not a dot).
  return sql.replace(/(?<!")\b(mj[A-Z][A-Za-z0-9]*_[A-Za-z0-9]+)(?=\.)/g, '"$1"');
}

/**
 * Patch 2: fully comment out the live body left behind by the converter's incomplete skips.
 *  - `-- SKIPPED: trigger ...` — only the CREATE TRIGGER line is commented; the truncated body stays
 *    live. Trigger bodies have no `BEGIN…END;` structure to track, so a blank line (the batch
 *    boundary) terminates the block. `pg-bake-codegen.mjs` then replaces the neutralized block with
 *    CodeGen's native PostgreSQL trigger.
 *  - `-- NOTE: unrecognized batch type (UNKNOWN) — passed through as-is` — the converter could not
 *    translate the following batch and emitted the raw T-SQL verbatim. A procedure body legitimately
 *    CONTAINS blank lines, so the blank-line terminator used for triggers would stop early and leave
 *    most of the invalid T-SQL live. Instead we track `BEGIN`/`END` depth and comment through the
 *    procedure's matching `END;`. If the batch is not a procedure (no BEGIN seen), we fall back to the
 *    first blank line. No such batch exists in this repo today.
 */
function neutralizeSkippedTriggers(sql) {
  const lines = sql.split('\n');
  const out = [];
  const commentOut = (line) => (line.trim() === '' || line.startsWith('--')) ? line : `-- ${line}`;
  const isComment = (line) => line.trim().startsWith('--');
  const isBlank = (line) => line.trim() === '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // (a) SKIPPED trigger: converter commented only the CREATE TRIGGER line; comment the rest of the
    //     (BEGIN/END-less, blank-terminated) trigger body.
    if (/^--\s*SKIPPED:\s*trigger/i.test(line)) {
      out.push(line);
      while (i + 1 < lines.length && !isBlank(lines[i + 1])) out.push(commentOut(lines[++i]));
      continue;
    }

    // (b) UNKNOWN batch passthrough: the converter emitted raw T-SQL it couldn't translate. Comment
    //     the batch's live SQL out. The batch begins after a comment preamble (banner + section
    //     comments, which may contain blank lines), so we first advance past the preamble to the first
    //     real SQL line, then comment through the procedure's matching END; (BEGIN/END depth-tracked).
    //     Idempotent: if that first real line is already commented, the batch was neutralized on a
    //     prior run and we leave it untouched.
    if (/^--\s*NOTE:\s*unrecognized batch type.*passed through as-is/i.test(line)) {
      out.push(line);
      // Advance past the comment/blank preamble, copying it verbatim. CRUCIAL for idempotency: on a
      // re-run the batch's own statements are already `--`-commented, so they read as part of the
      // preamble and get copied verbatim here — meaning the loop below would see the NEXT, unrelated
      // SQL block. We must NOT comment that. So we only treat the first real line as this batch's body
      // if the preamble did NOT already contain a commented batch statement.
      let alreadyNeutralized = false;
      while (i + 1 < lines.length && (isComment(lines[i + 1]) || isBlank(lines[i + 1]))) {
        if (/^--\s*(CREATE|ALTER|DECLARE|DO|BEGIN)\b/i.test(lines[i + 1].trim())) alreadyNeutralized = true;
        out.push(lines[++i]);
      }
      if (alreadyNeutralized) continue; // batch already deferred on a prior run — leave the rest alone

      let beginDepth = 0, sawBegin = false;
      while (i + 1 < lines.length) {
        const body = lines[i + 1];
        // Strip BEGIN TRAN/TRANSACTION (paired with COMMIT/ROLLBACK, not END) before counting.
        const cf = body.replace(/\bBEGIN\s+TRAN(SACTION)?\b/gi, '');
        const begins = (cf.match(/\bBEGIN\b/gi) || []).length;
        const ends = (cf.match(/\bEND\b/gi) || []).length;
        if (begins > 0) sawBegin = true;
        beginDepth += begins - ends;
        out.push(commentOut(lines[++i]));
        if (sawBegin && beginDepth <= 0) break;          // procedure's outermost END; reached
        if (!sawBegin && isBlank(body)) break;           // non-procedure batch: first blank line ends it
      }
      continue;
    }

    out.push(line);
  }
  return out.join('\n');
}

/**
 * Patch 3: positionally cast integer 0/1 -> FALSE/TRUE in INSERTs into MJ-core `__mj` boolean
 * columns. The converter emits native TRUE/FALSE for app tables it sized from their CREATE TABLE, but
 * cannot see the core `__mj` table types, so it leaves bare 0/1 — which PostgreSQL refuses to
 * implicitly cast to boolean (and the catalog-level implicit cast is unavailable on managed PG/Aurora).
 */
function castCoreBooleanInserts(sql) {
  // Core schema is referenced either literally (`__mj`, in the baseline) or via the `${mjSchema}`
  // placeholder (in CodeGen V-migrations) — match both.
  const re = /INSERT\s+INTO\s+(?:"?__mj"?|"?\$\{mjSchema\}"?)\."?([A-Za-z0-9_]+)"?\s*\(/gi;
  let out = '', last = 0, m;
  while ((m = re.exec(sql)) !== null) {
    const table = m[1];
    const boolCols = CORE_BOOL_COLS[table];
    const colOpen = re.lastIndex - 1; // index of the '(' after the column list
    const colClose = matchParen(sql, colOpen);
    if (colClose < 0) continue;
    const afterCols = sql.slice(colClose + 1);
    const vm = /^\s*VALUES\s*\(/i.exec(afterCols);
    if (!vm) continue;
    const valOpen = colClose + 1 + vm[0].length - 1;
    const valClose = matchParen(sql, valOpen);
    if (valClose < 0) continue;

    if (boolCols && boolCols.length) {
      const cols = splitTopLevel(sql.slice(colOpen + 1, colClose)).map(unquoteIdent);
      const vals = splitTopLevel(sql.slice(valOpen + 1, valClose));
      if (cols.length === vals.length) {
        const boolSet = new Set(boolCols);
        let touched = false;
        const newVals = vals.map((v, i) => {
          if (!boolSet.has(cols[i])) return v;
          const t = v.trim();
          if (t === '1') { touched = true; return v.replace('1', 'TRUE'); }
          if (t === '0') { touched = true; return v.replace('0', 'FALSE'); }
          return v;
        });
        if (touched) {
          out += sql.slice(last, valOpen + 1) + newVals.join(',') + sql.slice(valClose, valClose + 1);
          last = valClose + 1;
          re.lastIndex = valClose + 1;
          continue;
        }
      }
    }
    re.lastIndex = valClose + 1;
  }
  out += sql.slice(last);
  return out;
}

/**
 * Patch 4: cast `"boolCol" = 0|1` / `<> 0|1` predicate comparisons to FALSE/TRUE. Scoped to known
 * boolean column names (MJ-core map ∪ this app's table booleans) so integer columns that legitimately
 * equal 0/1 are never touched.
 */
const APP_BOOL_COLS = ['IsDeleted', 'IsImported', 'IsSecure', 'IsStarred'];
const BOOL_NAMES = new Set([...Object.values(CORE_BOOL_COLS).flat(), ...APP_BOOL_COLS]);
function castBooleanComparisons(sql) {
  return sql.replace(/"([A-Za-z0-9_]+)"(\s*(?:=|<>)\s*)([01])\b/g, (full, name, op, val) =>
    BOOL_NAMES.has(name) ? `"${name}"${op}${val === '1' ? 'TRUE' : 'FALSE'}` : full
  );
}

/**
 * Patch 5: quote unquoted schema-qualified references to mixed-case `__mj` core objects
 * (e.g. `__mj.vwGeneratedCodeCategories` -> `__mj."vwGeneratedCodeCategories"`). PostgreSQL folds
 * unquoted identifiers to lowercase, so an unquoted mixed-case core view/table reference resolves to
 * a non-existent lowercased relation. Only objects containing an uppercase letter are quoted;
 * already-quoted refs (`__mj."X"`) never match.
 */
function quoteCoreObjectRefs(sql) {
  return sql.replace(/\b__mj\.([A-Za-z_][A-Za-z0-9_]*)\b/g, (full, name) =>
    /[A-Z]/.test(name) ? `__mj."${name}"` : full
  );
}

/**
 * Patch 6: make view (re)creation idempotent across migrations. The converter wraps each view in a
 * `CREATE OR REPLACE VIEW` inside a self-healing DO-block, but `CREATE OR REPLACE` cannot rename or
 * reorder columns (PostgreSQL 42P16) — which a regeneration migration does when an upstream table
 * gains a column. We inject a `DROP VIEW IF EXISTS ... CASCADE` before each view block so the create
 * is always fresh. The app's base views have no inter-view dependencies, so the CASCADE is safe.
 * Idempotent: a DROP is injected at most once per block.
 */
function dropBeforeCreateViews(sql) {
  return sql.replace(
    // Match an optional already-injected DROP line immediately preceding the DO-block, so the guard
    // sees prior injections (they sit OUTSIDE the DO-block, on the line above it). Without capturing
    // that prefix the patch is non-idempotent — it prepends a fresh DROP on every run.
    new RegExp(`((?:DROP VIEW IF EXISTS ${APP_SCHEMA}\\."[^"]+" CASCADE;\\n)*)(DO \\$do\\$[\\s\\S]*?CREATE OR REPLACE VIEW\\s+(${APP_SCHEMA})\\."([^"]+)")`, 'g'),
    (full, existingDrops, block, schema, view) => {
      const drop = `DROP VIEW IF EXISTS ${schema}."${view}" CASCADE;\n`;
      // Already dropped (in the captured prefix or inside the block) — leave untouched.
      return existingDrops.includes(drop) || block.includes(drop.trimEnd())
        ? full
        : `${drop}${block}`;
    }
  );
}

/**
 * Patch 7: cast boolean literals in named function-call arguments. The CodeGen "tolerant" CRUD sprocs
 * take boolean `<field>_Clear` flags; the converter passes them as integer `:= 1` / `:= 0`, which
 * PostgreSQL cannot match to the boolean parameter (yielding "function ... does not exist").
 */
function castClearFlagArgs(sql) {
  return sql.replace(/(_Clear\s*:=\s*)([01])\b/g, (full, lhs, val) => `${lhs}${val === '1' ? 'TRUE' : 'FALSE'}`);
}

/**
 * Patch 8: defer seed blocks that call this app's CRUD sprocs — see the header note. Blocks that only
 * call CORE `__mj."sp*"` functions (which already exist at migrate time) are left intact.
 */
function deferAppSprocSeedBlocks(sql) {
  // Capture an optional comment prefix on the opening line. The converter often already defers these
  // blocks itself (emitting `-- DO $mj$ … -- END $mj$;`); without capturing that `-- ` the regex would
  // still match the live-looking `DO $mj$` inside it and re-comment every line — non-idempotent,
  // producing `-- -- DO`. If the opening line is already commented, the whole block is left untouched.
  return sql.replace(/(^|\n)(--\s*)?(DO \$mj\$[\s\S]*?END \$mj\$;)/g, (full, lead, alreadyCommented, block) => {
    const callsAppSproc = new RegExp(`PERFORM\\s+"?${APP_SCHEMA}"?\\."sp(Create|Update|Delete)`, 'i').test(block);
    if (!callsAppSproc) return full;
    if (alreadyCommented) return full; // converter (or a prior run) already deferred this block
    const commented = block
      .split('\n')
      .map((l) => (l.startsWith('--') ? l : `-- ${l}`))
      .join('\n');
    return `${lead}${commented}`;
  });
}

/**
 * Patch 9: normalize the app schema to its PHYSICAL PostgreSQL form everywhere — both as an
 * identifier and as a string literal.
 *
 *  (a) IDENTIFIER -> UNQUOTED, so PostgreSQL folds it to lowercase consistently. This matches how
 *      `mj codegen` (and the MJServer runtime) generate schema references on PostgreSQL — they emit
 *      the schema UNQUOTED (e.g. `__mj_BizAppsSecureMessaging."SecureThread"`), which folds to
 *      `__mj_bizappssecuremessaging`. If the migration created a mixed-case QUOTED schema, codegen's
 *      regenerated views/sprocs would look for the lowercased schema and fail with "relation does not
 *      exist". Table/column identifiers stay quoted (mixed case); only the SCHEMA is unquoted.
 *
 *  (b) STRING LITERAL -> lowercased, so the `__mj."Entity"."SchemaName"` metadata the baseline seeds
 *      names the schema that physically exists. This is not cosmetic. With the canonical-cased literal
 *      in metadata, CodeGen sees Entity rows in `__mj_BizAppsSecureMessaging` and a physical schema
 *      called `__mj_bizappssecuremessaging`, concludes the latter is a SECOND unknown schema, and
 *      creates a duplicate set of everything — 6 extra Entity rows suffixed
 *      `____mj_bizappssecuremessaging` and a duplicate object set in the app schema (48 functions /
 *      12 views / 12 triggers instead of 24 / 6 / 6). Setting CanonicalSchemaName in the backfill
 *      fixes the generated CLASS NAMES but does not prevent the duplication; the metadata literal must
 *      name the physical schema. The canonical PascalCase name then lives in exactly one place —
 *      `SchemaInfo.CanonicalSchemaName`, set by the CodeGen_Metadata_Backfill migration — which is
 *      what CodeGen reads to emit `mjBizAppsSecureMessaging*` class names.
 *
 * Literals naming OTHER schemas (`'__mj_BizAppsCommon'`, the `@ExcludedSchemaNames` list) are exact-
 * match-scoped out and untouched. PL/pgSQL `format('%I', ...)` uses of the app schema are lowercased
 * too, which is correct: `%I` quotes whatever it is given, and the physical schema is lowercase.
 */
function normalizeAppSchemaPhysical(sql) {
  return sql
    .replaceAll(`"${APP_SCHEMA}"`, APP_SCHEMA)
    .replaceAll(`'${APP_SCHEMA}'`, `'${APP_SCHEMA.toLowerCase()}'`);
}

const PATCHES = [
  ['quote FK-join alias references', quoteFkJoinAliasReferences],
  ['neutralize skipped triggers', neutralizeSkippedTriggers],
  ['cast core boolean INSERTs', castCoreBooleanInserts],
  ['cast boolean comparisons', castBooleanComparisons],
  ['quote core object refs', quoteCoreObjectRefs],
  ['drop-before-create views', dropBeforeCreateViews],
  ['cast _Clear flag args', castClearFlagArgs],
  ['defer app sproc seed blocks', deferAppSprocSeedBlocks],
  ['normalize app schema to physical form', normalizeAppSchemaPhysical],
];

function main() {
  const files = readdirSync(PG_DIR).filter((f) => f.endsWith('.pg.sql'));
  let changed = 0;
  for (const f of files) {
    const p = join(PG_DIR, f);
    const before = readFileSync(p, 'utf8');
    let after = before;
    for (const [, fn] of PATCHES) after = fn(after);
    if (after !== before) {
      writeFileSync(p, after);
      changed++;
      console.log(`  finalized ${f}`);
    }
  }
  console.log(`pg-finalize: ${changed}/${files.length} file(s) patched (idempotent).`);
}

main();
