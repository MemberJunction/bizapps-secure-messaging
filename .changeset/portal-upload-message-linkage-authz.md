---
"@mj-biz-apps/secure-messaging-server": patch
---

Security hardening on the contact-facing portal API:

- Attachment uploads now verify that a caller-supplied `secureMessageId` / `externalMessageId`
  names a message inside the authenticated thread. Previously an authenticated contact could
  link their uploaded file to ANY message in the instance (message IDs are sequential GUIDs,
  so cross-thread IDs are predictable), planting the file into another conversation's
  "Message Files" view on the staff side.
- Signature-request create and void now enforce the Closed/Archived read-only rule (PRD §7),
  matching messages, uploads, and file-request actions.
