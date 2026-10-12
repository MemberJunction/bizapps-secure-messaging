---
'@mj-biz-apps/secure-messaging-server': patch
'@mj-biz-apps/secure-messaging-core': patch
'@mj-biz-apps/secure-messaging-ng': patch
---

Security hardening of the portal REST API and core services:

- Removed the staff-side verbs (`POST .../signature-requests`, `POST .../signature-requests/:id/void`, `POST .../file-requests`) from the contact-facing portal router — an external contact could previously drive the org's e-signature account and fabricate staff-side file requests. Handlers stay exported for staff-authenticated hosts. The portal signature list also no longer discloses the org's `signatureAccountId`.
- Magic-link redemption now checks the `Save()` result and re-verifies the link post-save so exactly one concurrent redeemer wins (TOCTOU fix); a failed session-token save no longer issues a dead token.
- Attachment uploads validate that a supplied `secureMessageId` / `externalMessageId` belongs to the target thread before linking.
- Uploaded filenames are sanitized (path separators, control characters, Unicode bidi overrides) before reaching the storage path or persisted records.
- The promote endpoint's replay guard now rejects future-dated timestamps.
- CORS responses include `Vary: Origin`.
