---
"@mj-biz-apps/secure-messaging-entities": minor
"@mj-biz-apps/secure-messaging-core": minor
"@mj-biz-apps/secure-messaging-server": minor
"@mj-biz-apps/secure-messaging-actions": minor
"@mj-biz-apps/secure-messaging-ng": minor
"@mj-biz-apps/secure-messaging-element": minor
---

Publish the MemberJunction 6.1 compatibility work (#16) to npm.

#16 raised all 81 `@memberjunction/*` specifiers to `^6.1.0-edge.4` and set `mjVersionRange` to `>=6.1.0-edge.4 <7.0.0`, but it also ran `changeset version` and committed the result — so the version reached 1.2.0 in the tree while the changeset that justified it was consumed. `publish.yml` gates every meaningful step (`Update version`, `Publish to npm`, `Get version and create tag`, `Commit and push`) on `steps.changeset_check.outputs.pending != '0'`, and that check counts `.changeset/*.md` files. With none pending, a `next` → `main` merge would have built the packages and then published nothing and cut no tag, leaving the 6.1-compatible code unreachable to `npm ci` and `mj app install` alike.

This changeset restores a pending entry so the pipeline runs end to end. The published result carries the same 6.1 compatibility change; only the version number moves on from the one already committed.
