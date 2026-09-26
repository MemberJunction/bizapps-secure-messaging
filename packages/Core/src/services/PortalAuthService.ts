import { createHash, randomBytes } from 'node:crypto';
import { CompositeKey, Metadata, RunView, UserInfo } from '@memberjunction/core';
import { BaseSingleton } from '@memberjunction/global';
import {
    mjBizAppsSecureMessagingPortalSessionEntity,
    mjBizAppsSecureMessagingPortalMagicLinkEntity,
    mjBizAppsSecureMessagingSecureThreadEntity,
} from '@mj-biz-apps/secure-messaging-entities';

/** Prefix for session tokens */
const SESSION_TOKEN_PREFIX = 'sm_';
/** Prefix for magic link tokens */
const MAGIC_LINK_PREFIX = 'sm_ml_';
/** Default session TTL in days */
const DEFAULT_SESSION_TTL_DAYS = 7;
/**
 * Absolute maximum session age in days, measured from the session's creation. The sliding TTL
 * extends `ExpiresAt` on every request, so without this cap a session never expires as long as
 * it keeps being used; extensions are capped at creation + this many days.
 */
const MAX_SESSION_AGE_DAYS = 30;
/** Default magic link TTL in minutes */
const DEFAULT_MAGIC_LINK_TTL_MINUTES = 15;
/** Fallback subject when a thread is created without one. */
const DEFAULT_THREAD_SUBJECT = 'Secure conversation';

/**
 * The authenticated portal context for a contact. In v2 a session authenticates the CONTACT
 * (not a single thread) — one session grants access to all of that contact's threads — so the
 * thread is no longer part of the session. `threadId` is the OPTIONAL deep-link target carried by
 * a magic link (its `DeepLinkThreadID`); it is undefined for a bare session-token validation, in
 * which case the widget resolves the current thread from the contact's inbox.
 */
export interface PortalSessionContext {
    sessionId: string;
    contactId: string;
    contactEmail: string;
    threadId?: string;
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
 * Input for provisioning a brand-new secure thread for a contact (thread + session + magic link).
 * Writing the first message is the caller's job (avoids a Core service↔store cycle).
 */
export interface StartSecureThreadInput {
    /** The external contact's email. A matching Person is found, else created. */
    contactEmail: string;
    /** Optional display name, used only when creating a new Person. */
    contactName?: string;
    /** The thread subject (TitanFile-style subject line). Falls back to a generic subject. */
    subject?: string;
    /** Originating insecure channel for promoted threads (e.g. 'Email', 'SMS'); omit for native. */
    sourceChannel?: string;
    /** Soft reference to the staff MJ user creating the thread; omit for promoted/system threads. */
    createdByUserId?: string;
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
 * One historical message being imported into a secure thread during promotion (PRD §9).
 * These are COPIES of prior insecure-channel messages, preserved so the contact sees the full
 * history once authenticated. They are flagged imported + tagged with their source channel.
 */
export interface PromotedMessageInput {
    /** Inbound = from the contact; Outbound = from staff/Izzy. Preserved from the source thread. */
    direction: 'Inbound' | 'Outbound';
    /** The original sender (email/phone/display) on the insecure channel. */
    sender: string;
    /** The original recipient, when known. */
    recipient?: string;
    content: string;
    subject?: string;
    /** Original timestamp on the insecure channel; preserved so the imported history is ordered correctly. */
    receivedAt?: string;
}

/**
 * Input for promoting an existing insecure (Email/SMS) thread into a secure thread (PRD §9).
 * Provisions a contact + secure thread + session + magic link, then the caller bulk-imports the
 * prior messages. Backs both the Izzy action-diff "switch to secure channel" flow and the
 * Outlook "Secure Send" add-in.
 */
export interface PromoteThreadInput extends StartSecureThreadInput {
    /** The insecure channel the thread is being promoted from (e.g. 'Email', 'SMS'). */
    sourceChannel: string;
    /** The prior messages to copy into the secure thread, oldest-first. */
    messages: PromotedMessageInput[];
}

/** Result of promoting a thread: the provisioned secure thread + how many messages were imported. */
export interface PromoteThreadResult extends StartSecureThreadResult {
    importedCount: number;
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
 * Handles per-contact session creation, validation, thread provisioning, and magic link flows.
 *
 * Extends {@link BaseSingleton} so there is exactly one instance per process even when
 * bundlers duplicate this module across execution paths (per MJ singleton policy).
 */
export class PortalAuthService extends BaseSingleton<PortalAuthService> {
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

    // BaseSingleton requires a protected constructor.
    protected constructor() {
        super();
    }

    static get Instance(): PortalAuthService {
        return super.getInstance<PortalAuthService>('PortalAuthService');
    }

