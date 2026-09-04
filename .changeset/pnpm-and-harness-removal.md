---
"@mj-biz-apps/secure-messaging-actions": patch
"@mj-biz-apps/secure-messaging-core": patch
"@mj-biz-apps/secure-messaging-element": patch
"@mj-biz-apps/secure-messaging-entities": patch
"@mj-biz-apps/secure-messaging-ng": patch
"@mj-biz-apps/secure-messaging-server": patch
---

Migrate the repo to pnpm and remove the private dev harness, matching the bizapps family baseline.

- `packageManager` moves from npm 10.5.0 to pnpm 10.33.0; `package-lock.json` is replaced by `pnpm-lock.yaml`; CI installs with `pnpm install --frozen-lockfile`.
- `apps/MJAPI` and `apps/MJExplorer` are removed. They were private and unpublished, and under pnpm's strict layout an in-repo MJAPI cannot boot (two physical copies of `@memberjunction/server` collide in type-graphql's process-global metadata).
- Two dependency declarations that npm hoisting used to hide are now explicit: `class-validator` in the server package (the generated GraphQL input types decorate with it), and `@memberjunction/ng-base-forms`, `@memberjunction/ng-entity-viewer` and `@memberjunction/ng-link-directives` in the Angular package (the generated forms import them).
- `@types/express` is overridden to 5.x so the express 5 types that `@memberjunction/server` publishes against are the ones every workspace package resolves.
- The class-registration manifest prebuild now passes `--scan-dist`, so published (dist-only) dependencies such as `@mj-biz-apps/common-entities` keep contributing their registered classes. The regenerated manifests register exactly the same classes as before; only the generator's chunked layout changed.
