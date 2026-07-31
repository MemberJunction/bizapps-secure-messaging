# Verifying BizApps Secure Messaging on PostgreSQL (one-shot install, no CodeGen)

This runbook simulates what `mj app install` does to a PostgreSQL database and
verifies that the app is **fully functional without ever running `mj codegen`**.
It is the Secure Messaging analog of bizapps-common's, bizapps-tasks' and
bizapps-issues' `migrations-pg/docs/PG_INSTALL_VERIFICATION.md` — same contract,
and simpler: Secure Messaging declares **no app dependencies**, so there are no
sibling apps to install first.

Why simulate instead of running the real command? `mj app install` downloads the
app's migrations from the **latest GitHub release**. To test unreleased changes
to `migrations-pg/`, you run the same database steps the installer performs —
mapped 1:1 from `@memberjunction/open-app-engine`'s `install-orchestrator` — but
point the migration step at your local branch. Once a release ships, step 3
collapses back to the real `mj app install`.

Background: on SQL Server, CodeGen's DDL (CRUD sprocs, views, triggers, grants)
is appended into the migrations at authoring time, so an install is complete on
its own. The PG conversion pipeline cannot translate T-SQL procedures
(`-- SKIPPED: procedure (auto-conversion not supported)`), so a PG install was
incomplete until a consumer ran `mj codegen`. The `migrations-pg/` files here now
carry CodeGen's native plpgsql directly — extracted verbatim from a post-codegen
v5.44 database, CodeGen's fixed point — which is what makes the one-shot install
work and makes a subsequent codegen run a no-op.

## How these files are produced

Three scripts, in order. None of them invent SQL; each is a mechanical transform
whose output is verified against a live database.

| Script | Role |
|---|---|
| `mj convert-migrations` (MJ CLI **5.49.0**, default/legacy converter) | T-SQL -> PG rule pipeline. Converts what it can; leaves `-- SKIPPED:` markers for procedures and triggers. Do **not** use `--split`: the AST path deliberately discards CodeGen regions and exits 2. |
| `scripts/pg-finalize.mjs` | 9 idempotent post-conversion patches (see its header). The load-bearing one is **patch 9**: it normalizes the app schema to its PHYSICAL lowercase form in **both** identifiers and string literals. |
| `scripts/pg-bake-codegen.mjs` | Replaces each `-- SKIPPED:` marker with the real plpgsql read out of a reference post-codegen database, and bakes the EntityField normalization block into the `.pgonly.sql` backfill. Idempotent and byte-stable across runs. |

### Why the schema name appears lowercase everywhere

PostgreSQL folds unquoted identifiers, so the physical schema is
`__mj_bizappssecuremessaging` while the app authors itself as
`__mj_BizAppsSecureMessaging`. The canonical PascalCase name must live in
**exactly one place** — `__mj."SchemaInfo"."CanonicalSchemaName"` — and every
metadata *string literal* must name the **physical** schema.

Getting this wrong is not cosmetic. When the baseline's metadata literals named
the canonical-cased schema, CodeGen's first run treated the lowercase physical
schema as a **second, unknown schema** and duplicated the entire object model:
**48 functions / 12 views / 12 triggers** instead of 24 / 6 / 6, plus 6 extra
`Entity` rows suffixed `____mj_bizappssecuremessaging`. Setting
`CanonicalSchemaName` alone does **not** prevent that — it only restores
PascalCase generated class names. Both halves are required, which is why patch 9
lowercases literals *and* the `.pgonly.sql` backfill pins `CanonicalSchemaName`.

The installer's own `PersistCanonicalSchemaName` step cannot cover this: it fires
**before** migrations, when no `SchemaInfo` row exists yet, so on a fresh install
it always updates 0 rows.

## 0. Fresh PostgreSQL (throwaway container)

```bash
docker run -d --name sm-pg-test \
  -e POSTGRES_USER=mj_admin -e POSTGRES_PASSWORD=<pw> \
  -e POSTGRES_DB=SM_OneShot -p 5434:5432 postgres:17
```

## 1. Point the MJ CLI at it

Shell exports take precedence over `.env`, so nothing in the repo needs editing:

```bash
export DB_PLATFORM=postgresql DB_HOST=localhost DB_PORT=5434 \
  DB_DATABASE=SM_OneShot DB_USERNAME=mj_admin DB_PASSWORD=<pw> \
  CODEGEN_DB_USERNAME=mj_admin CODEGEN_DB_PASSWORD=<pw> DB_ENCRYPT=false
```

