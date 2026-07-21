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
`publish.yml` workflow. Trusted publishing can only be configured *after* the package exists, so it
happens together with the placeholder publish below.

## 🔴 KILL SWITCH — the first release is manual at 1.0.0

`publish.yml`'s `build-and-publish` job currently carries a kill-switch `if:` guard, so a push to
`main` will **not** auto-publish. This is deliberate: the packages are already at `1.0.0`, and the
Changesets flow only ever *bumps* (a pending changeset would push the first automated release to
`1.1.0`). So the first release is published manually at `1.0.0`, then the automation takes over.

The pending changeset has been removed for the same reason (nothing to mis-bump after 1.0.0 ships).

**To re-enable automated publishing after the manual 1.0.0 release:** delete the `if:` line on the
`build-and-publish` job in `publish.yml`. From then on, land a changeset on `next`, merge to `main`,
and `publish.yml` cuts `1.1.0` (or as the changeset dictates).

## First publish — the manual 1.0.0 bootstrap

The six packages do **not** yet exist on npm (all return 404), and `validate-npm-packages.sh` fails
the publish job until every package has a version published. Do this once, manually (with an
`@mj-biz-apps` publish token or `npm login`), from the repo at the v1.0.0 commit:

1. `npm ci && npm run build:packages`
2. Publish each package at `1.0.0`, in dependency order:
   - `@mj-biz-apps/secure-messaging-entities`
   - `@mj-biz-apps/secure-messaging-core`
   - `@mj-biz-apps/secure-messaging-actions`
   - `@mj-biz-apps/secure-messaging-server`
   - `@mj-biz-apps/secure-messaging-ng`
   - `@mj-biz-apps/secure-messaging-element`
     (e.g. `cd packages/Entities && npm publish --access public`, etc.)
3. For each package, configure its **Trusted Publisher** on npm →
   `MemberJunction/bizapps-secure-messaging` / `publish.yml`, so the automated OIDC publish works.
4. Tag the release: `git tag v1.0.0 && git push origin refs/tags/v1.0.0`.
5. Remove the kill-switch `if:` in `publish.yml` to hand off to automation.

## Checklist

- [ ] Publish `1.0.0` for all six packages (manually)
- [ ] Configure npm Trusted Publisher for each → `MemberJunction/bizapps-secure-messaging` / `publish.yml`
- [ ] Tag `v1.0.0`
- [ ] Remove the kill-switch `if:` in `publish.yml`
- [ ] Verify: land a changeset on `next`, merge `next` → `main`, confirm `publish.yml` publishes `1.1.0` + tags

## Notes

- Unlike bizapps-common/tasks (whose schema migration is a `B`-prefixed Flyway baseline), this
  repo's baseline is `V`-prefixed (`V202607201423__v1.0.0__Baseline_Schema.sql`), so
  `validate-migration-filenames.sh` and the timestamp/changeset gates in `changes.yml` are **active**
  here — new migrations must be `V[YYYYMMDDHHMM]__…` and migration-bearing PRs to `next` need a
  changeset with at least a minor bump.
