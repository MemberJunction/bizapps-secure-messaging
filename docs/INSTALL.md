# Secure Messaging — Installation & Provisioning

> The checklist to stand this app up against a MemberJunction database. The happy path is
> `mj app install` (see the README); this document is the manual/dev walkthrough — useful for
> fresh-database provisioning, development installs from source, and the credential setup that
> every install needs. Ordering is strict: **migrate → codegen → build → sync**, and credentials
> come after the schema exists.

## 1. Database prerequisites

The app installs **into an existing MemberJunction database** — it owns only its
`__mj_BizAppsSecureMessaging` schema and expects the rest to be there:

1. A SQL Server database with the **`__mj` core schema** bootstrapped (standard MJ install),
   running **MJ >= 5.45**.
2. The **`__mj_BizAppsCommon`** schema (from the `bizapps-common` app) — Secure Messaging
   soft-references `Person` there (`SecureThread.ContactID`, `PortalSession.ContactID`). Without
   it, contact lookups and the `mjBizAppsCommonPerson` GraphQL query 404.
3. Two SQL logins the `.env` references: a runtime user (e.g. `MJ_Connect`) and a codegen user
   (e.g. `MJ_CodeGen`) with DDL rights.

## 2. Configure `.env`

Copy your MJ connection settings and set `DB_DATABASE` to the target database. The app's own
settings (all optional-but-recommended):

| Variable | Purpose |
|----------|---------|
| `SECURE_MESSAGING_PORTAL_URL` | Public origin of the contact widget — magic links point here |
| `SECURE_MESSAGING_EMAIL_PROVIDER` / `FROM_EMAIL` / `FROM_NAME` | Outbound nudge emails via MJ's CommunicationEngine (no-op when unset) |
| `SECURE_MESSAGING_PROMOTE_SECRET` | HMAC secret enabling the server-to-server `/promote` endpoint |
| `SECURE_MESSAGING_MESSAGE_BACKEND` | `owned` (default) or `channel` |
| `MJ_BASE_ENCRYPTION_KEY` | Required for the Credential Engine (file storage / e-signature creds) |

`.env` is gitignored — never commit it.

## 3. Pipeline

Run in this order (the app's npm scripts wrap the MJ CLI):

1. `npm run mj:migrate` — applies the app's migrations into its own schema (the app keeps an
   isolated Flyway history in `__mj_BizAppsSecureMessaging`; pass
   `--schema __mj_BizAppsSecureMessaging` if invoking the CLI directly).
2. `npm run mj:codegen` — registers the entities (`SecureThread`, `SecureMessage`,
   `PortalSession`, …) with their views/SPs and regenerates the typed code. Verify it created
   entities under `__mj_BizAppsSecureMessaging` and did **not** touch `__mj` / `__mj_BizAppsCommon`.
3. `npm run build` — all packages build in dependency order.
4. `npx mj sync push --dir=metadata` — pushes the application, actions, and entity-metadata
   overrides. The **Secure Messages** Explorer app has `DefaultForNewUser=0`; assign it to users
   via User Applications (then restart MJAPI so its user cache picks the assignment up).

## 4. Credentials (per-database, via the Explorer UI)

Credentials live in the database (MJ **Credential Engine**, encrypted with
`MJ_BASE_ENCRYPTION_KEY`), so a fresh database means creating them again:

1. **Encryption key** — confirm the key registers on boot
   ("All 1 encryption key(s) validated successfully" in the MJAPI log).
2. **File storage (e.g. Box)** — create the provider **Credential** (for Box OAuth, include both
   `clientId` and `clientID` keys in the credential JSON — the driver reads the latter), a
   **File Storage Account** pointing at it, and activate the provider. Note Box refresh tokens
   rotate on every use; re-mint via `scripts/box-oauth-exchange.mjs` if the stored one is stale.
3. **E-signature (e.g. DocuSign)** — create the **Credential** (integration key + RSA private key
   + user/account IDs) and a **Signature Account**; grant consent once via the provider's consent
   URL.

## 5. Notify hook

With `SECURE_MESSAGING_EMAIL_PROVIDER` + from-address set (e.g. Microsoft Graph via an Azure app
registration with `Mail.Send` application permission and admin consent), staff outbound messages
email the contact a magic-link nudge that deep-links into the thread. Gracefully no-ops when
unconfigured.

## 6. Smoke test

1. Start MJAPI and MJ Explorer; serve the widget (its dev harness runs on `:4400`).
2. **Secure Messages** appears in the Explorer app switcher → the thread-grouped inbox loads.
3. Compose to a contact → the contact's magic link deep-links into the thread in the widget →
   messages round-trip both directions.
4. File upload/download works on both sides; send-for-signature (with visual field placement)
   creates a real envelope.
