# Publishing Setup — bizapps-secure-messaging

This repo publishes the six `@mj-biz-apps/secure-messaging-*` packages to npm with the Open App release-line pipeline.

## Branch model

This repo follows release lines ([guides/RELEASE_LINES.md](guides/RELEASE_LINES.md)):

```
feature ──PR──▶ next ──backport label──▶ lts/6.1 ──(App opens Version Packages PR)──▶ main ──(publish.yml)──▶ npm
```

- `next` is built on MJ Edge and **never versions or publishes**. PRs land there first, with a changeset (`pnpm run change`). A migration or `metadata/` change needs at least a **`minor`** changeset (`migration changeset` check).
- A `backport lts/X.Y` label (for example `backport lts/6.1`) on the PR into `next` makes `backport.yml` open the cherry-pick PR into that line once it merges. The changeset travels with it.
- Every push to a line runs `version.yml`, which refreshes that line's **Version Packages PR**, opened by the `blue-cypress-ci-bot` App. It runs `pnpm run version:prepare`: `changeset version`, the `mj-app.json` version and MJ range sync (`ci/sync-mj-app-version.mjs`), and a lockfile refresh.
  - The newest line (`releasesThrough: main` in `release-lines.json`): `changeset-release/main` → `main`. Publishes as `latest`; afterwards the App opens and merges a `release-back-merge/vX.Y.Z` PR into the line.
  - An older line (`releasesThrough: branch`): `changeset-release/lts/X.Y` → `lts/X.Y`. Publishes under the dist-tag `lts-X.Y`; no back-merge.
- **Merging that PR is the release** (`Cut the Release` dispatch, `line` input empty for the newest line). `release-readiness.yml` gates it (`rr:` checks: no pending changesets, bump level, metadata shipped, Postgres counterparts, release base current, migration immutability, packages on npm). `publish.yml` publishes over npm OIDC under the line's dist-tag, tags `vX.Y.Z`, checks the dist-tag, and opens a PR into `next` removing the changesets it released.
- There is no hand-opened PR into `main`, and nothing commits to `main` directly.

## npm authentication — OIDC (no NPM_TOKEN secret)

`publish.yml` declares `id-token: write`; npm verifies the GitHub Actions OIDC identity at publish time. There is no `NPM_TOKEN` secret to manage.

One-time setup on npmjs.com (per package, by an `@mj-biz-apps` org owner): under each package's **Settings → Trusted Publisher**, add this repo (`MemberJunction/bizapps-secure-messaging`) and the `publish.yml` workflow. Trusted publishing can only be configured *after* the package exists, so a brand-new package needs a manual placeholder publish before automation can take it over.

## Choosing the bump

| Release contains | Bump | Notes |
|---|---|---|
| A new `.sql` migration or substantive `metadata/` change | **minor** (at minimum) | `migration changeset` enforces this on PRs to `next` and `lts/*`; `rr: minor bump` verifies the aggregate release |
| A breaking change or new release line major | **major** | Removed/renamed endpoint, MJ major-floor move, narrowed API |
| Code fixes only | **patch** | Only bump level allowed on an `lts`-status line |

## Notes

- **Private workspace packages are exempt from the npm existence gate.** `packages/IntegrationTests` is `"private": true` and is never published; `changeset publish` skips private packages outright, so `validate-npm-packages.sh` and `validate-package-files.sh` skip them too. The root `package.json` depends on it with `workspace:*` so Changesets version bumps never leave a stale exact pin in the root manifest.
- This repo's baseline is `V`-prefixed (`V202607201423__v1.0.0__Baseline_Schema.sql`), so `validate-migration-filenames.sh` and the timestamp/changeset gates in `changes.yml` are active here — new migrations must be `V[YYYYMMDDHHMM]__…` and have matching `migrations-pg/*.pg.sql` counterparts before release.
- On `lts/*` branches, the `next`-only timestamp watermark is skipped; `lines: migrations` checks migration ordering against `next` instead.
