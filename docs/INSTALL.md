# Secure Messaging — Install / Fresh-DB Provisioning

> The checklist to stand this app up on a **clean database**. Steps marked **[you]** are yours to run
> (DB + all `mj` CLI + MJAPI); steps marked **[app]** are config in this repo. Ordering is strict:
> the pipeline is **migrate → codegen → sync**, and credentials come after the schema exists.

## 1. Database + MJ core  **[you]**
1. `CREATE DATABASE` for the fresh instance.
2. Create the two SQL logins/users this app's `.env` expects: `MJ_Connect` (runtime) and
   `MJ_CodeGen` (codegen), with the passwords already in `.env`.
3. Bootstrap the **`__mj` core schema** into the new DB (standard MJ install).
4. Bootstrap **`__mj_BizAppsCommon`** — Secure Messaging soft-references `Person` there
   (`SecureThread.ContactID`, `PortalSession.ContactID`). Without it, contact lookups + the
   `mjBizAppsCommonPerson` GraphQL query 404.

## 2. Point the app at the new DB  **[app]**
- Edit `.env` → set `DB_DATABASE` to the new database name. **Nothing else in `.env` changes** —
  the encryption key, Azure/MS-Graph, DocuSign, Box, and `SECURE_MESSAGING_*` values all carry over.
- `.env` is gitignored — never commit it.

## 3. Pipeline  **[you]**
Run in this order (the app's scripts wrap the CLI):
1. `npm run mj:migrate` — runs the full chain, ending with `…SecureThread_Entity.sql`. On a clean DB
   the backfill sections no-op (verified); the run creates the final v2 schema.
2. `npm run mj:codegen` — registers our entities (`SecureThread` + the rest) with
   `BaseTable`/`SchemaName`/`vw*`/SPs and writes the generated TS + Angular forms. **Verify it created
   entities under `__mj_BizAppsSecureMessaging` and did NOT touch `__mj` / `__mj_BizAppsCommon`.**
3. `npm run build` — packages build in dependency order. **Expect breakage here on the first run
   after codegen** — that's the Slice-0 rewire (Core/Server/UI still reference the dropped session
   columns + string ThreadID). Claude fixes those; not an install error.
4. `npx mj sync push` (once builds are green) — pushes metadata overrides + action/application records.

## 4. Credentials re-setup (after schema + codegen)  **[you, via Explorer UI]**
These live in the DB, so a fresh DB means re-creating them. All go through the **MJ Credential Engine**
(encrypted with `MJ_BASE_ENCRYPTION_KEY`, already in `.env`).
1. **Encryption key row** — ensure the `MJ_BASE_ENCRYPTION_KEY` is registered so credential
   encrypt/decrypt validates ("All 1 encryption key(s) validated successfully").
2. **Box (file storage)** — create the Box.com **Credential** (OAuth; the JSON uses both `clientId`
   *and* `clientID` keys — the dual-key workaround), a **File Storage Account** pointing at it, and
   **activate the Box.com provider**. Box refresh tokens rotate on every use, so the stored token
   likely needs re-minting via `scripts/box-oauth-exchange.mjs`.
3. **DocuSign (e-signature)** — create the DocuSign **Credential** (integration key + RSA private key
   + user/account IDs) and a **Signature Account**. Grant consent once via the consent URL.

## 5. Notify hook (already configured in `.env`)  **[verify]**
`SECURE_MESSAGING_EMAIL_PROVIDER=Microsoft Graph` + the `AZURE_*` app-registration values drive the
outbound magic-link email. The Azure app needs `Mail.Send` application permission + admin consent and
must send as `AZURE_ACCOUNT_EMAIL`. No-ops gracefully if unconfigured.

## 6. Boot + smoke test  **[you + Claude]**
1. Start MJAPI (`:4101`) and MJExplorer (`:4301`); widget on `:4400`. **[you start MJAPI]**
2. Secure Messaging app appears in the Explorer switcher → thread-grouped inbox loads.
3. Magic link deep-links into a thread in the widget; message round-trips both directions.
4. File upload/download (Box) both sides; send-for-signature (DocuSign) with field placement.

---
**Why fresh over reusing `SM_TEST_2`:** it exercises the real install path we ship, and the only thing
lost is dev backfill test data. It also sidesteps the one hazard on the old DB — CodeGen had already
built schemabound views over the session columns this migration drops.