`CODEGEN_DB_*` is required even for migrate — the CLI opens its admin connection
with those credentials.

## 2. Platform install (the consumer's `mj migrate`)

```bash
npx mj migrate --tag v5.44.0        # expect: 61 applied on a virgin DB
```

Do **not** run plain `npx mj migrate` here — without `--tag` it uses this repo's
local migrations directory (the app's own), not MJ core's.

> **Core-version caveat (a real MJ-core PG regression, not an app issue).**
> v5.44.0 installs clean on virgin PostgreSQL. **Any tag from v5.46 onward does
> not**: `B202607091514__v5.46.x__Baseline.pg.sql` issues `GRANT ... TO
> "cdp_Developer"` with no preceding `CREATE ROLE`, so the whole single-batch
> baseline aborts with `role "cdp_Developer" does not exist` on a database that
> doesn't already have those roles. Reproduced with the 5.49.0 CLI targeting
> `--tag v5.49.0`. Pin `--tag v5.44.0` until that is fixed.

## 3. Simulate `mj app install` — the app's own migrations

```bash
# [Schema] HandleSchemaCreation
psql -h localhost -p 5434 -U mj_admin -d SM_OneShot \
  -c 'CREATE SCHEMA IF NOT EXISTS __mj_bizappssecuremessaging;'

# [Schema] PersistCanonicalSchemaName — expect "UPDATE 0" on a fresh install
# (see "Why the schema name appears lowercase everywhere" above).
psql -h localhost -p 5434 -U mj_admin -d SM_OneShot -c \
  "UPDATE __mj.\"SchemaInfo\" SET \"CanonicalSchemaName\"='__mj_BizAppsSecureMessaging'
   WHERE LOWER(\"SchemaName\")=LOWER('__mj_bizappssecuremessaging');"

# [Migration] HandleMigrations — the app's PG migrations from YOUR branch.
# Run from the repo root with NO flags: the CLI reads mj-app.json for the schema
# and prefers migrations-pg/ automatically on PostgreSQL.
npx mj migrate                     # expect: 2 applied
```

**Do not run codegen.** That is the point of the test.

Two notes on that migrate invocation:

- **Prefer the flagless form.** It records history in `__mj.flyway_schema_history`
  alongside core, which is what the real installer does. Passing
  `--schema __mj_BizAppsSecureMessaging --dir ./migrations-pg` also works, but
  Flyway then creates a *second*, quoted `"__mj_BizAppsSecureMessaging"` schema
  holding nothing but its own history table plus two indexes. Cosmetic, but
  confusing — the sibling apps' runbooks document that variant.
- Migration order matters: `V202607201423__..._Baseline_Schema.pg.sql` then
  `V202607201424__..._CodeGen_Metadata_Backfill.pgonly.sql`. The `.pgonly.sql`
  suffix means there is deliberately no T-SQL counterpart; the two `.pg.sql`
  filenames pair 1:1 with `migrations/`.

Then finish the installer's bookkeeping:

```bash
# [Record] RecordInstallationAtomically + finalize Status=Active
psql -h localhost -p 5434 -U mj_admin -d SM_OneShot -c \
  "INSERT INTO __mj.\"OpenApp\" (\"ID\",\"Name\",\"DisplayName\",\"Version\",\"Publisher\",
    \"RepositoryURL\",\"MJVersionRange\",\"ManifestJSON\",\"SchemaName\",\"InstalledByUserID\",\"Status\")
   SELECT gen_random_uuid(),'mj-secure-messaging','MJ Secure Messaging','1.0.0','MemberJunction',
    'https://github.com/MemberJunction/bizapps-secure-messaging','>=5.43.0','{}',
    '__mj_BizAppsSecureMessaging',(SELECT \"ID\" FROM __mj.\"User\" LIMIT 1),'Active';"
```

Post-release this whole step is one command:

```bash
npx mj app install https://github.com/MemberJunction/bizapps-secure-messaging \
  --dangerously-ignore-dbl-underscore-schema-rule
```

(The flag is required because the app's schema starts with `__mj_`. The
installer's final "add packages to host project" step only succeeds inside a real
MJ host project — the database-side steps complete regardless.)

## 4. Verify everything is there

```sql
-- expected values in comments
SELECT count(*) FROM pg_proc
 WHERE pronamespace = '__mj_bizappssecuremessaging'::regnamespace;      -- 24
 -- (18 CRUD functions = 6 tables x create/update/delete, + 6 fn_trg_update_*)

SELECT count(*) FROM pg_class
 WHERE relnamespace = '__mj_bizappssecuremessaging'::regnamespace
   AND relkind = 'v';                                                  -- 6

SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
 WHERE NOT t.tgisinternal
   AND c.relnamespace = '__mj_bizappssecuremessaging'::regnamespace;    -- 6

-- Duplication guard: must be EMPTY. Duplicates RAISE the counts above, so a
-- floor check on counts alone is blind to them.
SELECT proname, count(*) FROM pg_proc
 WHERE pronamespace = '__mj_bizappssecuremessaging'::regnamespace
 GROUP BY 1 HAVING count(*) > 1;                                        -- 0 rows

SELECT "Name" FROM __mj."Entity"
 WHERE "Name" LIKE '%\_\_\_\_mj\_%';                                    -- 0 rows

SELECT count(*) FROM __mj."vwEntities"
 WHERE LOWER("SchemaName") = '__mj_bizappssecuremessaging'
   AND "ClassName" LIKE 'mjBizAppsSecureMessaging%';                    -- 6 (and 0 lowercase)

SELECT "SchemaName", "CanonicalSchemaName" FROM __mj."SchemaInfo"
 WHERE "SchemaName" ILIKE '%securemessag%';       -- 2 rows, both canonical=__mj_BizAppsSecureMessaging

-- EntityField normalization landed: no PG-flavored type names survive.
SELECT count(*) FILTER (WHERE ef."Type" IN ('TEXT','UUID','BOOLEAN','timestamptz','INTEGER')) AS pg_flavored,
       count(*) AS total
 FROM __mj."EntityField" ef JOIN __mj."Entity" e ON e."ID" = ef."EntityID"
 WHERE LOWER(e."SchemaName") = '__mj_bizappssecuremessaging';           -- 0, 67
```

Then the functional suite:

```bash
# Connection via PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD
node scripts/pg-objectmodel-test.mjs      # expect: RESULT: 38 passed, 0 failed
```

It exercises the six `spCreate*` in dependency order, view visibility, the
BIT -> BOOLEAN conversion (real `true`/`false` defaults, boolean predicates in
view filters), the `_Clear` companion convention on three different tables, all
six CHECK constraints, intra-schema FK enforcement, all six row-touch triggers,
bigint round-tripping past 2^31, and the delete contract. Self-cleaning.

Serving the app through MJAPI is a further check (`cd apps/MJAPI && GRAPHQL_PORT=<free>
npm start`, then confirm the startup banner reports the PG host/db and an entity
count, and that an unauthenticated GraphQL POST returns 401). **That step was not
run in this verification pass** — it needs a fully installed host project, not a
bare clone.

## 5. Prove codegen is a no-op

This is the regression test for the whole approach, and it needs to compare
**definitions, not counts** — every PG defect this pipeline has hit left the
object count intact (a stale view still counts; a duplicate overload *raises* the
count; a function missing `GET DIAGNOSTICS` still compiles).

```bash
node fingerprint.mjs --schema __mj_bizappssecuremessaging --db SM_OneShot \
  --container sm-pg-test --out pre.json
npx mj codegen
node fingerprint.mjs --schema __mj_bizappssecuremessaging --db SM_OneShot \
  --container sm-pg-test --out post.json
node fpdiff.mjs pre.json post.json      # expect: "app scope identical — no-op confirmed"
```

The fingerprint captures per-object canonical definitions for functions (keyed by
identity argument list, so a signature change reads as add+remove), views,
triggers, columns, constraints, indexes, ACLs, and the duplicate-overload census,
plus the app's `__mj` metadata rows — partitioned into **app scope (drift is
fatal)** and **core scope (reconciliation noise)**.

