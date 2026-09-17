# @mj-biz-apps/secure-messaging-ng

## 2.0.0

### Major Changes

- b5c64cb: Move to MemberJunction 6.1.2 and harden the portal's external-facing surface.

  **Breaking — MemberJunction 6 is now required.** The MJ floor moves from `^5.45` to `^6.1.2`
  across every package, and `mj-app.json`'s `mjVersionRange` from `>=5.45.0 <6.0.0` to
  `>=6.1.2 <7.0.0`. Angular moves to 21.x. A host still on MJ 5 cannot run this release.

  **Breaking — `POST /auth/magic-link` is gone.** It minted a raw magic-link token from a
  caller-supplied `PortalSession.ID` with no authentication, and session IDs are sequential
  GUIDs — unauthenticated contact account takeover. The widget never called it. Magic links
  remain server-issued (provisioning / promote) and delivered out-of-band. Any caller of this
  endpoint must move to the server-issued path.

  Other fixes from the same adversarial security review:

  - **Executive Inbox XSS.** Contact-authored message content was rendered through
    `bypassSecurityTrustHtml` + `[innerHTML]`, letting any external contact run script in a
    staff Explorer session. Now rendered as plain text with `white-space: pre-wrap`.
  - **Signature-route authorization.** `refresh` / `void` / `download` now verify the
    `requestId` is linked to the asserted thread, and `createSignatureRequest` verifies the
    artifact is attached to the thread via a `MessageFile` row. Previously any contact could
    exfiltrate arbitrary artifacts instance-wide, void other clients' envelopes, and drive the
    org's e-sign account.
  - **SQL injection.** `artifactId` / `messageFileId` are UUID-validated before `ExtraFilter`
    interpolation in `ArtifactFileStore`; `contactId` is escaped in `PortalAuthService`.
  - **Header injection.** `Content-Disposition` filename is sanitized.
  - **Immortal sessions.** Portal sessions gain a 30-day absolute age cap alongside the sliding
    7-day extension; aged-out sessions are retired and a fresh magic link mints a new session
    rather than resurrecting the old one.

  Also in this release:

  - Secure Threads gains left-nav chrome and L1 form inclusion in Explorer.
  - CodeGen is scoped with an `includeSchemas` allow-list so it no longer walks schemas this
    app does not own.
  - Generated Angular forms are re-emitted under MJ 6.1.x module partitioning (an FNV-1a hash
    of the component class name, not `maxComponentsPerModule`, now decides submodule placement).

### Patch Changes

- 97fe77a: Migrate the repo to pnpm and remove the private dev harness, matching the bizapps family baseline.

  - `packageManager` moves from npm 10.5.0 to pnpm 10.33.0; `package-lock.json` is replaced by `pnpm-lock.yaml`; CI installs with `pnpm install --frozen-lockfile`.
  - `apps/MJAPI` and `apps/MJExplorer` are removed. They were private and unpublished, and under pnpm's strict layout an in-repo MJAPI cannot boot (two physical copies of `@memberjunction/server` collide in type-graphql's process-global metadata).
  - Two dependency declarations that npm hoisting used to hide are now explicit: `class-validator` in the server package (the generated GraphQL input types decorate with it), and `@memberjunction/ng-base-forms`, `@memberjunction/ng-entity-viewer` and `@memberjunction/ng-link-directives` in the Angular package (the generated forms import them).
  - `@types/express` is overridden to 5.x so the express 5 types that `@memberjunction/server` publishes against are the ones every workspace package resolves.
  - The class-registration manifest prebuild now passes `--scan-dist`, so published (dist-only) dependencies such as `@mj-biz-apps/common-entities` keep contributing their registered classes. The regenerated manifests register exactly the same classes as before; only the generator's chunked layout changed.

- Updated dependencies [b5c64cb]
- Updated dependencies [97fe77a]
  - @mj-biz-apps/secure-messaging-core@2.0.0
  - @mj-biz-apps/secure-messaging-entities@2.0.0

## 1.2.0

### Minor Changes

- Make MJ Secure Messaging compatible with MemberJunction 6.1.0-edge.4.

  Every `@memberjunction/*` dependency, devDependency, and peerDependency across all
  six published packages plus the two test-harness apps moves from `^5.45.0` to
  `^6.1.0-edge.4` (81 specifiers), and `mj-app.json` `mjVersionRange` moves from
  `>=5.45.0 <6.0.0` to `>=6.1.0-edge.4 <7.0.0`.

  Why: a tenant upgrading to MJ 6.1.0-edge.4 could not consume this app at all. It
  failed twice — `npm ci` aborted with ERESOLVE because the 5.x peer ranges cannot be
  satisfied against a 6.1 host, and `mj app install` hard-rejected the manifest because
  the declared `mjVersionRange` excludes 6.x. The caret (rather than a frozen pin) keeps
  the packages installable against later 6.x releases without another republish.

  The ranges are the only change required: no MemberJunction API used by this app broke
  between 5.45 and 6.1, so there are no source changes. All six packages compile clean
  against the 6.1 type definitions.

  Also regenerates `package-lock.json`. The committed lockfile was not this repository's —
  its workspace entries described the `bizapps-sonar` packages (`@mj-biz-apps/sonar-ng`,
  `sonar-actions`, `sonar-entities`, `sonar-server`) and included `packages/Engine` and
  `packages/CoreEntitiesServer`, directories that do not exist here, while omitting
  `packages/Core` and `packages/Element` entirely. `npm ci` therefore installed the wrong
  dependency graph for every secure-messaging package. The regenerated lockfile contains
  the correct eight workspaces and resolves `@mj-biz-apps/common-*` to 5.36.0, whose
  MemberJunction peer ranges (`^6.1.0-edge.3`) are satisfied under 6.1 — the previously
  locked 5.31.2 peers on `@memberjunction/core@^5.40.2` and would have been unsatisfiable.

### Patch Changes

- 849db13: Update tsconfig.angular.json path mappings and sync class registration manifest for Angular components.
- Updated dependencies [7981928]
- Updated dependencies [a756b84]
- Updated dependencies
  - @mj-biz-apps/secure-messaging-entities@1.2.0
  - @mj-biz-apps/secure-messaging-core@1.2.0

## 1.1.0

### Minor Changes

- 69e58ff: v1.1: raise the MemberJunction dependency floor from ^5.43.0 to ^5.45.0 across all packages (and `mjVersionRange` to >=5.45.0), and fix the app manifest — the element package was declared with the invalid OpenApp role `widget`, which the manifest schema rejects on install; it is now `components`.

### Patch Changes

- Updated dependencies [69e58ff]
  - @mj-biz-apps/secure-messaging-core@1.1.0
  - @mj-biz-apps/secure-messaging-entities@1.1.0
