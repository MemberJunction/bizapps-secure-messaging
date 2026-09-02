/**
 * Standalone dispatcher for the secure-messaging integration suite.
 *
 *   node test-harnesses/integration.mjs
 *   node test-harnesses/integration.mjs messaging-world
 *
 * messaging-world COMMITS SM-WORLD so Explorer has rows. Exit 0 pass · 1 fail · 2 bootstrap.
 */
import sql from 'mssql';
import { loadEnvFrom } from './load-env.mjs';

loadEnvFrom(import.meta.url);

const ALL_BUNDLES = ['messaging-world'];

const args = process.argv.slice(2);
const only = args.filter((a) => !a.startsWith('-'));

const { DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD } = process.env;
const pool = await new sql.ConnectionPool({
    server: DB_HOST ?? 'localhost',
    port: Number(DB_PORT ?? 1433),
    database: DB_DATABASE,
    user: DB_USERNAME,
    password: DB_PASSWORD,
    options: { trustServerCertificate: true, encrypt: false },
    pool: { max: 10, min: 1 },
    requestTimeout: 60_000,
}).connect();

const { setupSQLServerClient, SQLServerProviderConfigData, UserCache } = await import('@memberjunction/sqlserver-dataprovider');
const provider = await setupSQLServerClient(
    new SQLServerProviderConfigData(pool, process.env.MJ_CORE_SCHEMA || '__mj'),
);
await UserCache.Instance.Refresh(pool);
const user = UserCache.Users.find((u) => u?.Type?.trim().toLowerCase() === 'owner') ?? UserCache.Users[0];
if (!user) {
    console.error('BOOTSTRAP: no context user in UserCache');
    process.exit(2);
}

await import('@mj-biz-apps/common-entities');
await import('@mj-biz-apps/secure-messaging-entities');
await import('@mj-biz-apps/secure-messaging-server');
const { IntegrationCheckRegistry } = await import('@memberjunction/testing-integration');
await import('@mj-biz-apps/secure-messaging-integration-tests');

const registry = IntegrationCheckRegistry.Instance;
const baseContext = {
    User: user,
    Provider: provider,
    Pool: pool,
    Schema: process.env.MJ_CORE_SCHEMA || '__mj',
    Storage: undefined,
};

const requested = only.length ? only : ALL_BUNDLES;
let pass = 0;
let fail = 0;
const failures = [];

for (const request of requested) {
    const [bundle, localId] = request.includes('.') ? [request.split('.')[0], request] : [request, null];
    const checks = registry.GetBundle(bundle).filter((c) => !localId || c.Id === localId);
    if (checks.length === 0) {
        console.error(`\n✖ no checks matched '${request}' — known bundles: ${registry.GetBundleNames().join(', ')}`);
        fail++;
        continue;
    }

    console.log(`\n=== ${bundle} (${checks.length} check${checks.length === 1 ? '' : 's'}) ===`);
    const ctx = { ...baseContext };
    const lifecycle = registry.GetLifecycle(bundle);

    try {
        if (lifecycle) await lifecycle.Setup(ctx);
        for (const check of checks) {
            const started = Date.now();
            try {
                await check.Fn(ctx);
                pass++;
                console.log(`  ✔ ${check.Name}  (${Date.now() - started}ms)`);
            } catch (e) {
                fail++;
                const message = String(e?.message ?? e).split('\n')[0];
                failures.push({ Id: check.Id, message });
                console.log(`  ✖ ${check.Name}\n      ${message}`);
                const nested = e?.originalError?.message ?? e?.precedingErrors?.[0]?.message;
                if (nested && nested !== message) console.log(`      ↳ ${nested}`);
            }
        }
    } catch (e) {
        fail++;
        const message = String(e?.message ?? e).split('\n')[0];
        failures.push({ Id: `${bundle} (setup)`, message });
        console.log(`  ✖ ${bundle} SETUP FAILED\n      ${message}`);
    } finally {
        if (lifecycle) await lifecycle.Teardown(ctx).catch((e) => console.warn(`  teardown warn: ${e.message}`));
    }
}

console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} — ${pass} passed, ${fail} failed`);
if (fail) failures.forEach((f) => console.log(`  · ${f.Id}: ${f.message}`));
await pool.close();
process.exit(fail === 0 ? 0 : 1);
