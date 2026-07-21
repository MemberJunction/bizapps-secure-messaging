/**
 * MJAPI Server Configuration.
 *
 * Empty by design — all settings come from @memberjunction/server (DEFAULT_SERVER_CONFIG),
 * which reads deployment-specific values from environment variables (.env at the repo root):
 *   DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD, DB_TRUST_SERVER_CERTIFICATE,
 *   MJ_CORE_SCHEMA, GRAPHQL_PORT, GRAPHQL_BASE_URL, TENANT_ID, WEB_CLIENT_ID, ...
 *
 * Add overrides here only if needed.
 */

/** @type {import('@memberjunction/config').MJConfig} */
module.exports = {};
