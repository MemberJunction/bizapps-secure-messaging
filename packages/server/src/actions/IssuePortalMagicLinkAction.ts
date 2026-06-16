import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';
import { ActionResultSimple, RunActionParams } from '@memberjunction/actions-base';
import { PortalAuthService } from '../services/PortalAuthService.js';

/**
 * Server-side MJ Action that issues a fresh single-use portal magic link for an existing
 * portal session, via {@link PortalAuthService.generateMagicLink}. This is the staff-side
 * path: the Client Workspace (running inside MJ Explorer as an authenticated MJ user)
 * invokes this Action through the data provider, rather than calling the contact-facing
 * portal REST endpoint or trying to mint/hash a token on the client.
 *
 * The raw token is generated and hashed server-side; only the hash is persisted (a
 * `Portal Magic Links` row, Status `Pending`, 15-minute TTL). The raw token is returned in
 * the `MagicLinkToken` output param so a caller can deliver it (e.g. email the contact).
 *
 * Input params:
 *   - `SessionID` (required) — the Portal Session to issue the link for.
 * Output params:
 *   - `MagicLinkToken` — the raw, single-use token (deliver out-of-band; never stored raw).
 *
 * Register the corresponding `Issue Portal Magic Link` Action metadata with
 * `ServerDriverKey = 'IssuePortalMagicLinkAction'`.
 */
@RegisterClass(BaseAction, 'IssuePortalMagicLinkAction')
export class IssuePortalMagicLinkAction extends BaseAction {
    protected async InternalRunAction(params: RunActionParams): Promise<ActionResultSimple> {
        const sessionId = this.getParam(params, 'SessionID');
        if (!sessionId) {
            return { Success: false, ResultCode: 'MISSING_SESSION_ID', Message: 'SessionID is required.' };
        }

        try {
            const result = await PortalAuthService.Instance.generateMagicLink(sessionId, params.ContextUser);
            if (!result.success) {
                return {
                    Success: false,
                    ResultCode: 'GENERATION_FAILED',
                    Message: result.errorMessage || 'Failed to generate magic link.',
                };
            }

            // Surface the raw token as an output param (single-use; deliver out-of-band).
            params.Params.push({ Name: 'MagicLinkToken', Value: result.rawToken, Type: 'Output' });
            return {
                Success: true,
                ResultCode: 'SUCCESS',
                Message: 'Magic link issued.',
                Params: params.Params,
            };
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return { Success: false, ResultCode: 'ERROR', Message: msg };
        }
    }

    /** Read an input param's value by name (case-insensitive). */
    private getParam(params: RunActionParams, name: string): string {
        const p = params.Params?.find(x => x.Name?.toLowerCase() === name.toLowerCase());
        const v = p?.Value;
        return typeof v === 'string' ? v : v != null ? String(v) : '';
    }
}
