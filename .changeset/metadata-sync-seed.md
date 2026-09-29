---
"@mj-biz-apps/secure-messaging-actions": minor
"@mj-biz-apps/secure-messaging-core": minor
"@mj-biz-apps/secure-messaging-element": minor
"@mj-biz-apps/secure-messaging-entities": minor
"@mj-biz-apps/secure-messaging-ng": minor
"@mj-biz-apps/secure-messaging-server": minor
---

Ship the app's metadata as a migration, so `mj app install` delivers it.

`mj app install` applies migrations and nothing else, and no earlier release carried a
`Metadata_Sync` migration. A host that installed v1.0.0 through v2.0.0 without running
`mj sync push` by hand is therefore missing everything under `metadata/`. This release adds
`V202609291543__v2.0.x__Metadata_Sync` for SQL Server and PostgreSQL, which installs:

- the **Secure Messages** application (the Explorer app with the Inbox nav item);
- the **Secure Messaging** action category and its 4 actions (Issue Portal Magic Link, Send
  Secure Message, Start Secure Thread, Promote Thread) with their 19 params;
- the entity settings: user search off on all 6 entities (secure messaging content stays out of
  global search), delete via the API off on Portal Sessions, Portal Magic Links, Secure Messages
  and File Requests, and the Secure Threads left-nav form with its related-list layout.

The migration is idempotent. On a host that already ran `mj sync push`, it attaches to the
existing rows instead of failing, and running it twice changes nothing. Both files were proven
on databases built from migrations only (MJ core 6.1.2 and bizapps-common 5.47.0), and each
ends in the same state a push produces.

Entity descriptions are no longer overridden from `metadata/`. The old overrides carried
pre-v2 text, such as a portal session "maps a contact to a channel thread", which pushes wrote
over the baseline's descriptions. Descriptions now come only from the migration's
`MS_Description` properties, as in MJ core and the other BizApps.
