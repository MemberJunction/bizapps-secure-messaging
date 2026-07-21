import type { RequestHandler } from 'express';
import { Router } from 'express';
import { RegisterClass } from '@memberjunction/global';
import { BaseServerMiddleware } from '@memberjunction/server';
import { createSecureMessagingRouter } from './routes.js';

/** Base path the portal REST API is mounted at (the widget's `api-base-url`). */
export const SECURE_MESSAGING_BASE_PATH = '/secure-messaging/api/v1';

/**
 * Mounts the Secure Messaging portal REST API into the MJAPI request pipeline as
 * **pre-auth** middleware.
 *
 * External contacts authenticate with opaque portal session tokens (`sm_*`), NOT MJ user
 * accounts — so these routes must run BEFORE MJServer's global JWT/API-key auth guard, which
 * would otherwise 401 every request. `GetPreAuthMiddleware()` runs after compression but before
 * the OAuth/REST/GraphQL routes and the auth guard, which is exactly the slot we need. The router
 * itself applies `portalAuthMiddleware` to its protected `/threads/*` routes (the `/auth/*` routes
 * stay public), so token validation still happens — just with the portal's own scheme.
 *
 * Discovered automatically by `serve()` via `@RegisterClass(BaseServerMiddleware, …)`.
 */
@RegisterClass(BaseServerMiddleware, 'secure-messaging')
export class SecureMessagingMiddleware extends BaseServerMiddleware {
    get Label(): string {
        return 'secure-messaging';
    }

    override GetPreAuthMiddleware(): RequestHandler[] {
        // Mount the portal router under the base path. A parent Router scoped to the base path
        // ensures only `/secure-messaging/api/v1/*` requests reach it; everything else falls
        // through to MJServer's normal pipeline.
        const parent = Router();
        parent.use(SECURE_MESSAGING_BASE_PATH, createSecureMessagingRouter());
        return [parent];
    }
}
