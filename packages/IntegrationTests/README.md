# `@mj-biz-apps/secure-messaging-integration-tests`

Cross-stack integration check bundles, multi-entity `SM-WORLD` domain seed fixtures, adversarial cross-tenant RLS boundary checks, and headless Chromium Playwright visual verification for **MJ Secure Messaging**.

## Multi-Entity `SM-WORLD` Seed Fixtures

Defined in [`src/world/seed-fixtures.ts`](./src/world/seed-fixtures.ts) and persisted via strongly-typed `BaseEntity` subclasses in [`src/world/load-world.ts`](./src/world/load-world.ts) (zero `any`, zero `unknown` casts, zero `BaseEntity.Get()/Set()`):

- **90 total realistic domain records** spanning **4 organizations/tenants**, **4 user roles**, **4 time periods (`2026-Q1`–`2026-Q4`)**, and all entity lifecycles:
  - **4 Organizations**: `Blue Cypress Press` (Publishing), `Northstar Legal Advisory` (Legal & Compliance — Org A), `Meridian Health Systems` (Healthcare — Org B), and `Summit Academic Press` (Higher Education — Org C)
  - **12 People** across `Admin`, `CaseReviewer`, `ExternalContact`, and `PortalRecipient` roles with explicit tenant ownership and permission metadata
  - **12 Multi-Period Secure Threads** across `Active`, `Closed`, and `Archived` statuses (including Email-promoted history)
  - **12 Portal Sessions** across `Active`, `Expired`, and `Revoked` lifecycles
  - **18 Secure Messages** spanning `New`, `Read`, `Sent`, `Replied`, `Inbound`/`Outbound`, `IsStarred`, and `IsImported`
  - **6 Versioned MJ Doc Artifacts (`MJ: Artifacts`)** + **10 `MJ: Artifact Versions`** (v1 → v2 progressions across Markdown and JSON deliverables)
  - **10 `MessageFile` Attachments**: 6 artifact-backed MJ Docs (populated `MessageFile.ArtifactID`) + 4 non-artifact binary fallback files (`MessageFile.ArtifactID = null`)
  - **4 File Requests** (`Pending`, `Fulfilled`, `Expired`) and **2 Portal Magic Links** (`Pending`, `Used`)

### Strict Foreign-Key Seeding Order

`LoadWorld()` upserts records in strict dependency order so every foreign key resolves cleanly across SQL Server and PostgreSQL without deploy-time SQL scripts:

1. `MJ_BizApps_Common: Organizations`
2. `MJ_BizApps_Common: People`
3. `MJ_BizApps_SecureMessaging: Secure Threads`
4. `MJ_BizApps_SecureMessaging: Portal Sessions`
5. `MJ_BizApps_SecureMessaging: Secure Messages`
6. Lookup existing enabled `MJ: Artifact Types` (via `SecureMessagingEngineBase`, never invented)
7. Parent `MJ: Artifacts`
8. Child `MJ: Artifact Versions` (`VersionNumber` 1 → 2)
9. `MJ_BizApps_SecureMessaging: Message Files` (`ArtifactID` populated for MJ Docs; `null` for binary fallbacks)
10. `MJ_BizApps_SecureMessaging: File Requests` & `MJ_BizApps_SecureMessaging: Portal Magic Links`

## Registered Integration Bundles

| Bundle | Checks | Purpose |
|---|---|---|
| `messaging-world` | `CW1`–`CW7` | Commits multi-org `SM-WORLD` via typed `BaseEntity` subclasses, refreshes relative timestamps, and verifies multi-period inbox, sessions, magic links, file requests, versioned MJ Doc artifacts, and binary fallbacks. |
| `messaging-artifacts-rls` | `AR1`–`AR6` | Validates batched `ArtifactFileStore` + `MessageFile.ArtifactID` resolution (`RunView` / `RunViews`, `ResultType: 'simple'`, chunked `ID IN (...)` max 200, zero N+1 hydration) and adversarial cross-tenant RLS isolation. |

### Adversarial Cross-Tenant RLS Scenarios

