---
"@mj-biz-apps/secure-messaging-actions": major
"@mj-biz-apps/secure-messaging-core": major
"@mj-biz-apps/secure-messaging-element": major
"@mj-biz-apps/secure-messaging-entities": major
"@mj-biz-apps/secure-messaging-ng": major
"@mj-biz-apps/secure-messaging-server": major
---

Move to MemberJunction 6.1.2 and harden the portal's external-facing surface.

**Breaking — MemberJunction 6 is now required.** The MJ floor moves from `^5.45` to `^6.1.2`
across every package, and `mj-app.json`'s `mjVersionRange` from `>=5.45.0 <6.0.0` to
`>=6.1.2 <7.0.0`. Angular moves to 21.x. A host still on MJ 5 cannot run this release.

**Breaking — `POST /auth/magic-link` is gone.** It minted a raw magic-link token from a
caller-supplied `PortalSession.ID` with no authentication, and session IDs are sequential
GUIDs — unauthenticated contact account takeover. The widget never called it. Magic links
remain server-issued (provisioning / promote) and delivered out-of-band. Any caller of this
endpoint must move to the server-issued path.

Other fixes from the same adversarial security review:

- **Executive Inbox XSS.** Contact-authored message content was rendered through
  `bypassSecurityTrustHtml` + `[innerHTML]`, letting any external contact run script in a
  staff Explorer session. Now rendered as plain text with `white-space: pre-wrap`.
- **Signature-route authorization.** `refresh` / `void` / `download` now verify the
  `requestId` is linked to the asserted thread, and `createSignatureRequest` verifies the
  artifact is attached to the thread via a `MessageFile` row. Previously any contact could
  exfiltrate arbitrary artifacts instance-wide, void other clients' envelopes, and drive the
  org's e-sign account.
- **SQL injection.** `artifactId` / `messageFileId` are UUID-validated before `ExtraFilter`
  interpolation in `ArtifactFileStore`; `contactId` is escaped in `PortalAuthService`.
- **Header injection.** `Content-Disposition` filename is sanitized.
- **Immortal sessions.** Portal sessions gain a 30-day absolute age cap alongside the sliding
  7-day extension; aged-out sessions are retired and a fresh magic link mints a new session
  rather than resurrecting the old one.

Also in this release:

- Secure Threads gains left-nav chrome and L1 form inclusion in Explorer.
- CodeGen is scoped with an `includeSchemas` allow-list so it no longer walks schemas this
  app does not own.
- Generated Angular forms are re-emitted under MJ 6.1.x module partitioning (an FNV-1a hash
  of the component class name, not `maxComponentsPerModule`, now decides submodule placement).
