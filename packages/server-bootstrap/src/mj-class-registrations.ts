/**
 * Pre-built class registrations manifest for the Secure Messaging server packages.
 *
 * External consumers (and the MJ host) import this to prevent tree-shaking of our
 * dynamically registered @RegisterClass classes (the Secure Web communication provider,
 * the eSignature provider drivers, and server-side Actions).
 *
 * The contents are generated at build time by `mj codegen manifest` (see the package's
 * `prebuild` script) and ship via the `@mj-biz-apps/secure-messaging-bootstrap/mj-class-registrations`
 * sub-export.
 *
 * Usage in a host entry point:
 *   import '@mj-biz-apps/secure-messaging-bootstrap/mj-class-registrations';
 */
export * from './generated/mj-class-registrations.js';
