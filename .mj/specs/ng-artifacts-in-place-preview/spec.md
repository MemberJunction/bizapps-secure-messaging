# Specification: In-Place `@memberjunction/ng-artifacts` Preview for `MessageFile.ArtifactID` & Docs vs. Notes Architectural Rubric

- **Repository**: `MemberJunction/bizapps-secure-messaging`
- **Target Trunk**: `next` (pinned `@memberjunction/*@6.3.0-edge.1`)
- **Status**: Implemented & Verified (Slices 1–3)
- **Schema / Auth Impact**: None (`migrations/**`, `**/auth/**`, and `**/security/**` untouched)

---

## 1. Motivation & Design Decisions

MJ Secure Messaging already persists attached MJ Doc deliverables via `MessageFile.ArtifactID` and `ArtifactFileStore` (`packages/Core/src/stores/ArtifactFileStore.ts`), while keeping conversational text in `SecureMessage.Content` and structured upload prompts in `FileRequest.Instructions`.

Prior to this change, clicking an attached `MessageFile` triggered a binary download even when `MessageFile.ArtifactID` pointed to a rich, versioned `MJ: Artifacts` deliverable. This specification establishes:

1. **In-place MJ Doc preview**: Clicking any `MessageFile` with a populated `ArtifactID` opens `@memberjunction/ng-artifacts` (`<mj-artifact-viewer-panel>`) inside a theme-native slide-over/modal drawer (`<mj-secure-messaging-artifact-preview>`) without navigating away from the conversation thread or losing scroll position.
2. **Graceful non-artifact fallback**: Clicking any `MessageFile` with `ArtifactID = null` (e.g., wet-ink scans, PDFs, encrypted ZIPs) preserves the existing authenticated download flow unchanged.
3. **Clear content-storage boundaries**: Codifies the **MJ Docs (`MJ: Artifacts`) vs. `MJ: Comments` vs. Quick Notes** rubric in `CLAUDE.md`, `AGENTS.md`, and `README.md` so future contributors and AI agents never conflate deliverables, internal comments, and transactional relational fields.

### Rejected Alternatives

- **Navigating to a standalone Artifacts Explorer route**: Rejected because leaving the thread breaks conversational context when reviewing deliverables alongside instructions and violates in-place preview requirements.
- **Building a bespoke Markdown/JSON/HTML viewer in `packages/Angular`**: Rejected because it duplicates MJ core artifact rendering, version switching, and theming capabilities and creates maintenance drift against `@memberjunction/ng-artifacts@6.3.0-edge.1`.
- **Migrating `SecureMessage.Content` or `FileRequest.Instructions` into `MJ: Artifacts`**: Rejected because transactional message bodies and file-request prompts belong in Category C relational columns for indexed querying, sorting, pagination, and bounded window hydration.

---

## 2. Architectural Rubric: MJ Docs (`MJ: Artifacts`) vs. `MJ: Comments` vs. Quick Notes

| Category | Primitive | Intended Role | Classification in `bizapps-secure-messaging` |
|---|---|---|---|
| **Category A — Record Discussions** | `MJ: Comments` | Lightweight, internal, threaded annotations anchored to MJ entity records for staff collaboration. | Separate from external client portal threads; do not use `MJ: Comments` to store external portal messages. |
| **Category B — MJ Docs** | `MJ: Artifacts` + `MJ: Artifact Versions` | Versioned, shareable, reviewable deliverables (briefs, contracts, BAAs, SOC-2 control matrices, generated reports) rendered through `@memberjunction/ng-artifacts`. | **`MessageFile.ArtifactID`** — stored via `ArtifactFileStore` and previewed in-place via `<mj-secure-messaging-artifact-preview>` → `<mj-artifact-viewer-panel>`. |
| **Category C — Quick Notes & Relational Text** | Direct `NVARCHAR` columns on owning entity tables | High-frequency, transactional text requiring relational querying, full-text indexing, sorting, and single-round-trip hydration. | **`SecureMessage.Content`** and **`FileRequest.Instructions`** — MUST remain Category C relational columns in `__mj_BizAppsSecureMessaging`. |