CodeGen rewrites this repo's generated TypeScript with PG-flavored doc comments —
restore them afterward; they are not part of the test:

```bash
git checkout -- 'packages/Entities/src/generated' 'packages/Server/src/generated' \
  'packages/Angular/src/lib/generated'
rm -rf temp_sql_scripts
```

## Things that look wrong but aren't

- **`mj codegen` exits non-zero on a bare clone.** CodeGen itself completes
  (`MJ CodeGen complete — N entities`); what fails is the configured *after*
  commands (`npm run build` in `packages/Entities` and `packages/Actions`), which
  need `node_modules`. Verify the database, not the exit code.
- **First codegen reconciles a few CORE metadata rows** (`__mj` schema) — e.g.
  adding `MJ: Entities.CanonicalSchemaName` / `MJ: Schema Info.CanonicalSchemaName`
  EntityField rows, or correcting nullability on `MJ: AI Agent Skills.Agent`. That
  is skew between the pinned v5.44 core baseline and a newer CLI, plus MJ core's
  own migrations not shipping their codegen metadata. Outside this app's control.
  The acceptance criterion is that **no `__mj_bizappssecuremessaging` object and
  no app-entity metadata row changes** — `fpdiff.mjs` enforces exactly that split.
- **Two `SchemaInfo` rows** (`__mj_bizappssecuremessaging` +
  `__mj_BizAppsSecureMessaging`): the second is what CodeGen auto-creates keyed by
  the canonical name (its `newEntityDefaults` config references the schema that
  way); the backfill pre-creates it with a pinned ID so codegen has nothing to add.
  Both are guarded on `SchemaName`, not `ID`, because `__mj."SchemaInfo"` carries a
  UNIQUE index on `SchemaName` — an `ON CONFLICT ("ID")` insert would fail against
  a row CodeGen already created with its own random ID.
