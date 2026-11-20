---
"@mj-biz-apps/secure-messaging-actions": patch
"@mj-biz-apps/secure-messaging-core": patch
"@mj-biz-apps/secure-messaging-entities": patch
"@mj-biz-apps/secure-messaging-ng": patch
"@mj-biz-apps/secure-messaging-server": patch
---

Declare `@memberjunction/actions-base` (`^6.3.0-edge.1`) in `@mj-biz-apps/secure-messaging-ng` `peerDependencies` (imported directly by the workspace components), add exact `6.3.0-edge.1` `devDependencies` anchors for `@memberjunction/*` peers across published packages, and pass `--no-sync-deps` to `mj codegen manifest` in the `secure-messaging-ng` and `secure-messaging-server` `prebuild` scripts so local builds do not write imported sibling packages back into `dependencies`.
