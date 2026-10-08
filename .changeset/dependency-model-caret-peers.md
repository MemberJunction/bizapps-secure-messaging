---
"@mj-biz-apps/secure-messaging-actions": patch
"@mj-biz-apps/secure-messaging-core": patch
"@mj-biz-apps/secure-messaging-entities": patch
"@mj-biz-apps/secure-messaging-ng": patch
"@mj-biz-apps/secure-messaging-server": patch
---

MemberJunction and other BizApps packages are peer dependencies with caret ranges (nothing in `dependencies`), so a host keeps one copy of each. `@mj-biz-apps/secure-messaging-ng` no longer pins `@mj-biz-apps/common-entities` 5.34.0 in `dependencies` (its `^5.30.0` peer remains), and declares `@memberjunction/actions-base`, which it imports, as a `^6.1.2` peer. Every such peer has an exact `devDependencies` anchor for local builds. Adds `check-dependency-model` to CI.
