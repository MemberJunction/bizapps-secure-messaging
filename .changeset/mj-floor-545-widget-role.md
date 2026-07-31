---
"@mj-biz-apps/secure-messaging-actions": minor
"@mj-biz-apps/secure-messaging-core": minor
"@mj-biz-apps/secure-messaging-element": minor
"@mj-biz-apps/secure-messaging-entities": minor
"@mj-biz-apps/secure-messaging-ng": minor
"@mj-biz-apps/secure-messaging-server": minor
---

v1.1: raise the MemberJunction dependency floor from ^5.43.0 to ^5.45.0 across all packages (and `mjVersionRange` to >=5.45.0), and fix the app manifest — the element package was declared with the invalid OpenApp role `widget`, which the manifest schema rejects on install; it is now `components`.