Implemented in [`src/checks/artifact-resolution.ts`](./src/checks/artifact-resolution.ts), [`src/checks/artifact-rls.checks.ts`](./src/checks/artifact-rls.checks.ts), and [`src/__tests__/artifact-file-store-rls.integration.spec.ts`](./src/__tests__/artifact-file-store-rls.integration.spec.ts) (verifying existing security boundaries without modifying `**/auth/**`, `**/security/**`, or `migrations/**`):

- **Authorized Tenant Resolution (`AR2`, `AR5`)**: Authenticated Organization A (`Priya Nair`, Northstar Legal Advisory) and Organization B (`Samantha Chen`, Meridian Health Systems) participants resolve their own thread's `MessageFile.ArtifactID` v2 deliverables and non-artifact binary fallbacks end-to-end via one batched `RunViews` call.
- **Cross-Tenant Thread & HTTP Handler Rejection (`AR3`, `AR4`)**: Authenticated Organization B caller attempting to access Organization A's thread receives `contactThreadStatus === null` and HTTP `403` (`Access denied to this thread`) from `getThreadAttachments` / `downloadAttachment` with zero `ArtifactFileStore` queries executed (and vice versa for Org A → Org B HIPAA PHI).
- **Cross-Thread `MessageFile.ID` Injection**: Supplying Organization A's `messageFileId` against Organization B's `threadId` in `ArtifactFileStore.getDownloadUrl` is strictly rejected (`File not found in this thread`).
- **Per-Viewer Cache Isolation**: `SecureMessagingEngineBase.LoadThreadWindow` evicts Organization A's cached thread window immediately when `viewerScopeKey` switches to Organization B.
- **Permission-Denied Metadata Gating**: `SecureMessagingEngineBase.Config` skips entities where `CanRead === false` without throwing and keeps `CacheLocal: false` on RLS-eligible org config tables.

## Running Tests & Harnesses

### Deterministic Vitest Integration & RLS Suite (Runs in `pnpm test` and CI)

```bash
# Run the full workspace test suite (includes IntegrationTests)
pnpm test

# Or run IntegrationTests directly
pnpm --filter @mj-biz-apps/secure-messaging-integration-tests test
```

### Headless Chromium Playwright Visual Verification (Light & Dark Themes)

Executes real headless Chromium verification ([`src/__tests__/artifact-preview.playwright.spec.ts`](./src/__tests__/artifact-preview.playwright.spec.ts)) against the mounted thread attachment strip and `<mj-secure-messaging-artifact-preview>` / `<mj-artifact-viewer-panel>` host across both light (`[data-theme="light"]`) and dark (`[data-theme="dark"]`) semantic `--mj-*` themes:

- Opens in-place preview on `MessageFile.ArtifactID` click without leaving the thread
- Verifies Escape-to-close dismissal, keyboard focus restoration, and non-artifact binary download fallback
- Confirms loaded FontAwesome icon CSS, `Object.prototype.hasOwnProperty.call` custom-element safety, zero raw Markdown syntax leaks, zero broken `<img>` elements, and strictly `0` `pageErrors` / `0` `consoleErrors`
- Writes PNG screenshots to `.playwright-cli/artifact-preview-light.png` and `.playwright-cli/artifact-preview-dark.png`

```bash
pnpm --filter @mj-biz-apps/secure-messaging-integration-tests run test:playwright
```

### Live Database Integration Harness

```bash
# Run both messaging-world and messaging-artifacts-rls against a configured MJ SQL Server database
pnpm run test:integration

# Run a single bundle or check
node test-harnesses/integration.mjs messaging-world
node test-harnesses/integration.mjs messaging-artifacts-rls
node test-harnesses/integration.mjs messaging-artifacts-rls.AR3
```

## CI Verification

On every pull request targeting `next`, `.github/workflows/build.yml` and `.github/workflows/repo-checks.yml` execute:

- Package repository & publishable `files` guards (`validate-package-repository.sh`, `validate-package-files.sh`)
- Dependency model & caret-pin guards (`check-dependency-model.mjs`, `check-caret-pins.mjs`)
- Full package build (`pnpm run build:packages`)
- Full deterministic unit and integration test suite (`pnpm test`)
