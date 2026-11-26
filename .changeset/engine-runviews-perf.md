---
"@mj-biz-apps/secure-messaging-entities": minor
"@mj-biz-apps/secure-messaging-core": patch
"@mj-biz-apps/secure-messaging-server": patch
"@mj-biz-apps/secure-messaging-ng": patch
---

Performance and caching wave across Secure Messaging packages:

- Added `SecureMessagingEngineBase` (`BaseEngine` + `@RegisterForStartup()`) in `@mj-biz-apps/secure-messaging-entities` (`shared` tier) caching bounded config/lookup metadata (`MJ: Artifact Types` and bounded `MJ: Actions` with `CacheLocal: true`; `MJ: File Storage Accounts` and `MJ: Signature Accounts` with `CacheLocal: false` and `CanRead` gating), tracking active `ProviderToUse` across provider switches, and providing a bounded `ConversationEngine`-style per-thread LRU window cache (`LoadThreadWindow`) scoped to viewer + provider with automatic `BaseEntity` save/delete/remote-invalidate eviction.
- Collapsed sequential and `Promise.all` `RunView` waterfalls into batched `rv.RunViews([...])` calls with `ResultType: 'simple'` and explicit `Fields` projections across Executive Inbox, Client Workspace, Action Panel, `PortalAuthService`, `OwnedMessageStore`, `ChannelMessageStore`, `ArtifactFileStore`, and server handlers (`fileRequests`, `signatures`).
- Threaded optional `@Input() Provider` (`ProviderToUse`) through Angular staff components and replaced uncached lookup queries (`MJ: Actions`, `MJ: Artifact Types`, `MJ: File Storage Accounts`, `MJ: Signature Accounts`) with `SecureMessagingEngineBase` lookups.
- Added unit tests for `SecureMessagingEngineBase` and Core batched loaders, and documented the 5-Rule BizApps Performance & Caching Standard in `CLAUDE.md` and `AGENTS.md`.
