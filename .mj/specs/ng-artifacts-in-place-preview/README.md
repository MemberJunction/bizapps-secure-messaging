# Spec: In-Place `@memberjunction/ng-artifacts` Preview & Docs vs. Notes Rubric

Living specification directory for wiring `@memberjunction/ng-artifacts` (`<mj-artifact-viewer-panel>`) into an in-place slide-over/modal preview host for `MessageFile.ArtifactID` attachments in `MemberJunction/bizapps-secure-messaging` and codifying the **MJ Docs (`MJ: Artifacts`) vs. `MJ: Comments` vs. Quick Notes** architectural boundary.

## Documents

- [`spec.md`](./spec.md) — Full technical specification, domain personas & critical user journeys, component architecture, `SM-WORLD` 90-record seed model, batched `ArtifactFileStore` + adversarial cross-tenant RLS verification, Playwright light/dark visual verification, and `AC-1`–`AC-6` traceability matrix.

## Related Living Documentation

- [`CLAUDE.md`](../../../CLAUDE.md#mj-docs-mj-artifacts-vs-mj-comments-vs-quick-notes) — Repository-wide MemberJunction standards & Docs vs. Comments vs. Quick Notes rubric.
- [`AGENTS.md`](../../../AGENTS.md#mj-docs-mj-artifacts-vs-mj-comments-vs-quick-notes) — Package tiers, 5-Rule BizApps Performance & Caching Standard, and rubric summary.
- [`README.md`](../../../README.md) — Root overview, staff/contact experience, storage rubric, and test commands.
- [`packages/Angular/README.md`](../../../packages/Angular/README.md) — `<mj-secure-messaging-artifact-preview>` bindings, accessibility guarantees, and `--mj-*` design-token standards.
- [`packages/IntegrationTests/README.md`](../../../packages/IntegrationTests/README.md) — 90-record 4-org `SM-WORLD` fixtures, `AR1`–`AR6` RLS checks, and Playwright light/dark verification.