---

## 3. Domain Personas & Critical User Journeys

### CUJ-1: External Portal Recipient / Internal Case Reviewer (In-Place MJ Doc Preview & Binary Fallback)
1. Opens an active secure thread containing both an MJ Doc deliverable (populated `MessageFile.ArtifactID`, e.g., `Northstar MSA Deliverable` v2) and a standard binary attachment (`MessageFile.ArtifactID = null`, e.g., wet-ink PNG or PDF invoice).
2. Clicks the MJ Doc attachment row/chip; `<mj-secure-messaging-artifact-preview>` opens in-place as a right-hand slide-over drawer (with expand/restore modal toggle) and mounts `<mj-artifact-viewer-panel>` without leaving the thread or resetting scroll position.
3. Reviews the formatted artifact across light (`[data-theme="light"]`) or dark (`[data-theme="dark"]`) semantic `--mj-*` themes with zero raw Markdown leaks and zero console/page errors.
4. Presses `Escape` (or clicks Close / backdrop) to dismiss the drawer; keyboard focus restores cleanly to the triggering attachment element.
5. Clicks the non-artifact binary attachment; the preview host remains closed and the existing pre-authenticated download flow executes.
6. If a populated `ArtifactID` references a deleted or RLS-inaccessible artifact, the host displays a clean theme-native unavailable state (with optional Download fallback) and emits zero console errors.

### CUJ-2: Cross-Tenant Adversarial Caller (RLS & Session Boundary Verification)
1. Authenticates as a valid participant of Organization B (`Meridian Health Systems`, e.g., `Samantha Chen`) with zero membership on Organization A's (`Northstar Legal Advisory`, `Priya Nair`) thread.
2. Attempts to list Organization A's attachments (`getThreadAttachments`), download Organization A's `MessageFile` (`downloadAttachment`), inject Organization A's `messageFileId` against Organization B's `threadId` (`ArtifactFileStore.getDownloadUrl`), or read Organization A's cached thread window (`SecureMessagingEngineBase.LoadThreadWindow`).
3. Every unauthorized cross-tenant attempt is strictly rejected (`contactThreadStatus === null`, HTTP `403 Access denied to this thread` with zero `ArtifactFileStore` queries, `File not found in this thread`, or immediate per-viewer cache eviction), while authorized Org A and Org B participants resolve their own `MessageFile.ArtifactID` deliverables via a single batched `RunViews` round-trip.

### CUJ-3: Staff Executive Inbox & Client Workspace Operator (OpenApp Chrome & Registration Parity)
1. Launches **Secure Messages** from the MJ Explorer app switcher (`metadata/applications/` `DefaultNavItems` → `SecureMessagingResource`).
2. `SecureMessagingResource` renders inside `<mj-page-layout>` chrome, calls `NotifyLoadComplete()` after initialization, preserves deep-link query params between Executive Inbox and Client Workspace views, and persists basic/advanced workspace mode via `UserInfoEngine.Instance` (never `localStorage`).
3. `LoadSecureMessagingClient()` anchors `SecureMessagingApplication`, `SecureMessagingResource`, `CLASS_REGISTRATIONS`, and all 6 generated `BaseFormComponent` subclasses in `MJGlobal.Instance.ClassFactory` (OpenApp v3 Dual Form Registration Parity).

---

## 4. Client Architecture (`packages/Angular`)

