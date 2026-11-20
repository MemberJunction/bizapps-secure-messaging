---
"@mj-biz-apps/secure-messaging-actions": patch
"@mj-biz-apps/secure-messaging-core": patch
"@mj-biz-apps/secure-messaging-element": patch
"@mj-biz-apps/secure-messaging-entities": patch
"@mj-biz-apps/secure-messaging-ng": patch
"@mj-biz-apps/secure-messaging-server": patch
---

Make `@mj-biz-apps/secure-messaging-element` Angular and runtime dependencies build-time only (`devDependencies`).

`ng build` compiles Angular, `rxjs`, `zone.js`, and `@mj-biz-apps/secure-messaging-ng` into the self-contained widget bundle, so none of them are runtime `dependencies`. Moving them to `devDependencies` prevents installing a duplicate Angular version into a host.

Pin the workspace `pnpm.overrides` and Angular `devDependencies` to match the MemberJunction host (`@angular/*` at `21.2.22`, `@angular/cdk` at `21.2.14`, Angular build tools at `21.2.23`), including `@angular/elements` and `@angular/service-worker`, so the lockfile resolves a single `@angular/core` (`21.2.22`).
