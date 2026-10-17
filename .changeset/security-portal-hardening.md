---
"@mj-biz-apps/secure-messaging-core": patch
"@mj-biz-apps/secure-messaging-server": patch
"@mj-biz-apps/secure-messaging-ng": patch
---

Portal API hardening:

- The portal `GET /threads/:threadId/messages` response no longer includes the AI pipeline's internal fields: `generatedReply` (an unapproved draft) and `approvalStatus` are always stripped, and `approvedReply` is returned only once the reply has actually been sent (`sentAt`/`sentContent` set). Staff surfaces read the message stores directly and are unaffected.
- `POST /threads/:threadId/signature-requests` now enforces the thread-writable guard (Closed/Archived threads are read-only, matching file requests) and validates the caller-supplied `signatureAccountId` against the active `MJ: Signature Accounts` (with an active provider), rejecting anything else with 400. The portal `GET .../signature-requests` response no longer echoes `signatureAccountId`, and the field is removed from the Angular `SignatureRequest` contract.
- Attachment uploads that pass `secureMessageId` now verify the message belongs to the authorized thread before linking the file (404 otherwise), closing cross-thread file planting.
- Uploads that declare `text/html` or `image/svg+xml` are stored as `application/octet-stream`, so pre-auth download URLs cannot serve contact-uploaded active content inline.
- Route-parameter IDs (`threadId`, signature `requestId`, file-request `requestId`) are validated as well-formed UUIDs (the same guard already applied to `artifactId`/`messageFileId`) and rejected with 400 before any query; `assertUuid`/`isUuid` are now exported from `@mj-biz-apps/secure-messaging-core`.