- **Preview Host**: `SecureMessagingArtifactPreviewComponent` (`packages/Angular/src/lib/secure-messaging-artifact-preview.component.ts`, selector `mj-secure-messaging-artifact-preview`):
  - Standalone Angular 21 component using `ChangeDetectionStrategy.OnPush`, `@if`/`@for`, and `inject()`.
  - Zero `any`, zero `unknown` casts, zero `BaseEntity.Get()/Set()`, zero `localStorage`, zero `window.print()`.
  - **Lazy mounting & zero eager N+1**: `<mj-artifact-viewer-panel>` mounts via `@if` only while an active `ArtifactId` is open and passes a lightweight `RunView.FromMetadataProvider(this.ProviderToUse)` availability pre-check against `MJ: Artifact Versions` (`ResultType: 'simple'`, explicit `Fields`).
  - **Stale-load cancellation**: Monotonic load-token counter ignores superseded async responses when rapidly switching attachments or closing mid-fetch.
  - **Keyboard & ARIA accessibility**: `role="dialog"`, `aria-modal="true"`, `Escape`-to-close `@HostListener('document:keydown')`, backdrop/button close, and focus restoration to `[TriggerElement]`.
  - **Exclusive `--mj-*` design tokens**: Verified across all components in `packages/Angular/src/lib/` by Vitest regex lint (`packages/Angular/src/__tests__/design-tokens-lint.spec.ts`) forbidding raw `#hex`, `rgb()`, `rgba()`, and `hsl()` color literals.
- **Thread & Workspace Wiring**:
  - `SecureMessagingExecutiveComponent` and `SecureMessagingClientWorkspaceComponent` route clicks on attachments with populated `ArtifactID` to `<mj-secure-messaging-artifact-preview>` while preserving explicit download buttons and null-`ArtifactID` download fallback.
  - `ConversationComponent` emits `(artifactPreviewRequested)` when an attachment has a populated `artifactId` and falls back to `(download)` otherwise.

---

## 5. Multi-Entity `SM-WORLD` Seed Fixtures & Cross-Stack RLS Integration (`packages/IntegrationTests`)

### 90-Record, 4-Organization Seed Density (`src/world/seed-fixtures.ts`, `src/world/load-world.ts`)

| Entity | Count | Coverage |
|---|---:|---|
| `MJ_BizApps_Common: Organizations` | 4 | `Blue Cypress Press`, `Northstar Legal Advisory` (Org A), `Meridian Health Systems` (Org B), `Summit Academic Press` (Org C) |
| `MJ_BizApps_Common: People` | 12 | 4 roles (`Admin`, `CaseReviewer`, `ExternalContact`, `PortalRecipient`) across all 4 tenants |
| `Secure Threads` | 12 | 4 periods (`2026-Q1`–`2026-Q4`), all lifecycles (`Active`, `Closed`, `Archived`), including Email-promoted thread |
| `Portal Sessions` | 12 | `Active`, `Expired`, and `Revoked` lifecycles |
| `Secure Messages` | 18 | `New`, `Read`, `Sent`, `Replied`, `Inbound`/`Outbound`, `IsStarred`, `IsImported` |
| `MJ: Artifacts` | 6 | Versioned MJ Doc deliverables (Markdown & JSON) |
| `MJ: Artifact Versions` | 10 | Multi-version `v1 → v2` progressions across the 6 artifacts |
| `Message Files` | 10 | 6 artifact-backed MJ Docs (populated `ArtifactID`) + 4 non-artifact binary fallbacks (`ArtifactID = null`) |
| `File Requests` | 4 | `Pending`, `Fulfilled`, `Expired` |
| `Portal Magic Links` | 2 | `Pending`, `Used` |
| **Total** | **90** | Seeded in strict 10-step FK dependency order via strongly-typed `BaseEntity` subclasses |

### Batched Resolution & Adversarial Cross-Tenant RLS (`src/checks/artifact-resolution.ts`, `src/checks/artifact-rls.checks.ts`, `src/__tests__/artifact-file-store-rls.integration.spec.ts`)

- Registered bundles in `test-harnesses/integration.mjs`: `messaging-world` (`CW1`–`CW7`) and `messaging-artifacts-rls` (`AR1`–`AR6`).
- Batched two-step resolution uses `RunView.RunViews([...])` with `ResultType: 'simple'`, explicit `Fields`, and chunked `ID IN (...)` (max 200 IDs per chunk) — zero N+1 hydration and zero raw SQL subqueries.
- Verifies existing security & RLS boundaries (authorized Org A & Org B resolution, cross-tenant `403` rejection with zero `ArtifactFileStore` queries, cross-thread `messageFileId` injection rejection, `LoadThreadWindow` per-viewer cache isolation, and `CanRead` metadata gating) without modifying `**/auth/**`, `**/security/**`, or `migrations/**`.