    /** The absolute expiry instant for a session: its creation + {@link MAX_SESSION_AGE_DAYS}. */
    private sessionAbsoluteCap(session: mjBizAppsSecureMessagingPortalSessionEntity): Date {
        const cap = new Date(session.__mj_CreatedAt);
        cap.setDate(cap.getDate() + MAX_SESSION_AGE_DAYS);
        return cap;
    }

    /**
     * Ensures the contact has exactly one Active portal session and returns it. Sessions are
     * per-contact in v2 (one session spans all of the contact's threads), so an existing Active
     * session is reused; only when none exists is a fresh one minted. The raw session token is
     * returned ONLY when a new session is created — an existing session's token was issued once and
     * cannot be recovered, so callers re-authenticate into it via a magic link.
     */
    async ensureSessionForContact(
        contactId: string,
        systemUser: UserInfo
    ): Promise<{ sessionId: string; rawToken?: string }> {
        const rv = new RunView();
        const existing = await rv.RunView<mjBizAppsSecureMessagingPortalSessionEntity>({
            EntityName: 'MJ_BizApps_SecureMessaging: Portal Sessions',
            ExtraFilter: `ContactID = '${contactId.replace(/'/g, "''")}' AND Status = 'Active'`,
            OrderBy: 'LastAccessedAt DESC',
            MaxRows: 1,
            ResultType: 'entity_object',
        }, systemUser);
        if (existing.Success && existing.Results.length > 0) {
            const current = existing.Results[0];
            // A session past its absolute age cap (creation + MAX_SESSION_AGE_DAYS) is not
            // reusable — retire it and fall through to mint a fresh one, so new magic links
            // never attach to a session that validateSessionToken would reject.
            if (new Date() > this.sessionAbsoluteCap(current)) {
                current.Status = 'Expired';
                await current.Save();
            } else {
                return { sessionId: current.ID };
            }
        }

        const rawToken = generateToken(SESSION_TOKEN_PREFIX);
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + DEFAULT_SESSION_TTL_DAYS);

        const md = new Metadata();
        const session = await md.GetEntityObject<mjBizAppsSecureMessagingPortalSessionEntity>(
            'MJ_BizApps_SecureMessaging: Portal Sessions', systemUser);
        session.NewRecord();
        session.ContactID = contactId;
        session.TokenHash = hashToken(rawToken);
        session.Status = 'Active';
        session.ExpiresAt = expiresAt;
        session.LastAccessedAt = new Date();

        if (!(await session.Save())) {
            throw new Error(session.LatestResult?.CompleteMessage || 'Failed to create portal session');
        }
        return { sessionId: session.ID, rawToken };
    }

    /**
     * Creates a new SecureThread for a contact and returns its ID. The thread is the first-class
     * unit of conversation in v2 — messages, files, requests and signatures all FK to it.
     */
    async createThread(
        contactId: string,
        subject: string | undefined,
        systemUser: UserInfo,
        options?: { sourceChannel?: string; createdByUserId?: string }
    ): Promise<string> {
        const md = new Metadata();
        const thread = await md.GetEntityObject<mjBizAppsSecureMessagingSecureThreadEntity>(
            'MJ_BizApps_SecureMessaging: Secure Threads', systemUser);
        thread.NewRecord();
        thread.ContactID = contactId;
        thread.Subject = (subject && subject.trim()) || DEFAULT_THREAD_SUBJECT;
        thread.Status = 'Active';
        thread.SourceChannel = options?.sourceChannel ?? null;
        thread.CreatedByUserID = options?.createdByUserId ?? null;
        thread.LastMessageAt = null;
        thread.IsDeleted = false;

        if (!(await thread.Save())) {
            throw new Error(thread.LatestResult?.CompleteMessage || 'Failed to create secure thread');
        }
        return thread.ID;
    }

