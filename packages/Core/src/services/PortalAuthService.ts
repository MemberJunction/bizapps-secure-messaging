import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { CompositeKey, Metadata, RunView, UserInfo } from '@memberjunction/core';

/** Prefix for session tokens */
const SESSION_TOKEN_PREFIX = 'sm_';
/** Prefix for magic link tokens */
const MAGIC_LINK_PREFIX = 'sm_ml_';
/** Default session TTL in days */
const DEFAULT_SESSION_TTL_DAYS = 7;
/** Default magic link TTL in minutes */
const DEFAULT_MAGIC_LINK_TTL_MINUTES = 15;

export interface PortalSessionContext {
    sessionId: string;
    channelId: string;
    contactId: string;
    contactEmail: string;
    threadId: string;
}

export interface MagicLinkResult {
    success: boolean;
    rawToken?: string;
    errorMessage?: string;
}

export interface MagicLinkRedemptionResult {
    sessionContext: PortalSessionContext;
    newSessionToken: string;
}

/**
 * Input for provisioning a brand-new secure thread for a contact (session + magic link).
 * Writing the first message is the caller's job (avoids a Core service↔store cycle).
 */
export interface StartSecureThreadInput {
    /** The external contact's email. A matching Person is found, else created. */
    contactEmail: string;
    /** Optional display name, used only when creating a new Person. */
    contactName?: string;
}

/** Result of provisioning a new secure thread. The magic link is delivered out-of-band. */
export interface StartSecureThreadResult {
    threadId: string;
    sessionId: string;
    contactId: string;
    /** Raw, single-use magic link token — give the contact a URL with ?ml=<token>. */
    magicLinkToken: string;
}

/**
 * Generates a cryptographically random token with the given prefix.
 */
function generateToken(prefix: string): string {
    const bytes = randomBytes(32);
    return prefix + bytes.toString('base64url');
}

/**
 * Hashes a raw token with SHA-256 for storage.
 */
function hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Service for managing portal session authentication.
 * Handles session creation, validation, and magic link flows.
 */
export class PortalAuthService {
    private static _instance: PortalAuthService | null = null;

    /**
     * The entity name used to look up contacts. Defaults to the app-agnostic
     * BizAppsCommon People entity, which stores Email as a direct column and is the
     * MemberJunction ecosystem standard. Override for environments that use a different
     * contact entity (e.g., 'Contacts', or 'BC: Contacts' for BCSaaS).
     */
    static contactEntityName = 'MJ_BizApps_Common: People';

    /**
     * The field name on the contact entity that holds the email address.
     */
    static contactEmailField = 'Email';

    static get Instance(): PortalAuthService {
        if (!PortalAuthService._instance) {
            PortalAuthService._instance = new PortalAuthService();
        }
        return PortalAuthService._instance;
    }

    /**
     * Creates a new portal session for a contact on a channel.
     * Returns the raw session token (only returned once — caller must deliver it to the contact).
     */
    async createSession(
        channelId: string,
        contactId: string,
        threadId: string,
        systemUser: UserInfo
    ): Promise<{ sessionId: string; rawToken: string }> {
        const rawToken = generateToken(SESSION_TOKEN_PREFIX);
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + DEFAULT_SESSION_TTL_DAYS);

        const md = new Metadata();
        const entity = await md.GetEntityObject('MJ_BizApps_SecureMessaging: Portal Sessions', systemUser);
        entity.NewRecord();
        entity.Set('ChannelID', channelId);
        entity.Set('ContactID', contactId);
        entity.Set('ThreadID', threadId);
        entity.Set('TokenHash', tokenHash);
        entity.Set('Status', 'Active');
        entity.Set('ExpiresAt', expiresAt.toISOString());
        entity.Set('LastAccessedAt', new Date().toISOString());

        const saved = await entity.Save();
        if (!saved) {
            throw new Error('Failed to create portal session');
        }

