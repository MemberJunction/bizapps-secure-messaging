# Publishing Setup — bizapps-secure-messaging

This repo publishes the six `@mj-biz-apps/secure-messaging-*` packages to npm using a
Changesets-based pipeline, modeled on **bizapps-common** (`MemberJunction/bizapps-common`).
The workflow files, validator scripts, `ci/` helpers, and Changesets config are already in place.

## Branch model

```
feature branch ──PR──▶ next ──(merge)──▶ main ──(push triggers publish.yml)──▶ npm
```

- PRs land on **`next`**. `build.yml` + `changes.yml` run as checks.
- Changesets (`.changeset/*.md`) accumulate on `next`. A migration-bearing PR to `next` is
  *required* to include a changeset (`changes.yml` enforces this).
- Releasing = merging **`next` → `main`**. The push to `main` fires `publish.yml`, which (if
  pending changesets exist) bumps the fixed version across all six packages, builds,
  `changeset publish` to npm, tags `vX.Y.Z`, commits the bump back to `main`, then merges
  `main` → `next` and refreshes the lockfile.
- If there are **no** pending changesets, a push to `main` is a no-op.

> **Branch protection:** like bizapps-common, `main` is **not** protected. The "publish only flows
> next→main" rule is a *convention*, enforced by discipline. `publish.yml` pushes the version-bump
> commit back to `main` using the default `GITHUB_TOKEN`, which works because `main` is open.

## npm authentication — OIDC (no NPM_TOKEN secret)

This repo publishes via **npm OIDC trusted publishing**, the same as bizapps-common. The workflow
declares `id-token: write` and npm verifies the GitHub Actions OIDC identity at publish time —
there is **no `NPM_TOKEN` secret** to manage.

One-time setup on npmjs.com (per package, by an `@mj-biz-apps` org owner): under each package's
**Settings → Trusted Publisher**, add this repo (`MemberJunction/bizapps-secure-messaging`) and the
`publish.yml` workflow. Trusted publishing can only be configured *after* the package exists, so a
brand-new package needs a manual first publish before automation can take it over.

## Release state

Bootstrapping is done. All six packages exist on npm with Trusted Publisher configured,
`v1.0.0` and `v1.1.0` are tagged, and the kill-switch `if:` has been removed from
`build-and-publish` — a push to `main` with pending changesets publishes automatically.

Releasing is now just: land changesets on `next`, merge `next` → `main`, watch `publish.yml`.

### Choosing the bump

`publish.yml` computes the version it *expects* and aborts if `changeset version` disagrees,
so the changeset and the repo convention have to line up:

| Release contains | Bump | Notes |
|---|---|---|
| A new `.sql` migration | **minor** (at minimum) | `changes.yml` already enforces this on PRs to `next` |
| No migration, but a breaking change | **major** | Removed/renamed endpoint, MJ major-floor move, narrowed API |
| Neither | patch | |

The workflow detects a major by grepping the changesets for `"@mj-biz-apps/…": major`; for
minor-vs-patch it looks for files under `migrations/` or `migrations-pg/` changed since the
`v<current>` tag. **That detection is only as good as the tags** — if a version was
hand-bumped in `package.json` without ever being published and tagged, `git rev-parse` misses
and the check silently degrades to "no migrations". Don't hand-bump versions; let Changesets
do it.

## Notes

- **Private workspace packages are exempt from the npm existence gate.** `packages/IntegrationTests`
  is `"private": true` and is never published; `changeset publish` skips private packages
  outright, so `validate-npm-packages.sh` skips them too rather than demanding an npm
  placeholder that will never exist. The root `package.json` depends on it with `workspace:*`
  rather than an exact version: Changesets' fixed-version group bumps every `@mj-biz-apps/*`
  package together, including this one, but does not rewrite the root manifest — so an exact
  pin goes stale on every release, and with no registry copy to fall back on the post-publish
  `pnpm install --lockfile-only` fails with a 404.

- Unlike bizapps-common/tasks (whose schema migration is a `B`-prefixed Flyway baseline), this
  repo's baseline is `V`-prefixed (`V202607201423__v1.0.0__Baseline_Schema.sql`), so
  `validate-migration-filenames.sh` and the timestamp/changeset gates in `changes.yml` are **active**
  here — new migrations must be `V[YYYYMMDDHHMM]__…` and migration-bearing PRs to `next` need a
  changeset with at least a minor bump.