    /**
     * Validates a raw session token and returns the session context (identity only — no thread).
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
        const result = await rv.RunView<mjBizAppsSecureMessagingPortalSessionEntity>({
            EntityName: 'MJ_BizApps_SecureMessaging: Portal Sessions',
            ExtraFilter: `TokenHash = '${tokenHash}' AND Status = 'Active' AND ExpiresAt > SYSDATETIMEOFFSET()`,
            ResultType: 'entity_object',
        }, systemUser);

        if (!result.Success || result.Results.length === 0) {
            return null;
        }

        const session = result.Results[0];

        // Enforce the absolute session age cap: the sliding TTL below never extends a session
        // past creation + MAX_SESSION_AGE_DAYS, and a request arriving past that point is
        // treated as an expired session (the contact re-authenticates via a magic link).
        const absoluteCap = this.sessionAbsoluteCap(session);
        if (new Date() > absoluteCap) {
            return null;
        }

        // Extend the session TTL on the loaded entity, capped at the absolute max age.
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + DEFAULT_SESSION_TTL_DAYS);
        session.ExpiresAt = newExpiry > absoluteCap ? absoluteCap : newExpiry;
        session.LastAccessedAt = new Date();
        await session.Save();

        const contactEmail = await this.getContactEmail(session.ContactID, systemUser);

        return {
            sessionId: session.ID,
            contactId: session.ContactID,
            contactEmail,
        };
    }

    /**
     * Generates a magic link for an existing session, optionally deep-linking to a specific thread.
     */
    async generateMagicLink(
        sessionId: string,
        systemUser: UserInfo,
        deepLinkThreadId?: string
    ): Promise<MagicLinkResult> {
        // Verify the session exists.
        const rv = new RunView();
        const sessionResult = await rv.RunView<mjBizAppsSecureMessagingPortalSessionEntity>({
            EntityName: 'MJ_BizApps_SecureMessaging: Portal Sessions',
            ExtraFilter: `ID = '${sessionId.replace(/'/g, "''")}'`,
            ResultType: 'entity_object',
        }, systemUser);

        if (!sessionResult.Success || sessionResult.Results.length === 0) {
            return { success: false, errorMessage: 'Session not found' };
        }

        // SECURITY: 'Revoked' is the operator's kill switch for a compromised contact mailbox.
        // Never mint a working link against a revoked session — redemption would flip it back
        // to Active and silently undo the revocation.
        if (sessionResult.Results[0].Status === 'Revoked') {
            return { success: false, errorMessage: 'Session has been revoked' };
        }

        const rawToken = generateToken(MAGIC_LINK_PREFIX);
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + DEFAULT_MAGIC_LINK_TTL_MINUTES);

        const md = new Metadata();
        const link = await md.GetEntityObject<mjBizAppsSecureMessagingPortalMagicLinkEntity>(
            'MJ_BizApps_SecureMessaging: Portal Magic Links', systemUser);
        link.NewRecord();
        link.PortalSessionID = sessionId;
        link.TokenHash = hashToken(rawToken);
        link.Status = 'Pending';
        link.ExpiresAt = expiresAt;
        link.DeepLinkThreadID = deepLinkThreadId ?? null;

        if (!(await link.Save())) {
            return { success: false, errorMessage: link.LatestResult?.CompleteMessage || 'Failed to create magic link' };
        }

        return { success: true, rawToken };
    }

    /**
     * Provisions a brand-new secure thread for a contact: finds-or-creates the Person by email,
     * creates the SecureThread, ensures the contact's portal session, and issues a magic link that
     * deep-links to the new thread. The caller writes the first message (via the message store) —
     * this keeps the service free of a store dependency. Backs both staff "compose" and Izzy's
     * thread-promotion (PRD §9).
     */
    async startSecureThread(
        input: StartSecureThreadInput,
        systemUser: UserInfo
    ): Promise<StartSecureThreadResult> {
        const contactId = await this.findOrCreatePerson(input.contactEmail, input.contactName, systemUser);
        const threadId = await this.createThread(contactId, input.subject, systemUser, {
            sourceChannel: input.sourceChannel,
            createdByUserId: input.createdByUserId,
        });

        const { sessionId } = await this.ensureSessionForContact(contactId, systemUser);

        const link = await this.generateMagicLink(sessionId, systemUser, threadId);
        if (!link.success || !link.rawToken) {
            throw new Error(link.errorMessage || 'Failed to issue magic link for the new thread');
        }

        return { threadId, sessionId, contactId, magicLinkToken: link.rawToken };
    }

    /**
     * Provisions a secure thread for a contact the same way {@link startSecureThread} does, as the
     * destination for an existing insecure (Email/SMS) thread being promoted (PRD §9). The actual
     * copying of `input.messages` into the thread is the caller's job (via the message store's bulk
     * import) — this service stays free of a store dependency. `importedCount` echoes how many
     * messages the caller is expected to import, for convenience.
     */
    async promoteThread(
        input: PromoteThreadInput,
        systemUser: UserInfo
    ): Promise<PromoteThreadResult> {
        const provisioned = await this.startSecureThread(
            {
                contactEmail: input.contactEmail,
                contactName: input.contactName,
                subject: input.subject,
                sourceChannel: input.sourceChannel,
                createdByUserId: input.createdByUserId,
            },
            systemUser
        );
        return { ...provisioned, importedCount: input.messages.length };
    }

