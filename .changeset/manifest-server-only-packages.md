---
"@mj-biz-apps/secure-messaging-entities": patch
---

`mj-app.json` now lists `@mj-biz-apps/secure-messaging-core`, `@mj-biz-apps/secure-messaging-actions` under `server` instead of `shared`. They use server-only code (Node built-ins, or MemberJunction's actions, AI engine, storage or server packages), and `shared` installs a package into MJExplorer too. The Open App client bootstrap imports every `shared` package, so Explorer's browser build failed on a host with this app installed (`Could not resolve "node:crypto"`, `"node:net"`, `"stream"`). The server still loads them exactly as before.

`@mj-biz-apps/secure-messaging-element` is no longer in the manifest. It is the standalone Angular Elements bundle that external websites embed, with its own Angular runtime and custom-element registration. Listed as shared, it was installed into MJExplorer and imported there, loading a second Angular runtime. It is still published to npm for embedding sites.
