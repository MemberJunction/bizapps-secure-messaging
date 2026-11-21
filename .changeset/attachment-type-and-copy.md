---
'@mj-biz-apps/secure-messaging-core': patch
'@mj-biz-apps/secure-messaging-ng': patch
---

Security: attachment uploads with scriptable declared content types (text/html, image/svg+xml, XML variants) are stored as application/octet-stream so a pre-auth download URL can never serve them as active content on the storage origin; the executive UI's encryption claim is corrected to "encrypted in transit and at rest" (the product is not end-to-end encrypted, per the README).
