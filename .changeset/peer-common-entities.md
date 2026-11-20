---
"@mj-biz-apps/secure-messaging-ng": patch
---

Move `@mj-biz-apps/common-entities` from `dependencies` to `peerDependencies` (`^5.34.0`) with an exact `devDependencies` anchor (`5.34.0`), matching the Open App dependency model so hosts keep a single copy of sibling app entity packages.
