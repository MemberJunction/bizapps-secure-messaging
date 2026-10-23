---
"@mj-biz-apps/secure-messaging-server": patch
"@mj-biz-apps/secure-messaging-ng": patch
---

Security hardening of the portal REST API: stop returning `SignatureAccountID` to external contacts (it was the one input needed to send envelopes through the org's e-signature account via the contact-callable create route); verify caller-supplied `secureMessageId`/`externalMessageId` upload-link targets belong to the thread before linking a file to them; boundary-validate caller-supplied IDs (`threadId`, `requestId`, `signatureAccountId`, `artifactId`) as well-formed UUIDs; reject future-dated timestamps on the HMAC-signed `/promote` endpoint; pin CI validation workflows to a read-only `GITHUB_TOKEN`; correct the README, which still documented a public `POST /auth/magic-link` route that was removed as an account-takeover vector.
