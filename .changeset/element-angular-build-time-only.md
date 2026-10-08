---
"@mj-biz-apps/secure-messaging-actions": patch
"@mj-biz-apps/secure-messaging-core": patch
"@mj-biz-apps/secure-messaging-element": patch
"@mj-biz-apps/secure-messaging-entities": patch
"@mj-biz-apps/secure-messaging-ng": patch
"@mj-biz-apps/secure-messaging-server": patch
---

Installing Secure Messaging no longer breaks the host's Explorer.

The external contact widget, `@mj-biz-apps/secure-messaging-element`, is a self-contained bundle
that a website loads with a `<script>` tag. No MemberJunction host imports it, but it caused two
problems in hosts:

- `mj-app.json` listed it under `packages.shared`, so `mj app install` added it to the host's
  Explorer and API and Explorer's build imported it. Its `main` file, `dist/mj-secure-messaging.js`,
  is not in the published package, so that import could not resolve. The manifest no longer lists
  the widget, and `mj app install` no longer adds it to hosts.
- It listed eight `@angular/*` packages as runtime `dependencies` at `^21.2.23`. Explorer pins
  Angular at exactly `21.2.22`, which does not satisfy that range, so installing the app added a
  second Angular (`21.2.25`) to the host. With two copies of Angular, Explorer rendered a blank page
  and logged `NG0203` for `MSAL_INSTANCE`.

`ng build` compiles Angular, rxjs, zone.js and the conversation UI from
`@mj-biz-apps/secure-messaging-ng` into the widget's browser files, so none of them are runtime
dependencies. They are now `devDependencies`, and installing the package adds nothing else.

The workspace now builds against the same Angular versions the MJ host uses:

- `@angular/*` at `21.2.22`.
- `@angular/cdk` at `21.2.14`. It has its own version line.
- The build tools (`@angular/cli`, `@angular/build`, `@angular-devkit/build-angular`) at `21.2.23`.

The root `pnpm.overrides` use these exact versions too, because an override takes precedence over
the versions each package declares. `@angular/elements` and `@angular/service-worker` are now in
the overrides as well. `@mj-biz-apps/secure-messaging-ng` keeps its `^21.2.22` peer ranges, and its
`devDependencies` now pin `21.2.22` exactly.

The widget bundle now contains Angular `21.2.22` instead of `21.2.23`.
