# @mj-biz-apps/secure-messaging-core

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

- Updated dependencies [7981928]
- Updated dependencies [a756b84]
- Updated dependencies
  - @mj-biz-apps/secure-messaging-entities@1.2.0

## 1.1.0

### Minor Changes

- 69e58ff: v1.1: raise the MemberJunction dependency floor from ^5.43.0 to ^5.45.0 across all packages (and `mjVersionRange` to >=5.45.0), and fix the app manifest — the element package was declared with the invalid OpenApp role `widget`, which the manifest schema rejects on install; it is now `components`.

### Patch Changes

- Updated dependencies [69e58ff]
  - @mj-biz-apps/secure-messaging-entities@1.1.0
