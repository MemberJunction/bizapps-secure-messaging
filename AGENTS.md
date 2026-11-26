# AGENTS.md — MJ Secure Messaging (`MemberJunction/bizapps-secure-messaging`)

See [`CLAUDE.md`](CLAUDE.md) for the complete MemberJunction development ruleset (typing, `BaseSingleton`, Angular syntax, git safety, migrations, metadata sync, and release lines). This file summarizes the repository-specific package boundaries, performance & caching rules, and verification commands.

## Package Tiers (`mj-app.json`)

- **`shared` (client + server)**: `@mj-biz-apps/secure-messaging-entities` (`packages/Entities`) — generated entity subclasses + `SecureMessagingEngineBase`.
- **`server`**: `@mj-biz-apps/secure-messaging-core`, `@mj-biz-apps/secure-messaging-actions`, `@mj-biz-apps/secure-messaging-server`.
- **`client`**: `@mj-biz-apps/secure-messaging-ng` (`packages/Angular`).
- Never import server-tier packages from client-tier code or cross-package re-export types. Place shared client+server engines and types in `packages/Entities/src/engine/` (outside `src/generated/`).

## 5-Rule BizApps Performance & Caching Standard

1. **`BaseEngine` for bounded lookup/config metadata — never unbounded transactional tables**
   - Use `SecureMessagingEngineBase.Instance` (`@RegisterForStartup()`, lazy `await Config(false, contextUser, provider)`) for bounded lookup/config tables: `MJ: Artifact Types`, `MJ: Actions` (bounded to Secure Messaging + eSignature actions), `MJ: File Storage Accounts`, and `MJ: Signature Accounts`.
   - Use `ObserveProperty` / `DataChange$` when reactive updates are needed.
   - **Never** globally cache unbounded transactional/security tables (`Secure Threads`, `Secure Messages`, `Message Files`, `File Requests`, `Portal Sessions`, `Portal Magic Links`, `MJ: Record Changes`).

2. **Multi-provider, impersonation, `CanRead`, and RLS `CacheLocal` safety**
   - Override `ProviderToUse` (`this._activeProvider ?? super.ProviderToUse`), pass `provider` unchanged to `super.Load(...)`, and force-refresh + clear container caches on provider switch. Never hardcode `Metadata.Provider`.
   - Set `CacheLocal: true` **only** on global non-RLS reference/taxonomy tables (`MJ: Artifact Types`, `MJ: Actions`).
   - Set **`CacheLocal: false`** on any RLS-protected, tenant-scoped, or permissioned org account config table (`MJ: File Storage Accounts`, `MJ: Signature Accounts`).
   - Gate every optional/permissioned entity on existence (`EntityByName`) AND `GetUserPermisions(user).CanRead` before loading so restricted portal/external users never fail warmup.
   - Angular components accept `@Input() Provider: IMetadataProvider | null = null`, expose `ProviderToUse`, and thread it to `RunView.FromMetadataProvider(this.ProviderToUse)`, `this.ProviderToUse.GetEntityObject(...)`, and engine calls.

3. **Batch with `rv.RunViews([...])` + `ResultType: 'simple'` + explicit `Fields`**
   - Collapse sequential `await rv.RunView(...)` calls and `Promise.all([new RunView().RunView(...), ...])` fan-outs into a single `rv.RunViews([...])` batch call.
   - Use `ResultType: 'simple'` + explicit `Fields: [...]` whenever mutation (`.Save()`/`.Delete()`) is not needed. Only load `entity_object` for rows actually being mutated.

4. **`ConversationEngine`-style bounded per-container cache — never cache arbitrary filtered lists**
   - Use `SecureMessagingEngineBase.Instance.LoadThreadWindow(threadId, options)` for per-thread message + file (+ optional file-request) windows.
   - Enforces bounded LRU eviction (`MaxCachedThreads`) and per-thread row caps (`MaxMessagesPerThread`, `MaxFilesPerThread`, `MaxFileRequestsPerThread`), isolates cache entries by active viewer (`viewerScopeKey`/`userId`) and provider, and auto-invalidates on `BaseEntity` save/delete/remote-invalidate events (plus explicit `InvalidateThread(threadId)` after server-side Action writes).
   - Never cache arbitrary filtered/sorted inbox queries or search queries.

5. **RLS-safe two-step entity reads — zero raw SQL subqueries**
   - Load IDs from the owning/junction entity via first-class `RunView`, then fetch related records with chunked `ID IN (...)` clauses (max 200 IDs per chunk, batched via `rv.RunViews([...])`). Never write raw SQL subqueries (`IN (SELECT ...)`) that bypass entity-level RLS.

## Build, Test, and Guard Commands

```bash
pnpm install
pnpm run build:packages
pnpm test
node .github/scripts/check-dependency-model.mjs
node .github/scripts/check-caret-pins.mjs
./.github/scripts/validate-package-repository.sh
./.github/scripts/validate-package-files.sh
```

## Critical Guardrails

- Zero `any` and zero lazy `unknown` types.
- Zero `.Get()`/`.Set()` on generated entity fields — use strongly typed entity subclasses.
- Always extend `BaseSingleton<T>` for singletons.
- Use Angular `@if`/`@for`/`@switch` (never `*ngIf`/`*ngFor`).
- Never edit `src/generated/` files by hand.
- Never squash-merge PRs — always merge with `--merge` to preserve commit history.
