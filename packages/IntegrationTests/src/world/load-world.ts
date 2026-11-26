/**
 * Commit SM-WORLD through strongly-typed BaseEntity subclasses so Explorer has a living
 * multi-organization secure inbox with versioned MJ Doc artifacts and binary fallback files.
 *
 * Strict FK dependency order:
 *   1. Organizations -> 2. People -> 3. Secure Threads -> 4. Portal Sessions
 *   -> 5. Secure Messages -> 6. Artifact Type lookup -> 7. MJ: Artifacts
 *   -> 8. MJ: Artifact Versions -> 9. Message Files (ArtifactID + binary fallback)
 *   -> 10. File Requests & Portal Magic Links
 *
 * Zero `any`, zero `unknown`, zero `BaseEntity.Get()/Set()`.
 */
import { createHash } from 'node:crypto';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration/registry';
import { Assert } from '@memberjunction/testing-integration/registry';
import type {
    MJArtifactEntity,
    MJArtifactVersionEntity,
} from '@memberjunction/core-entities';
import type {
    mjBizAppsCommonOrganizationEntity,
    mjBizAppsCommonPersonEntity,
} from '@mj-biz-apps/common-entities';
import {
    SecureMessagingEngineBase,
    type mjBizAppsSecureMessagingFileRequestEntity,
    type mjBizAppsSecureMessagingMessageFileEntity,
    type mjBizAppsSecureMessagingPortalMagicLinkEntity,
    type mjBizAppsSecureMessagingPortalSessionEntity,
    type mjBizAppsSecureMessagingSecureMessageEntity,
    type mjBizAppsSecureMessagingSecureThreadEntity,
} from '@mj-biz-apps/secure-messaging-entities';
import {
    E_ARTIFACT,
    E_ARTIFACT_TYPE,
    E_ARTIFACT_VERSION,
    E_FILE_REQUEST,
    E_MAGIC,
    E_MESSAGE,
    E_MESSAGE_FILE,
    E_ORGANIZATION,
    E_PERSON,
    E_SESSION,
    E_THREAD,
} from '../entity-names.js';
import { FindId, FindRows, Quote, UpsertEntity } from '../entity-io.js';
import {
    WORLD_ARTIFACTS,
    WORLD_ARTIFACT_VERSIONS,
    WORLD_FILE_REQUESTS,
    WORLD_MAGIC_LINKS,
    WORLD_MESSAGES,
    WORLD_MESSAGE_FILES,
    WORLD_ORGANIZATIONS,
    WORLD_PEOPLE,
    WORLD_THREADS,
    type WorldOrgKey,
    type WorldPersonSeed,
} from './seed-fixtures.js';
import { SetWorld, type WorldIds, type WorldPerson } from './world.js';

interface ArtifactTypeLookupRow {
    ID: string;
    Name: string | null;
    ContentType: string | null;
    Priority: number;
}