    /**
     * Returns the ID of the contact Person matching the email (case-insensitive), creating a
     * minimal Person record if none exists. Uses the configured contact entity, whose name is
     * configurable — so this method uses the dynamic Get/Set accessors rather than a fixed type.
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
     * Redeems a magic link token. Marks the link 'Used', re-issues a fresh session token for the
     * parent (per-contact) session, and returns the context deep-linked to the link's target thread.
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
        const result = await rv.RunView<mjBizAppsSecureMessagingPortalMagicLinkEntity>({
            EntityName: 'MJ_BizApps_SecureMessaging: Portal Magic Links',
            ExtraFilter: `TokenHash = '${tokenHash}' AND Status = 'Pending' AND ExpiresAt > SYSDATETIMEOFFSET()`,
            ResultType: 'entity_object',
        }, systemUser);

        if (!result.Success || result.Results.length === 0) {
            return null;
        }

        const magicLink = result.Results[0];
        const deepLinkThreadId = magicLink.DeepLinkThreadID ?? undefined;

        // Mark the magic link as used.
        magicLink.Status = 'Used';
        magicLink.UsedAt = new Date();
        await magicLink.Save();

        // Re-issue a fresh session token for the parent (per-contact) session.
        const md = new Metadata();
        const session = await md.GetEntityObject<mjBizAppsSecureMessagingPortalSessionEntity>(
            'MJ_BizApps_SecureMessaging: Portal Sessions', systemUser);
        await session.InnerLoad(CompositeKey.FromID(magicLink.PortalSessionID));

        // SECURITY: a revoked session is the operator's kill switch — an unexpired magic link
        // from before the revocation must NOT resurrect it. Without this check the unconditional
        // Status = 'Active' below silently undoes revocation for anyone holding the last email.
        if (session.Status === 'Revoked') {
            return null;
        }

        // Never resurrect a session past its absolute age cap — the token we'd issue would be
        // rejected by validateSessionToken anyway. The contact requests a fresh link, which
        // attaches to a new session (ensureSessionForContact retires aged-out sessions).
        if (new Date() > this.sessionAbsoluteCap(session)) {
            session.Status = 'Expired';
            await session.Save();
            return null;
        }

        const newRawToken = generateToken(SESSION_TOKEN_PREFIX);
        session.TokenHash = hashToken(newRawToken);
        session.Status = 'Active';
        const newExpiry = new Date();
        newExpiry.setDate(newExpiry.getDate() + DEFAULT_SESSION_TTL_DAYS);
        const absoluteCap = this.sessionAbsoluteCap(session);
        session.ExpiresAt = newExpiry > absoluteCap ? absoluteCap : newExpiry;
        session.LastAccessedAt = new Date();
        await session.Save();

        const contactEmail = await this.getContactEmail(session.ContactID, systemUser);

        return {
            sessionContext: {
                sessionId: magicLink.PortalSessionID,
                contactId: session.ContactID,
                contactEmail,
                threadId: deepLinkThreadId,
            },
            newSessionToken: newRawToken,
        };
    }

    /**
     * Authorization check for the v2 per-contact session model: returns the thread's lifecycle
     * Status iff the thread exists, is not soft-deleted, and belongs to the given contact — else
     * null (no access). Exposing the status lets write-path callers enforce read-only on Closed /
     * Archived threads (PRD §7) without a second query. Replaces the v1 "session.threadId ===
     * threadId" gate now that one session grants access to ALL of the contact's threads.
     */
    async contactThreadStatus(
        contactId: string,
        threadId: string,
        systemUser: UserInfo
    ): Promise<'Active' | 'Closed' | 'Archived' | null> {
        if (!contactId || !threadId) {
            return null;
        }
        const rv = new RunView();
        const res = await rv.RunView<{ ID: string; Status: 'Active' | 'Closed' | 'Archived' }>({
            EntityName: 'MJ_BizApps_SecureMessaging: Secure Threads',
            ExtraFilter: `ID = '${threadId.replace(/'/g, "''")}' AND ContactID = '${contactId.replace(/'/g, "''")}' AND IsDeleted = 0`,
            Fields: ['ID', 'Status'],
            MaxRows: 1,
            ResultType: 'simple',
        }, systemUser);
        if (!res.Success || res.Results.length === 0) {
            return null;
        }
        return res.Results[0].Status;
    }

    /** Convenience wrapper over {@link contactThreadStatus}: does the contact own the thread at all? */
    async contactOwnsThread(contactId: string, threadId: string, systemUser: UserInfo): Promise<boolean> {
        return (await this.contactThreadStatus(contactId, threadId, systemUser)) !== null;
    }

    /** Resolve a contact's email from the configured People entity. Public — reused by stores. */
    public async getContactEmail(contactId: string, systemUser: UserInfo): Promise<string> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: PortalAuthService.contactEntityName,
            ExtraFilter: `ID = '${contactId.replace(/'/g, "''")}'`,
        }, systemUser);

        if (result.Success && result.Results.length > 0) {
            const contact = result.Results[0] as Record<string, string>;
            return contact[PortalAuthService.contactEmailField] || '';
        }
        return '';
    }
}