- **`SchemaInfo.EntityNamePrefix` is NULL for this app.** That is CodeGen's own
  fixed point here, and the prefix could not be stored anyway:
  `'MJ_BizApps_SecureMessaging: '` is 28 characters and the column is
  `varchar(25)`. Nothing depends on it — the baseline already seeds every
  `Entity."Name"` with the prefix.
- **The six views carry no FK-join columns.** Unlike the sibling apps, this
  model's cross-entity references (`ContactID`, `PersonID`, `CreatedByUserID`,
  `RequestedByUserID`, `ArtifactID`, `FileID`) are loose UUIDs with no FK
  constraint, so CodeGen has no relationship to denormalize a name field from.
  The eight real FKs are all intra-schema. Matches the SQL Server side.
- **`spDelete*` returns one row with `ID = NULL` when nothing matched**, rather
  than zero rows (`IF v_affected_count = 0 THEN RETURN QUERY SELECT NULL::UUID`).
  That is CodeGen's PostgreSQL contract, emitted identically across all four
  sibling apps — callers test the ID for NULL, not `rowCount`.
- **`PortalSession.LastAccessedAt` defaults to `now()`, not
  `(now() AT TIME ZONE 'UTC')`.** The UTC-normalized form is what CodeGen emits
  for its own `__mj_CreatedAt`/`__mj_UpdatedAt` columns; `LastAccessedAt` is an
  app-authored column and keeps the default the T-SQL migration gave it.
- **`(now() AT TIME ZONE 'UTC')` is only exactly right on a UTC server.** The
  expression yields a `timestamp without time zone` that the `timestamptz` column
  then re-interprets in the server's zone, so a non-UTC PG server shifts the value
  by its offset. This is CodeGen's own emission, identical across the fleet —
  changing it here would break the codegen-is-a-no-op contract. Flagged as a core
  observation, not fixed in this app.

## Maintenance contract

The plpgsql in `migrations-pg/` is CodeGen's own emission, frozen at v5.44. When
a future schema change regenerates any CRUD function, view, or trigger, the new
definition must be captured into the corresponding PG migration — the manual PG
analog of what `appendOutputCode` does automatically for T-SQL. `pg-bake-codegen.mjs`
automates that capture: point it at a post-codegen reference database and it
refills the markers (and refreshes the fenced EntityField block) in place.

Seed data must be authored as plain idempotent `INSERT ... ON CONFLICT DO NOTHING`.
The converter cannot transform `EXEC spCreate*` data calls, and `pg-finalize.mjs`
patch 8 deliberately comments out any seed block that calls the app's own
`spCreate*` — the same seed data ships in `metadata/` and loads via `mj sync push`.

The no-op check in step 5 is the regression test for all of this: if codegen
changes anything in app scope after a fresh install, a migration is missing
codegen output.

## Cleanup

```bash
docker rm -f sm-pg-test
```