export async function LoadWorld(ctx: IntegrationCheckContext): Promise<WorldIds> {
    const staff = StaffOf(ctx);

    // 1. Organizations (4 distinct tenants)
    const organizations: Record<WorldOrgKey, string> = {
        blueCypress: '',
        northstar: '',
        meridian: '',
        summit: '',
    };
    for (const org of WORLD_ORGANIZATIONS) {
        organizations[org.key] = await UpsertEntity<mjBizAppsCommonOrganizationEntity>(
            ctx,
            E_ORGANIZATION,
            `Name = '${Quote(org.name)}'`,
            (entity) => {
                entity.Name = org.name;
                entity.LegalName = org.legalName;
                entity.Website = `https://${org.domain}`;
                entity.Description = `${org.industry} tenant fixture for SM-WORLD`;
                entity.Status = org.status;
            },
        );
    }

    // 2. People (12 realistic personas across the 4 organizations)
    const people: Record<string, WorldPerson> = {};
    for (const p of WORLD_PEOPLE) {
        people[p.key] = await upsertPerson(ctx, p, organizations[p.orgKey]);
    }

    // 3. Secure Threads (12 multi-period threads across Active / Closed / Archived)
    const threads: Record<string, string> = {};
    for (const t of WORLD_THREADS) {
        const contact = people[t.contactKey];
        threads[t.key] = await UpsertEntity<mjBizAppsSecureMessagingSecureThreadEntity>(
            ctx,
            E_THREAD,
            `Subject = '${Quote(t.subject)}'`,
            (entity) => {
                entity.ContactID = contact.ID;
                entity.Subject = t.subject;
                entity.Status = t.status;
                entity.SourceChannel = t.sourceChannel;
                entity.CreatedByUserID = staff.id;
                entity.LastMessageAt = HoursAgo(t.lastMessageOffsetHours);
                entity.IsDeleted = false;
            },
        );
    }

    // 4. Portal Sessions (12 sessions across Active / Expired / Revoked)
    const sessions: Record<string, string> = {};
    for (const p of WORLD_PEOPLE) {
        const contactID = people[p.key].ID;
        sessions[p.key] = await UpsertEntity<mjBizAppsSecureMessagingPortalSessionEntity>(
            ctx,
            E_SESSION,
            `ContactID = '${Quote(contactID)}'`,
            (entity) => {
                entity.ContactID = contactID;
                entity.TokenHash = HashToken(p.token);
                entity.Status = p.sessionStatus;
                entity.ExpiresAt = DaysFromNow(p.sessionExpiresOffsetDays);
                entity.LastAccessedAt = new Date();
            },
        );
    }

    // 5. Secure Messages (18 multi-period messages)
    const messages: Record<string, string> = {};
    for (const m of WORLD_MESSAGES) {
        const threadID = threads[m.threadKey];
        const sessionID = sessions[m.contactKey];
        const person = people[m.contactKey];
        const inbound = m.direction === 'Inbound';
        const markerFilter = `ThreadID = '${Quote(threadID)}' AND Content LIKE '%<!--sm-world:${Quote(m.key)}-->%'`;
        const existingId = await FindId(ctx, E_MESSAGE, markerFilter);
        const keyFilter = existingId ? `ID = '${Quote(existingId)}'` : markerFilter;

        messages[m.key] = await UpsertEntity<mjBizAppsSecureMessagingSecureMessageEntity>(
            ctx,
            E_MESSAGE,
            keyFilter,
            (entity) => {
                entity.PortalSessionID = sessionID;
                entity.ThreadID = threadID;
                entity.PersonID = person.ID;
                entity.Direction = m.direction;
                entity.Sender = inbound ? person.Email : staff.email;
                entity.Recipient = inbound ? staff.email : person.Email;
                entity.Subject = null;
                entity.Content = WorldContent(m.key, m.body);
                entity.IsSecure = true;
                entity.Status = m.status;
                entity.ReceivedAt = HoursAgo(m.receivedOffsetHours);
                entity.IsStarred = m.starred;
                entity.IsImported = m.imported;
                entity.SourceChannel = m.sourceChannel;
            },
        );
    }

    // 6. Resolve enabled MJ: Artifact Types (lookup-only, never invented)
    const artifactTypes = await loadEnabledArtifactTypes(ctx);

    // 7. Parent MJ: Artifacts (seeded strictly before MJ: Artifact Versions and Message Files)
    const artifacts: Record<string, string> = {};
    for (const a of WORLD_ARTIFACTS) {
        const typeId = resolveArtifactTypeId(artifactTypes, a.mimeType);
        artifacts[a.key] = await UpsertEntity<MJArtifactEntity>(
            ctx,
            E_ARTIFACT,
            `Name = '${Quote(a.name)}'`,
            (entity) => {
                entity.Name = a.name;
                entity.Description = a.description;
                entity.TypeID = typeId;
                entity.UserID = staff.id;
            },
        );
    }

    // 8. Child MJ: Artifact Versions (v1 -> v2 progressions per parent artifact)
    const artifactVersions: Record<string, string> = {};
    for (const v of WORLD_ARTIFACT_VERSIONS) {
        const artifactID = artifacts[v.artifactKey];
        artifactVersions[v.key] = await UpsertEntity<MJArtifactVersionEntity>(
            ctx,
            E_ARTIFACT_VERSION,
            `ArtifactID = '${Quote(artifactID)}' AND VersionNumber = ${v.versionNumber}`,
            (entity) => {
                entity.ArtifactID = artifactID;
                entity.VersionNumber = v.versionNumber;
                entity.Name = v.name;
                entity.Description = v.description;
                entity.ContentMode = 'Text';
                entity.MimeType = v.mimeType;
                entity.Content = v.content;
                entity.ContentSizeBytes = Buffer.byteLength(v.content, 'utf8');
                entity.ContentHash = HashToken(v.content);
                entity.UserID = staff.id;
            },
        );
    }

    // 9. Message Files (6 Artifact-linked + 4 non-artifact binary fallback rows)
    const messageFiles: Record<string, string> = {};
    for (const mf of WORLD_MESSAGE_FILES) {
        const artifactID = mf.artifactKey ? artifacts[mf.artifactKey] : null;
        messageFiles[mf.key] = await UpsertEntity<mjBizAppsSecureMessagingMessageFileEntity>(
            ctx,
            E_MESSAGE_FILE,
            `Filename = '${Quote(mf.filename)}'`,
            (entity) => {
                entity.SecureMessageID = messages[mf.messageKey];
                entity.ThreadID = threads[mf.threadKey];
                entity.ArtifactID = artifactID;
                entity.Filename = mf.filename;
                entity.ContentType = mf.contentType;
                entity.Size = mf.size;
            },
        );
    }

    // 10. File Requests & Portal Magic Links
    const fileRequests: Record<string, string> = {};
    for (const fr of WORLD_FILE_REQUESTS) {
        fileRequests[fr.key] = await UpsertEntity<mjBizAppsSecureMessagingFileRequestEntity>(
            ctx,
            E_FILE_REQUEST,
            `Title = '${Quote(fr.title)}'`,
            (entity) => {
                entity.PortalSessionID = sessions[fr.contactKey];
                entity.ThreadID = threads[fr.threadKey];
                entity.Title = fr.title;
                entity.Instructions = fr.instructions;
                entity.Status = fr.status;
                entity.RequestedByUserID = staff.id;
                entity.DueAt = DaysFromNow(fr.dueOffsetDays);
                entity.FulfilledAt = fr.fulfilledOffsetHours !== null ? HoursAgo(fr.fulfilledOffsetHours) : null;
            },
        );
    }

    const magicLinks: Record<string, string> = {};
    for (const ml of WORLD_MAGIC_LINKS) {
        const tokenHash = HashToken(ml.rawToken);
        magicLinks[ml.key] = await UpsertEntity<mjBizAppsSecureMessagingPortalMagicLinkEntity>(
            ctx,
            E_MAGIC,
            `TokenHash = '${Quote(tokenHash)}'`,
            (entity) => {
                entity.PortalSessionID = sessions[ml.contactKey];
                entity.TokenHash = tokenHash;
                entity.Status = ml.status;
                entity.ExpiresAt = new Date(Date.now() + ml.expiresOffsetMinutes * 60_000);
                entity.UsedAt = ml.usedOffsetHours !== null ? HoursAgo(ml.usedOffsetHours) : null;
                entity.DeepLinkThreadID = threads[ml.threadKey];
            },
        );
    }

    const world: WorldIds = {
        OrganizationID: organizations.blueCypress,
        Organizations: organizations,
        People: people,
        Threads: threads,
        Sessions: sessions,
        Messages: messages,
        Artifacts: artifacts,
        ArtifactVersions: artifactVersions,
        MessageFiles: messageFiles,
        FileRequests: fileRequests,
        MagicLinks: magicLinks,
    };
    SetWorld(world);
    return world;
}

