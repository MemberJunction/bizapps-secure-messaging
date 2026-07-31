# @mj-biz-apps/secure-messaging-core

## 1.1.0

### Minor Changes

- 69e58ff: v1.1: raise the MemberJunction dependency floor from ^5.43.0 to ^5.45.0 across all packages (and `mjVersionRange` to >=5.45.0), and fix the app manifest — the element package was declared with the invalid OpenApp role `widget`, which the manifest schema rejects on install; it is now `components`.

### Patch Changes

- Updated dependencies [69e58ff]
  - @mj-biz-apps/secure-messaging-entities@1.1.0