---

## 6. Headless Chromium Playwright Verification & CI Hardening

- **Playwright Visual Suite** (`packages/IntegrationTests/src/__tests__/artifact-preview.playwright.spec.ts`):
  - Command: `pnpm --filter @mj-biz-apps/secure-messaging-integration-tests run test:playwright`
  - Captures light (`.playwright-cli/artifact-preview-light.png`) and dark (`.playwright-cli/artifact-preview-dark.png`) screenshots of the mounted thread attachment strip and in-place `<mj-secure-messaging-artifact-preview>` / `<mj-artifact-viewer-panel>` host.
  - Verifies Escape-to-close dismissal, focus restoration, non-artifact download fallback, loaded FontAwesome icon CSS, `Object.prototype.hasOwnProperty.call` custom-element safety, zero raw Markdown leaks, zero broken `<img>` elements, and strictly `0` `pageErrors` / `0` `consoleErrors`.
- **CI Workflows**:
  - `.github/workflows/build.yml` runs package repository/files validation, guard tests/specs, `pnpm run build:packages`, and `pnpm test` on PRs targeting `next`, `main`, and `lts/**`.
  - `.github/workflows/repo-checks.yml` runs `check-dependency-model.mjs` (self-test + repo) and verifies `mj.config.cjs` does not enable `outOfOrder: true`.

---

## 7. Acceptance Criteria & Verification Traceability

| Criterion | Summary | Primary Code / Docs | Verification Artifacts |
|---|---|---|---|
| **AC-1** | In-place `<mj-artifact-viewer-panel>` slide-over/modal host (`OnPush`, `@if`/`@for`, `inject()`, Escape-to-close, non-artifact fallback, zero `any`/`unknown`/`.Get()`/`.Set()`) | `packages/Angular/src/lib/secure-messaging-artifact-preview.component.ts`, executive/workspace/conversation components | `ART-1`, `ART-2`, `ART-4` |
| **AC-2** | Exclusive `--mj-*` CSS custom properties, OpenApp Dual Form & `BaseResourceComponent`/`DefaultNavItems` parity, `UserInfoEngine.Instance`, zero `window.print()`, Vitest green | `packages/Angular/src/index.ts`, `packages/Angular/src/lib/secure-messaging-executive.resource.ts`, `packages/Angular/src/__tests__/*.spec.ts` | `ART-2`, `ART-5` |
| **AC-3** | 90-record 4-org `SM-WORLD` fixtures + batched `ArtifactFileStore`/`MessageFile.ArtifactID` resolution + adversarial cross-tenant RLS isolation (no `**/auth/**` or `**/security/**` edits) | `packages/IntegrationTests/src/world/*`, `packages/IntegrationTests/src/checks/*`, `test-harnesses/integration.mjs` | `ART-3`, `ART-6` |
| **AC-4** | Headless Chromium Playwright light & dark visual verification, Escape-to-close, fallback, icon fonts, zero raw Markdown leaks, 0 `pageErrors`/`consoleErrors` | `packages/IntegrationTests/src/__tests__/artifact-preview.playwright.spec.ts` | `ART-4` |
| **AC-5** | `.github/workflows/` CI builds, unit/integration tests (`pnpm test`), and static guards pass 100% on PRs targeting `next` | `.github/workflows/build.yml`, `.github/workflows/repo-checks.yml` | `ART-1`, `ART-2`, `ART-3` |
| **AC-6** | Docs vs. Comments vs. Quick Notes rubric in `CLAUDE.md` & `AGENTS.md`, synchronized root `README.md`, package READMEs, `.mj/specs/ng-artifacts-in-place-preview/**`, and valid `.changeset/ng-artifacts-in-place-preview.md` | `CLAUDE.md`, `AGENTS.md`, `README.md`, `.mj/specs/ng-artifacts-in-place-preview/*`, `.changeset/ng-artifacts-in-place-preview.md` | `ART-7`, `ART-1`, `ART-2` |
