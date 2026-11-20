---
"@mj-biz-apps/secure-messaging-server": patch
"@mj-biz-apps/secure-messaging-core": patch
"@mj-biz-apps/secure-messaging-ng": patch
---

Consolidated security hardening for the contact-facing portal API and core services:

- Removed staff-side verbs (`POST /threads/:threadId/signature-requests`, `POST /threads/:threadId/signature-requests/:requestId/void`, `POST /threads/:threadId/file-requests`) from the contact-facing portal router; handlers remain exported for staff-authenticated hosts and now also enforce the Closed/Archived read-only guard (`assertThreadWritable`).
- Stopped disclosing `signatureAccountId` to external contacts in `GET /threads/:threadId/signature-requests` (`SignatureRequest.signatureAccountId` made optional in `@mj-biz-apps/secure-messaging-ng`).
- Verified caller-supplied `secureMessageId` / `externalMessageId` on attachment uploads belong to the authenticated thread (with UUID validation and requiring `messageBackend === 'channel'` for `externalMessageId`).
- Hardened magic-link redemption (`PortalAuthService.redeemMagicLink`) to check `Save()` results on both magic link and session, check `InnerLoad()` success, and perform a post-save winner re-read to prevent concurrent TOCTOU redemption.
- Sanitized uploaded filenames (`sanitizeFilename`) in `ArtifactFileStore` to strip path separators, ASCII control characters, Unicode bidirectional overrides, and dot-only names.
