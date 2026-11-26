# `@mj-biz-apps/secure-messaging-ng`

Angular client package for **MJ Secure Messaging**, providing the MJ Explorer staff surfaces (Executive Inbox, Client Workspace, Action Panel, PDF Field Placer, and In-Place Artifact Preview Host), the shared conversation UI used by `<mj-secure-messaging>`, and the OpenApp client bootstrap (`LoadSecureMessagingClient`).

## Key Components

| Component / Export | Selector | Purpose |
| --- | --- | --- |
| `SecureMessagingResource` | `mj-secure-messaging-resource` | Registered `BaseResourceComponent` entry point wrapped in `<mj-page-layout>` chrome; coordinates Inbox and Client Workspace views with query-param round-tripping and `NotifyLoadComplete()`. |
| `SecureMessagingExecutiveComponent` | `mj-secure-messaging-executive` | Staff triage inbox, thread conversation viewer, compose modal, and attachment bar. |
| `SecureMessagingClientWorkspaceComponent` | `mj-secure-messaging-client-workspace` | Contact 360 workspace unifying threads, file requests, signature requests, documents, portal session controls, and audit trail. User mode preference persists via `UserInfoEngine.Instance`. |
| `SecureMessagingArtifactPreviewComponent` | `mj-secure-messaging-artifact-preview` | Standalone, theme-native slide-over/modal preview host wrapping `<mj-artifact-viewer-panel>` from `@memberjunction/ng-artifacts`. |
| `SecureMessagingActionPanelComponent` | `mj-secure-messaging-action-panel` | Shared staff action panel for requesting files and sending documents for e-signature. |
| `ConversationComponent` | `sm-conversation` | Shared thread conversation surface consuming `SECURE_MESSAGING_DATA_SOURCE`. |
| `LoadSecureMessagingClient()` | — | OpenApp `startupExport` anchoring `SecureMessagingApplication`, `SecureMessagingResource`, `CLASS_REGISTRATIONS`, and all 6 generated `BaseFormComponent` subclasses in `MJGlobal.Instance.ClassFactory`. |

## In-Place Artifact Preview Host (`<mj-secure-messaging-artifact-preview>`)

`SecureMessagingArtifactPreviewComponent` embeds `<mj-artifact-viewer-panel>` from `@memberjunction/ng-artifacts` inside a theme-native right-hand slide-over drawer (with an expand/restore modal toggle) so staff and recipients can inspect attached **MJ Doc** deliverables directly inside a message thread without navigating away or losing scroll position.

### Attachment Routing: `MessageFile.ArtifactID` vs. Non-Artifact Fallback

- **Populated `MessageFile.ArtifactID`**: Clicking an attachment row in `SecureMessagingExecutiveComponent` (or a document row in `SecureMessagingClientWorkspaceComponent`) opens `<mj-secure-messaging-artifact-preview>` in place without leaving the thread. In `ConversationComponent`, clicking an attachment with a populated `artifactId` emits `(artifactPreviewRequested)` when observed by a host.
- **Null or empty `MessageFile.ArtifactID`**: Clicking the attachment falls back cleanly to the existing pre-authenticated file download flow (`downloadAttachment` / `downloadDoc` / `download`).
- **Explicit download action**: Staff can still click the dedicated download icon on any attachment row (or the Download fallback button inside the preview drawer header / unavailable state) to download the raw file bytes directly.

### Inputs & Outputs

| Binding | Type | Default | Description |
| --- | --- | --- | --- |
| `[ArtifactId]` / `[artifactId]` | `string \| null` | `null` | Populated `MessageFile.ArtifactID` to preview; `null`/empty keeps the host closed with zero queries executed. |
| `[Filename]` / `[filename]` | `string` | `''` | Attachment filename shown in the drawer header. |
| `[ContentType]` / `[contentType]` | `string` | `''` | Attachment MIME type shown in the subtitle. |
| `[FileSize]` / `[fileSize]` | `number` | `0` | Attachment byte size formatted in the subtitle. |
| `[CanDownload]` / `[canDownload]` | `boolean` | `false` | Enables the download fallback button in the header and unavailable state. |
| `[VersionNumber]` | `number \| undefined` | `undefined` | Optional specific artifact version number forwarded to `<mj-artifact-viewer-panel>`. |
| `[EnvironmentId]` | `string` | `''` | Optional MJ environment ID forwarded to `<mj-artifact-viewer-panel>`. |
| `[Provider]` | `IMetadataProvider \| null` | `null` | Explicit metadata provider override (`ProviderToUse` falls back to `Metadata.Provider`). |
| `[TriggerElement]` | `HTMLElement \| null` | `null` | Triggering attachment element to restore keyboard focus to upon dismissal. |
| `[SkipAvailabilityCheck]` | `boolean` | `false` | Skips the lightweight `MJ: Artifact Versions` (`ResultType: 'simple'`) availability pre-check when `true`. |
| `(Closed)` / `(closed)` | `EventEmitter<void>` | — | Emitted when dismissed via Escape, backdrop click, close button, or inner viewer `(Closed)`. |
| `(DownloadRequested)` / `(downloadRequested)` | `EventEmitter<void>` | — | Emitted when the user triggers the download fallback from inside the preview host. |

### Accessibility, Lazy Mounting & Stale-Load Safety

- **Zero eager queries**: `<mj-artifact-viewer-panel>` is conditionally mounted via `@if` only while an active `ArtifactId` is open and verified accessible, preventing N+1 queries on threads with many attachments.
- **Stale-load cancellation**: Rapidly switching between attachments or dismissing mid-fetch invalidates older in-flight `MJ: Artifact Versions` checks via a monotonic load token.
- **Theme-native unavailable state**: If an attachment's `ArtifactID` has no accessible version (deleted or RLS-restricted), the host renders a clean theme-native empty/error panel with zero console errors and an optional download fallback.
- **Keyboard accessibility**: Implements `role="dialog"`, `aria-modal="true"`, Escape-to-close dismissal (`document:keydown`), backdrop/close-button dismissal, and keyboard focus restoration to the triggering attachment element on close.

## Design Tokens (`--mj-*`)

All Angular component styles in `packages/Angular/src/lib/` use semantic MemberJunction CSS custom properties exclusively (`--mj-bg-surface`, `--mj-bg-surface-card`, `--mj-bg-surface-sunken`, `--mj-bg-overlay`, `--mj-text-primary`, `--mj-text-secondary`, `--mj-text-muted`, `--mj-border-default`, `--mj-border-subtle`, `--mj-brand-primary`, `--mj-brand-on-primary`, `--mj-status-*`, `--mj-shadow-*`, `--mj-focus-ring`) so both light and dark themes render cleanly with zero hardcoded `#hex`, `rgb()`, `rgba()`, or `hsl()` color literals.

## Build & Test

```bash
# Build @mj-biz-apps/secure-messaging-ng (with ngc)
pnpm --filter @mj-biz-apps/secure-messaging-ng build

# Run Vitest unit & design-token/OpenApp parity tests
pnpm --filter @mj-biz-apps/secure-messaging-ng test
```