export function HashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
}

function HoursAgo(hours: number): Date {
    return new Date(Date.now() - hours * 3_600_000);
}

function DaysFromNow(days: number): Date {
    return new Date(Date.now() + days * 86_400_000);
}

function StaffOf(ctx: IntegrationCheckContext): { id: string; email: string; name: string } {
    const id = ctx.User?.ID;
    Assert(!!id, 'integration user missing — cannot stamp CreatedByUserID');
    return {
        id,
        email: ctx.User?.Email || 'staff@bluecypress.example',
        name: ctx.User?.Name || 'Blue Cypress Press',
    };
}

function WorldContent(key: string, body: string): string {
    return `<!--sm-world:${key}-->\n${body}`;
}

async function upsertPerson(
    ctx: IntegrationCheckContext,
    p: WorldPersonSeed,
    organizationID: string,
): Promise<WorldPerson> {
    const id = await UpsertEntity<mjBizAppsCommonPersonEntity>(
        ctx,
        E_PERSON,
        `Email = '${Quote(p.email)}'`,
        (entity) => {
            entity.FirstName = p.first;
            entity.LastName = p.last;
            entity.Email = p.email;
            entity.Title = p.title;
            entity.Status = p.personStatus;
            entity.PhotoURL = `https://api.dicebear.com/9.x/lorelei/png?seed=${encodeURIComponent(p.email)}&size=256`;
        },
    );
    return {
        ID: id,
        OrgKey: p.orgKey,
        OrganizationID: organizationID,
        Role: p.role,
        Email: p.email,
        FirstName: p.first,
        LastName: p.last,
    };
}

async function loadEnabledArtifactTypes(ctx: IntegrationCheckContext): Promise<readonly ArtifactTypeLookupRow[]> {
    await SecureMessagingEngineBase.Instance.Config(false, ctx.User, ctx.Provider);
    if (SecureMessagingEngineBase.Instance.ArtifactTypes.length > 0) {
        return SecureMessagingEngineBase.Instance.ArtifactTypes.map((t) => ({
            ID: t.ID,
            Name: t.Name ?? null,
            ContentType: t.ContentType ?? null,
            Priority: t.Priority,
        }));
    }
    const rows = await FindRows<ArtifactTypeLookupRow>(
        ctx,
        E_ARTIFACT_TYPE,
        'IsEnabled = 1',
        ['ID', 'Name', 'ContentType', 'Priority'],
        50,
        'Priority DESC',
    );
    Assert(rows.length > 0, 'No enabled MJ: Artifact Types found in database — cannot seed MJ: Artifacts');
    return rows;
}

function resolveArtifactTypeId(types: readonly ArtifactTypeLookupRow[], mimeType: string): string {
    const normalized = mimeType.toLowerCase().trim();
    const exact = types.find((t) => (t.ContentType ?? '').toLowerCase() === normalized);
    if (exact) {
        return exact.ID;
    }
    const wildcard = types.find((t) => {
        const pattern = (t.ContentType ?? '').toLowerCase();
        return pattern.endsWith('/*') && normalized.startsWith(pattern.slice(0, -1));
    });
    if (wildcard) {
        return wildcard.ID;
    }
    const docFallback = types.find((t) => (t.Name ?? '').toLowerCase() === 'document');
    return docFallback?.ID ?? types[0].ID;
}