        return { sessionId: entity.Get('ID'), rawToken };
    }

    /**
     * Validates a raw session token and returns the session context.
     * Extends the session TTL on each successful validation.
     */
    async validateSessionToken(
        rawToken: string,
        systemUser: UserInfo
    ): Promise<PortalSessionContext | null> {
        if (!rawToken.startsWith(SESSION_TOKEN_PREFIX)) {
            return null;
        }

        const tokenHash = hashToken(rawToken);
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'MJ_BizApps_SecureMessaging: Portal Sessions',
            ExtraFilter: `TokenHash = '${tokenHash}' AND Status = 'Active' AND ExpiresAt > SYSDATETIMEOFFSET()`,
        }, systemUser);

        if (!result.Success || result.Results.length === 0) {
            return null;
        }

        const session = result.Results[0] as Record<string, string>;

        // Extend session TTL
        const md = new Metadata();
        const entity = await md.GetEntityObject('MJ_BizApps_SecureMessaging: Portal Sessions', systemUser);
        await entity.InnerLoad(CompositeKey.FromID(session.ID));
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + DEFAULT_SESSION_TTL_DAYS);
        entity.Set('ExpiresAt', newExpiry.toISOString());
        entity.Set('LastAccessedAt', new Date().toISOString());
        await entity.Save();

        // Look up contact email
        const contactEmail = await this.getContactEmail(session.ContactID, systemUser);

        return {
            sessionId: session.ID,
            channelId: session.ChannelID,
            contactId: session.ContactID,
            contactEmail,
            threadId: session.ThreadID,
        };
    }

    /**
     * Generates a magic link for an existing session.
     */
    async generateMagicLink(
        sessionId: string,
        systemUser: UserInfo
    ): Promise<MagicLinkResult> {
        // Verify session exists
        const rv = new RunView();
        const sessionResult = await rv.RunView({
            EntityName: 'MJ_BizApps_SecureMessaging: Portal Sessions',
            ExtraFilter: `ID = '${sessionId}'`,
        }, systemUser);

        if (!sessionResult.Success || sessionResult.Results.length === 0) {
            return { success: false, errorMessage: 'Session not found' };
        }

        const rawToken = generateToken(MAGIC_LINK_PREFIX);
        const tokenHash = hashToken(rawToken);
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + DEFAULT_MAGIC_LINK_TTL_MINUTES);

        const md = new Metadata();
        const entity = await md.GetEntityObject('MJ_BizApps_SecureMessaging: Portal Magic Links', systemUser);
        entity.NewRecord();
        entity.Set('PortalSessionID', sessionId);
        entity.Set('TokenHash', tokenHash);
        entity.Set('Status', 'Pending');
        entity.Set('ExpiresAt', expiresAt.toISOString());

        const saved = await entity.Save();
        if (!saved) {
            return { success: false, errorMessage: 'Failed to create magic link' };
        }

        return { success: true, rawToken };
    }

    /**
     * Provisions a brand-new secure thread for a contact: finds-or-creates the Person by
     * email, mints a fresh thread + channel id, opens a portal session, and issues a magic
     * link. The caller writes the first message (via the message store) — this keeps the
     * service free of a store dependency. This single operation backs both staff "compose"
     * and Izzy's thread-promotion (§8.3 in the PRD).
     */
    async startSecureThread(
        input: StartSecureThreadInput,
        systemUser: UserInfo
    ): Promise<StartSecureThreadResult> {
        const contactId = await this.findOrCreatePerson(input.contactEmail, input.contactName, systemUser);
        const threadId = randomUUID();
        const channelId = randomUUID(); // logical grouping id (no FK in the standalone app)

        const { sessionId } = await this.createSession(channelId, contactId, threadId, systemUser);

        const link = await this.generateMagicLink(sessionId, systemUser);
        if (!link.success || !link.rawToken) {
            throw new Error(link.errorMessage || 'Failed to issue magic link for the new thread');
        }

        return { threadId, sessionId, contactId, magicLinkToken: link.rawToken };
    }

    /**
     * Returns the ID of the contact Person matching the email (case-insensitive), creating a
     * minimal Person record if none exists. Uses the configured contact entity.
     */
    private async findOrCreatePerson(email: string, name: string | undefined, systemUser: UserInfo): Promise<string> {
        const trimmed = email.trim();
        const rv = new RunView();
        const found = await rv.RunView({
            EntityName: PortalAuthService.contactEntityName,
            ExtraFilter: `${PortalAuthService.contactEmailField} = '${trimmed.replace(/'/g, "''")}'`,
            MaxRows: 1,
        }, systemUser);
        if (found.Success && found.Results.length > 0) {
            return (found.Results[0] as Record<string, string>).ID;
        }

        // Create a minimal Person. Split a provided display name into first/last; fall back to
        // the email local-part so the required name fields are never blank.
        const md = new Metadata();
        const person = await md.GetEntityObject(PortalAuthService.contactEntityName, systemUser);
        person.NewRecord();
        const parts = (name || '').trim().split(/\s+/).filter(Boolean);
        const first = parts[0] || trimmed.split('@')[0];
        const last = parts.slice(1).join(' ') || '(external)';
        person.Set('FirstName', first);
        person.Set('LastName', last);
        person.Set(PortalAuthService.contactEmailField, trimmed);
        person.Set('Status', 'Active');
        if (!(await person.Save())) {
            throw new Error(person.LatestResult?.CompleteMessage || 'Failed to create contact Person');
        }
        return person.Get('ID');
    }

    /**
     * Redeems a magic link token. Returns a fresh session token.
     * The magic link is marked as 'Used' and a new session token is generated.
     */
    async redeemMagicLink(
        rawToken: string,
        systemUser: UserInfo
    ): Promise<MagicLinkRedemptionResult | null> {
        if (!rawToken.startsWith(MAGIC_LINK_PREFIX)) {
            return null;
        }

        const tokenHash = hashToken(rawToken);
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'MJ_BizApps_SecureMessaging: Portal Magic Links',
            ExtraFilter: `TokenHash = '${tokenHash}' AND Status = 'Pending' AND ExpiresAt > SYSDATETIMEOFFSET()`,
        }, systemUser);

        if (!result.Success || result.Results.length === 0) {
            return null;
        }

        const magicLink = result.Results[0] as Record<string, string>;

        // Mark magic link as used
        const md = new Metadata();
        const mlEntity = await md.GetEntityObject('MJ_BizApps_SecureMessaging: Portal Magic Links', systemUser);
        await mlEntity.InnerLoad(CompositeKey.FromID(magicLink.ID));
        mlEntity.Set('Status', 'Used');
        mlEntity.Set('UsedAt', new Date().toISOString());
        await mlEntity.Save();

        // Generate a fresh session token for the parent session
        const newRawToken = generateToken(SESSION_TOKEN_PREFIX);
        const newTokenHash = hashToken(newRawToken);

        const sessionEntity = await md.GetEntityObject('MJ_BizApps_SecureMessaging: Portal Sessions', systemUser);
        await sessionEntity.InnerLoad(CompositeKey.FromID(magicLink.PortalSessionID));
        sessionEntity.Set('TokenHash', newTokenHash);
        sessionEntity.Set('Status', 'Active');
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + DEFAULT_SESSION_TTL_DAYS);
        sessionEntity.Set('ExpiresAt', newExpiry.toISOString());
        sessionEntity.Set('LastAccessedAt', new Date().toISOString());
        await sessionEntity.Save();

        const contactEmail = await this.getContactEmail(
            sessionEntity.Get('ContactID'),
            systemUser
        );

        return {
            sessionContext: {
                sessionId: magicLink.PortalSessionID,
                channelId: sessionEntity.Get('ChannelID'),
                contactId: sessionEntity.Get('ContactID'),
                contactEmail,
                threadId: sessionEntity.Get('ThreadID'),
            },
            newSessionToken: newRawToken,
        };
    }

    /** Resolve a contact's email from the configured People entity. Public — reused by stores. */
    public async getContactEmail(contactId: string, systemUser: UserInfo): Promise<string> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: PortalAuthService.contactEntityName,
            ExtraFilter: `ID = '${contactId}'`,
        }, systemUser);

        if (result.Success && result.Results.length > 0) {
            const contact = result.Results[0] as Record<string, string>;
            return contact[PortalAuthService.contactEmailField] || '';
        }
        return '';
    }
}
