/**
 * Deterministic multi-entity SM-WORLD domain seed fixture catalog.
 *
 * Spans 4 distinct organizations/tenants, 12 people with explicit roles & permissions,
 * 12 multi-period secure threads across Active/Closed/Archived lifecycles, 12 portal sessions,
 * 18 secure messages, 6 versioned MJ Doc artifacts, 10 artifact versions, 10 message files
 * (6 artifact-backed via MessageFile.ArtifactID + 4 non-artifact binary files), 4 file requests,
 * and 2 magic links (90 total multi-entity domain records).
 *
 * Strictly typed with zero `any` and zero `unknown`.
 */
import type {
    mjBizAppsCommonOrganizationEntity,
    mjBizAppsCommonPersonEntity,
} from '@mj-biz-apps/common-entities';
import type {
    mjBizAppsSecureMessagingFileRequestEntity,
    mjBizAppsSecureMessagingPortalMagicLinkEntity,
    mjBizAppsSecureMessagingPortalSessionEntity,
    mjBizAppsSecureMessagingSecureMessageEntity,
    mjBizAppsSecureMessagingSecureThreadEntity,
} from '@mj-biz-apps/secure-messaging-entities';
import { WORLD_EMAIL_DOMAIN, WORLD_MARK, WORLD_TOKENS } from '../entity-names.js';

export type WorldOrgKey = 'blueCypress' | 'northstar' | 'meridian' | 'summit';

export type WorldRole = 'Admin' | 'CaseReviewer' | 'ExternalContact' | 'PortalRecipient';

export type WorldPeriod = '2026-Q4' | '2026-Q3' | '2026-Q2' | '2026-Q1';

export interface WorldOrgSeed {
    readonly key: WorldOrgKey;
    readonly name: string;
    readonly legalName: string;
    readonly domain: string;
    readonly industry: string;
    readonly status: mjBizAppsCommonOrganizationEntity['Status'];
}

export interface WorldPersonSeed {
    readonly key: string;
    readonly orgKey: WorldOrgKey;
    readonly first: string;
    readonly last: string;
    readonly title: string;
    readonly role: WorldRole;
    readonly email: string;
    readonly token: string;
    readonly sessionStatus: mjBizAppsSecureMessagingPortalSessionEntity['Status'];
    readonly sessionExpiresOffsetDays: number;
    readonly personStatus: mjBizAppsCommonPersonEntity['Status'];
    readonly canReadOrgArtifacts: boolean;
    readonly canUploadFiles: boolean;
}

export interface WorldThreadSeed {
    readonly key: string;
    readonly orgKey: WorldOrgKey;
    readonly contactKey: string;
    readonly subject: string;
    readonly status: mjBizAppsSecureMessagingSecureThreadEntity['Status'];
    readonly sourceChannel: string | null;
    readonly period: WorldPeriod;
    readonly lastMessageOffsetHours: number;
}

export interface WorldMessageSeed {
    readonly key: string;
    readonly threadKey: string;
    readonly contactKey: string;
    readonly direction: mjBizAppsSecureMessagingSecureMessageEntity['Direction'];
    readonly status: mjBizAppsSecureMessagingSecureMessageEntity['Status'];
    readonly receivedOffsetHours: number;
    readonly starred: boolean;
    readonly imported: boolean;
    readonly sourceChannel: string | null;
    readonly body: string;
}

export interface WorldArtifactSeed {
    readonly key: string;
    readonly orgKey: WorldOrgKey;
    readonly ownerPersonKey: string;
    readonly name: string;
    readonly description: string;
    readonly mimeType: string;
    readonly period: WorldPeriod;
}

export interface WorldArtifactVersionSeed {
    readonly key: string;
    readonly artifactKey: string;
    readonly versionNumber: number;
    readonly name: string;
    readonly description: string;
    readonly mimeType: string;
    readonly content: string;
}

export interface WorldMessageFileSeed {
    readonly key: string;
    readonly orgKey: WorldOrgKey;
    readonly threadKey: string;
    readonly messageKey: string;
    readonly artifactKey: string | null;
    readonly filename: string;
    readonly contentType: string;
    readonly size: number;
}

export interface WorldFileRequestSeed {
    readonly key: string;
    readonly orgKey: WorldOrgKey;
    readonly threadKey: string;
    readonly contactKey: string;
    readonly title: string;
    readonly instructions: string;
    readonly status: mjBizAppsSecureMessagingFileRequestEntity['Status'];
    readonly dueOffsetDays: number;
    readonly fulfilledOffsetHours: number | null;
}

export interface WorldMagicLinkSeed {
    readonly key: string;
    readonly contactKey: string;
    readonly threadKey: string;
    readonly rawToken: string;
    readonly status: mjBizAppsSecureMessagingPortalMagicLinkEntity['Status'];
    readonly expiresOffsetMinutes: number;
    readonly usedOffsetHours: number | null;
}

export interface SeedDensityPillarSummary {
    readonly passed: boolean;
    readonly summary: string;
    readonly checkedCount: number;
    readonly violationCount: number;
    readonly violations: readonly string[];
}

export interface SeedDensityReport {
    readonly schemaVersion: 'sf-readiness/v3';
    readonly overallPassed: boolean;
    readonly totalRecords: number;
    readonly organizationsCount: number;
    readonly peopleCount: number;
    readonly rolesCovered: readonly WorldRole[];
    readonly periodsCovered: readonly WorldPeriod[];
    readonly threadStatusesCovered: ReadonlyArray<mjBizAppsSecureMessagingSecureThreadEntity['Status']>;
    readonly threadsCount: number;
    readonly sessionsCount: number;
    readonly messagesCount: number;
    readonly artifactsCount: number;
    readonly artifactVersionsCount: number;
    readonly messageFilesCount: number;
    readonly artifactLinkedFilesCount: number;
    readonly nonArtifactFilesCount: number;
    readonly fileRequestsCount: number;
    readonly magicLinksCount: number;
    readonly pillars: {
        readonly seedDensity: SeedDensityPillarSummary;
    };
}

export const WORLD_ORGANIZATIONS: readonly WorldOrgSeed[] = [
    {
        key: 'blueCypress',
        name: 'Blue Cypress Press',
        legalName: 'Blue Cypress Press LLC',
        domain: 'bluecypress.example',
        industry: 'Publishing',
        status: 'Active',
    },
    {
        key: 'northstar',
        name: 'Northstar Legal Advisory',
        legalName: 'Northstar Legal Advisory LLP',
        domain: 'northstar-legal.example',
        industry: 'Legal & Compliance',
        status: 'Active',
    },
    {
        key: 'meridian',
        name: 'Meridian Health Systems',
        legalName: 'Meridian Health Systems Inc.',
        domain: 'meridian-health.example',
        industry: 'Healthcare',
        status: 'Active',
    },
    {
        key: 'summit',
        name: 'Summit Academic Press',
        legalName: 'Summit Academic Press Foundation',
        domain: 'summit-academic.example',
        industry: 'Higher Education',
        status: 'Active',
    },
];

export const WORLD_PEOPLE: readonly WorldPersonSeed[] = [
    {
        key: 'nora',
        orgKey: 'blueCypress',
        first: 'Nora',
        last: 'Calhoun',
        title: 'Director',
        role: 'PortalRecipient',
        email: `nora.calhoun@${WORLD_EMAIL_DOMAIN}`,
        token: WORLD_TOKENS.noraActive,
        sessionStatus: 'Active',
        sessionExpiresOffsetDays: 7,
        personStatus: 'Active',
        canReadOrgArtifacts: true,
        canUploadFiles: true,
    },
    {
        key: 'elena',
        orgKey: 'blueCypress',
        first: 'Elena',
        last: 'Voss',
        title: "Children's Librarian",
        role: 'ExternalContact',
        email: `elena.voss@${WORLD_EMAIL_DOMAIN}`,
        token: WORLD_TOKENS.elenaActive,
        sessionStatus: 'Active',
        sessionExpiresOffsetDays: 7,
        personStatus: 'Active',
        canReadOrgArtifacts: true,
        canUploadFiles: true,
    },
    {
        key: 'grace',
        orgKey: 'blueCypress',
        first: 'Grace',
        last: 'Hopper',
        title: 'Counsel',
        role: 'CaseReviewer',
        email: `grace.hopper@${WORLD_EMAIL_DOMAIN}`,
        token: WORLD_TOKENS.graceActive,
        sessionStatus: 'Active',
        sessionExpiresOffsetDays: 7,
        personStatus: 'Active',
        canReadOrgArtifacts: true,
        canUploadFiles: true,
    },
    {
        key: 'jordan',
        orgKey: 'blueCypress',
        first: 'Jordan',
        last: 'Blake',
        title: 'Independent',
        role: 'PortalRecipient',
        email: `jordan.blake@${WORLD_EMAIL_DOMAIN}`,
        token: WORLD_TOKENS.jordanActive,
        sessionStatus: 'Active',
        sessionExpiresOffsetDays: 7,
        personStatus: 'Active',
        canReadOrgArtifacts: false,
        canUploadFiles: true,
    },
    {
        key: 'alan',
        orgKey: 'summit',
        first: 'Alan',
        last: 'Turing',
        title: 'Faculty',
        role: 'ExternalContact',
        email: `alan.turing@${WORLD_EMAIL_DOMAIN}`,
        token: WORLD_TOKENS.alanActive,
        sessionStatus: 'Active',
        sessionExpiresOffsetDays: 7,
        personStatus: 'Active',
        canReadOrgArtifacts: true,
        canUploadFiles: false,
    },
    {
        key: 'marcus',
        orgKey: 'summit',
        first: 'Marcus',
        last: 'Webb',
        title: 'Coach',
        role: 'ExternalContact',
        email: `marcus.webb@${WORLD_EMAIL_DOMAIN}`,
        token: WORLD_TOKENS.marcusActive,
        sessionStatus: 'Active',
        sessionExpiresOffsetDays: 7,
        personStatus: 'Active',
        canReadOrgArtifacts: false,
        canUploadFiles: false,
    },
    {
        key: 'james',
        orgKey: 'blueCypress',
        first: 'James',
        last: 'Whitaker',
        title: 'Acquisitions Librarian',
        role: 'PortalRecipient',
        email: `james.whitaker@${WORLD_EMAIL_DOMAIN}`,
        token: WORLD_TOKENS.jamesExpired,
        sessionStatus: 'Expired',
        sessionExpiresOffsetDays: -1,
        personStatus: 'Active',
        canReadOrgArtifacts: true,
        canUploadFiles: true,
    },
    {
        key: 'ada',
        orgKey: 'blueCypress',
        first: 'Ada',
        last: 'Lovelace',
        title: 'Editor in Chief',
        role: 'Admin',
        email: `ada.lovelace@${WORLD_EMAIL_DOMAIN}`,
        token: WORLD_TOKENS.adaActive,
        sessionStatus: 'Active',
        sessionExpiresOffsetDays: 7,
        personStatus: 'Active',
        canReadOrgArtifacts: true,
        canUploadFiles: true,
    },
    {
        key: 'priya',
        orgKey: 'northstar',
        first: 'Priya',
        last: 'Nair',
        title: 'General Counsel',
        role: 'CaseReviewer',
        email: `priya.nair@${WORLD_EMAIL_DOMAIN}`,
        token: WORLD_TOKENS.priyaActive,
        sessionStatus: 'Active',
        sessionExpiresOffsetDays: 7,
        personStatus: 'Active',
        canReadOrgArtifacts: true,
        canUploadFiles: true,
    },
    {
        key: 'derek',
        orgKey: 'northstar',
        first: 'Derek',
        last: 'Okafor',
        title: 'SOC-2 Compliance Auditor',
        role: 'ExternalContact',
        email: `derek.okafor@${WORLD_EMAIL_DOMAIN}`,
        token: WORLD_TOKENS.derekActive,
        sessionStatus: 'Active',
        sessionExpiresOffsetDays: 7,
        personStatus: 'Active',
        canReadOrgArtifacts: true,
        canUploadFiles: true,
    },
    {
        key: 'samantha',
        orgKey: 'meridian',
        first: 'Samantha',
        last: 'Chen',
        title: 'Chief Privacy Officer',
        role: 'Admin',
        email: `samantha.chen@${WORLD_EMAIL_DOMAIN}`,
        token: WORLD_TOKENS.samanthaActive,
        sessionStatus: 'Active',
        sessionExpiresOffsetDays: 7,
        personStatus: 'Active',
        canReadOrgArtifacts: true,
        canUploadFiles: true,
    },
    {
        key: 'omar',
        orgKey: 'meridian',
        first: 'Omar',
        last: 'Haddad',
        title: 'Clinical Operations Director',
        role: 'PortalRecipient',
        email: `omar.haddad@${WORLD_EMAIL_DOMAIN}`,
        token: WORLD_TOKENS.omarRevoked,
        sessionStatus: 'Revoked',
        sessionExpiresOffsetDays: -3,
        personStatus: 'Active',
        canReadOrgArtifacts: false,
        canUploadFiles: false,
    },
];

export const WORLD_THREADS: readonly WorldThreadSeed[] = [
    {
        key: 'dues',
        orgKey: 'blueCypress',
        contactKey: 'nora',
        subject: `${WORLD_MARK} — 2026 membership dues`,
        status: 'Active',
        sourceChannel: null,
        period: '2026-Q4',
        lastMessageOffsetHours: 2,
    },
    {
        key: 'catalog',
        orgKey: 'blueCypress',
        contactKey: 'elena',
        subject: `${WORLD_MARK} — Children's catalog standing order`,
        status: 'Active',
        sourceChannel: null,
        period: '2026-Q4',
        lastMessageOffsetHours: 5,
    },
    {
        key: 'w9',
        orgKey: 'blueCypress',
        contactKey: 'grace',
        subject: `${WORLD_MARK} — Engagement letter and W-9`,
        status: 'Active',
        sourceChannel: null,
        period: '2026-Q4',
        lastMessageOffsetHours: 8,
    },
    {
        key: 'promote',
        orgKey: 'blueCypress',
        contactKey: 'jordan',
        subject: `${WORLD_MARK} — Switching this conversation to a secure channel`,
        status: 'Active',
        sourceChannel: 'Email',
        period: '2026-Q3',
        lastMessageOffsetHours: 20,
    },
    {
        key: 'deskcopy',
        orgKey: 'summit',
        contactKey: 'alan',
        subject: `${WORLD_MARK} — Summit University desk copy request`,
        status: 'Closed',
        sourceChannel: null,
        period: '2026-Q2',
        lastMessageOffsetHours: 28 * 24,
    },
    {
        key: 'quote',
        orgKey: 'summit',
        contactKey: 'marcus',
        subject: `${WORLD_MARK} — Atlas Athletics bulk handbook quote`,
        status: 'Archived',
        sourceChannel: null,
        period: '2026-Q1',
        lastMessageOffsetHours: 40 * 24,
    },
    {
        key: 'invoice',
        orgKey: 'blueCypress',
        contactKey: 'james',
        subject: `${WORLD_MARK} — Acquisitions invoice #4412`,
        status: 'Active',
        sourceChannel: null,
        period: '2026-Q4',
        lastMessageOffsetHours: 1,
    },
    {
        key: 'manuscript',
        orgKey: 'blueCypress',
        contactKey: 'ada',
        subject: `${WORLD_MARK} — Style Handbook 4e manuscript`,
        status: 'Active',
        sourceChannel: null,
        period: '2026-Q4',
        lastMessageOffsetHours: 30,
    },
    {
        key: 'northstarEngagement',
        orgKey: 'northstar',
        contactKey: 'priya',
        subject: `${WORLD_MARK} — Northstar MSA & Q4 Engagement Addendum`,
        status: 'Active',
        sourceChannel: null,
        period: '2026-Q4',
        lastMessageOffsetHours: 3,
    },
    {
        key: 'northstarAudit',
        orgKey: 'northstar',
        contactKey: 'derek',
        subject: `${WORLD_MARK} — Northstar SOC-2 Type II Control Matrix`,
        status: 'Active',
        sourceChannel: null,
        period: '2026-Q3',
        lastMessageOffsetHours: 36,
    },
    {
        key: 'meridianHipaa',
        orgKey: 'meridian',
        contactKey: 'samantha',
        subject: `${WORLD_MARK} — Meridian HIPAA Business Associate Agreement`,
        status: 'Active',
        sourceChannel: null,
        period: '2026-Q4',
        lastMessageOffsetHours: 4,
    },
    {
        key: 'meridianClinical',
        orgKey: 'meridian',
        contactKey: 'omar',
        subject: `${WORLD_MARK} — Meridian Clinical Data Sharing Protocol`,
        status: 'Closed',
        sourceChannel: null,
        period: '2026-Q1',
        lastMessageOffsetHours: 90 * 24,
    },
];

export const WORLD_MESSAGES: readonly WorldMessageSeed[] = [
    {
        key: 'dues-in',
        threadKey: 'dues',
        contactKey: 'nora',
        direction: 'Inbound',
        status: 'New',
        receivedOffsetHours: 2,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Can you confirm the EIN we have on file before I pay 2026 dues? I would rather not put the number in email.',
    },
    {
        key: 'catalog-out',
        threadKey: 'catalog',
        contactKey: 'elena',
        direction: 'Outbound',
        status: 'Sent',
        receivedOffsetHours: 26,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: "Elena — standing order for the 2027 children's catalog is ready to confirm. Reply here if the quantity is still 40.",
    },
    {
        key: 'catalog-in',
        threadKey: 'catalog',
        contactKey: 'elena',
        direction: 'Inbound',
        status: 'Read',
        receivedOffsetHours: 5,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: "Yes, still 40 — please ship to the Riverside children's desk, not the main receiving dock.",
    },
    {
        key: 'w9-out',
        threadKey: 'w9',
        contactKey: 'grace',
        direction: 'Outbound',
        status: 'Sent',
        receivedOffsetHours: 8,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Grace — please upload the signed W-9 and the engagement letter on this request. We cannot issue the retainer until both are in.',
    },
    {
        key: 'promote-imported',
        threadKey: 'promote',
        contactKey: 'jordan',
        direction: 'Inbound',
        status: 'Read',
        receivedOffsetHours: 6 * 24,
        starred: false,
        imported: true,
        sourceChannel: 'Email',
        body: 'I emailed a SSN correction last week. Moving the rest of this off email.',
    },
    {
        key: 'promote-out',
        threadKey: 'promote',
        contactKey: 'jordan',
        direction: 'Outbound',
        status: 'Sent',
        receivedOffsetHours: 20,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Jordan — this thread is now on the secure channel. The earlier email is preserved above as imported history.',
    },
    {
        key: 'deskcopy-in',
        threadKey: 'deskcopy',
        contactKey: 'alan',
        direction: 'Inbound',
        status: 'Read',
        receivedOffsetHours: 30 * 24,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Requesting a desk copy of Style Handbook 3e for the fall seminar.',
    },
    {
        key: 'deskcopy-out',
        threadKey: 'deskcopy',
        contactKey: 'alan',
        direction: 'Outbound',
        status: 'Sent',
        receivedOffsetHours: 28 * 24,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Shipped. Closing this thread — reopen if the copy does not arrive by next week.',
    },
    {
        key: 'quote-in',
        threadKey: 'quote',
        contactKey: 'marcus',
        direction: 'Inbound',
        status: 'Read',
        receivedOffsetHours: 42 * 24,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Need a bulk quote for 200 handbooks for the Atlas coaches clinic.',
    },
    {
        key: 'invoice-in',
        threadKey: 'invoice',
        contactKey: 'james',
        direction: 'Inbound',
        status: 'New',
        receivedOffsetHours: 1,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Invoice 4412 looks wrong — the PO on our side is 18-992. Session expired; I will use the magic link.',
    },
    {
        key: 'manuscript-in',
        threadKey: 'manuscript',
        contactKey: 'ada',
        direction: 'Inbound',
        status: 'Read',
        receivedOffsetHours: 30,
        starred: true,
        imported: false,
        sourceChannel: null,
        body: 'Chapter 12 of Style Handbook 4e and the editorial brief MJ Doc are attached to the fulfilled request. Please flag anything that still needs a legal read.',
    },
    {
        key: 'northstar-msa-out',
        threadKey: 'northstarEngagement',
        contactKey: 'priya',
        direction: 'Outbound',
        status: 'Sent',
        receivedOffsetHours: 12,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Priya — attached v2 of the Northstar MSA Deliverable MJ Doc alongside the wet-ink signature scan.',
    },
    {
        key: 'northstar-msa-in',
        threadKey: 'northstarEngagement',
        contactKey: 'priya',
        direction: 'Inbound',
        status: 'Replied',
        receivedOffsetHours: 3,
        starred: true,
        imported: false,
        sourceChannel: null,
        body: 'Reviewed v2 in-place. Section 4.2 indemnity language looks clean — ready for countersignature.',
    },
    {
        key: 'northstar-audit-out',
        threadKey: 'northstarAudit',
        contactKey: 'derek',
        direction: 'Outbound',
        status: 'Sent',
        receivedOffsetHours: 48,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Derek — sharing the Q3 SOC-2 Type II control matrix artifact for your evidence sampling.',
    },
    {
        key: 'northstar-audit-in',
        threadKey: 'northstarAudit',
        contactKey: 'derek',
        direction: 'Inbound',
        status: 'Read',
        receivedOffsetHours: 36,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Confirmed all 14 access-control evidence rows match our sampling schedule.',
    },
    {
        key: 'meridian-hipaa-out',
        threadKey: 'meridianHipaa',
        contactKey: 'samantha',
        direction: 'Outbound',
        status: 'Sent',
        receivedOffsetHours: 18,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Samantha — attached the updated Meridian HIPAA BAA Deliverable MJ Doc and encrypted intake archive.',
    },
    {
        key: 'meridian-hipaa-in',
        threadKey: 'meridianHipaa',
        contactKey: 'samantha',
        direction: 'Inbound',
        status: 'New',
        receivedOffsetHours: 4,
        starred: true,
        imported: false,
        sourceChannel: null,
        body: 'Please confirm breach notification window remains 24 hours in section 6 before we route to legal sign-off.',
    },
    {
        key: 'meridian-clinical-in',
        threadKey: 'meridianClinical',
        contactKey: 'omar',
        direction: 'Inbound',
        status: 'Read',
        receivedOffsetHours: 90 * 24,
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Archiving Q1 clinical protocol exchange after sign-off and session rotation.',
    },
];

export const WORLD_ARTIFACTS: readonly WorldArtifactSeed[] = [
    {
        key: 'northstarMsaDoc',
        orgKey: 'northstar',
        ownerPersonKey: 'priya',
        name: `${WORLD_MARK} — Northstar MSA Deliverable`,
        description: 'Versioned Master Services Agreement and Q4 Engagement Addendum for Northstar Legal Advisory.',
        mimeType: 'text/markdown',
        period: '2026-Q4',
    },
    {
        key: 'northstarAuditMatrix',
        orgKey: 'northstar',
        ownerPersonKey: 'derek',
        name: `${WORLD_MARK} — Northstar SOC-2 Control Matrix`,
        description: 'Structured JSON control matrix for Q3 SOC-2 Type II compliance sampling.',
        mimeType: 'application/json',
        period: '2026-Q3',
    },
    {
        key: 'handbookBriefDoc',
        orgKey: 'blueCypress',
        ownerPersonKey: 'ada',
        name: `${WORLD_MARK} — Style Handbook 4e Editorial Brief`,
        description: 'Editorial review brief and legal clearance checklist for Chapter 12.',
        mimeType: 'text/markdown',
        period: '2026-Q4',
    },
    {
        key: 'w9EngagementDoc',
        orgKey: 'blueCypress',
        ownerPersonKey: 'grace',
        name: `${WORLD_MARK} — W-9 Engagement Summary`,
        description: 'Retainer schedule and W-9 onboarding verification summary.',
        mimeType: 'text/markdown',
        period: '2026-Q4',
    },
    {
        key: 'meridianHipaaBaaDoc',
        orgKey: 'meridian',
        ownerPersonKey: 'samantha',
        name: `${WORLD_MARK} — Meridian HIPAA BAA Deliverable`,
        description: 'Business Associate Agreement security addendum for Meridian Health Systems.',
        mimeType: 'text/markdown',
        period: '2026-Q4',
    },
    {
        key: 'meridianClinicalProtocolDoc',
        orgKey: 'meridian',
        ownerPersonKey: 'omar',
        name: `${WORLD_MARK} — Meridian Clinical Data Protocol`,
        description: 'Archived Q1 clinical data de-identification and transfer protocol.',
        mimeType: 'text/markdown',
        period: '2026-Q1',
    },
];

export const WORLD_ARTIFACT_VERSIONS: readonly WorldArtifactVersionSeed[] = [
    {
        key: 'northstarMsaDocV1',
        artifactKey: 'northstarMsaDoc',
        versionNumber: 1,
        name: 'Northstar MSA Deliverable v1 (Initial Draft)',
        description: 'Initial draft prior to Section 4.2 indemnity alignment.',
        mimeType: 'text/markdown',
        content: '# Northstar Master Services Agreement (Draft v1)\n\n## Scope\nAdvisory legal counsel for Q4 2026 secure portal governance.\n\n## Indemnity\nStandard mutual limitation of liability pending partner sign-off.',
    },
    {
        key: 'northstarMsaDocV2',
        artifactKey: 'northstarMsaDoc',
        versionNumber: 2,
        name: 'Northstar MSA Deliverable v2 (Execution Ready)',
        description: 'Finalized Section 4.2 indemnity clause and data residency schedule.',
        mimeType: 'text/markdown',
        content: '# Northstar Master Services Agreement (v2 — Execution Ready)\n\n## Executive Summary\nFinalized engagement terms for Northstar Legal Advisory LLP.\n\n## Section 4.2 Indemnity & Tenant Isolation\nAll tenant records remain isolated under row-level security policies with zero cross-organization disclosure.\n\n## Deliverables\n- Quarterly compliance attestation\n- Encrypted portal artifact archive',
    },
    {
        key: 'northstarAuditMatrixV1',
        artifactKey: 'northstarAuditMatrix',
        versionNumber: 1,
        name: 'SOC-2 Control Matrix v1',
        description: 'Preliminary Q3 control set.',
        mimeType: 'application/json',
        content: JSON.stringify({ tenant: 'Northstar Legal Advisory', period: '2026-Q3', controlsEvaluated: 12, status: 'Draft' }, null, 2),
    },
    {
        key: 'northstarAuditMatrixV2',
        artifactKey: 'northstarAuditMatrix',
        versionNumber: 2,
        name: 'SOC-2 Control Matrix v2',
        description: 'Final verified Q3 evidence matrix with 14 passing controls.',
        mimeType: 'application/json',
        content: JSON.stringify({ tenant: 'Northstar Legal Advisory', period: '2026-Q3', controlsEvaluated: 14, rlsIsolationVerified: true, status: 'Verified' }, null, 2),
    },
    {
        key: 'handbookBriefDocV1',
        artifactKey: 'handbookBriefDoc',
        versionNumber: 1,
        name: 'Style Handbook 4e Editorial Brief v1',
        description: 'Initial chapter outline.',
        mimeType: 'text/markdown',
        content: '# Style Handbook 4e — Chapter 12 Brief (v1)\n\nPending legal citation review.',
    },
    {
        key: 'handbookBriefDocV2',
        artifactKey: 'handbookBriefDoc',
        versionNumber: 2,
        name: 'Style Handbook 4e Editorial Brief v2',
        description: 'Cleared editorial brief ready for publication.',
        mimeType: 'text/markdown',
        content: '# Style Handbook 4e — Chapter 12 Brief (v2)\n\n## Clearance Checklist\n- Permissions verified for all quoted excerpts\n- Layout reviewed for print and digital editions',
    },
    {
        key: 'w9EngagementDocV1',
        artifactKey: 'w9EngagementDoc',
        versionNumber: 1,
        name: 'W-9 Engagement Summary v1',
        description: 'Onboarding summary for Grace Hopper.',
        mimeType: 'text/markdown',
        content: '# Engagement Letter & W-9 Summary\n\nRetainer issuance requires countersigned engagement letter and verified W-9 PDF.',
    },
    {
        key: 'meridianHipaaBaaDocV1',
        artifactKey: 'meridianHipaaBaaDoc',
        versionNumber: 1,
        name: 'Meridian HIPAA BAA v1',
        description: 'Initial BAA security schedule.',
        mimeType: 'text/markdown',
        content: '# Meridian HIPAA Business Associate Agreement (v1)\n\nInitial draft with 48-hour incident notice window.',
    },
    {
        key: 'meridianHipaaBaaDocV2',
        artifactKey: 'meridianHipaaBaaDoc',
        versionNumber: 2,
        name: 'Meridian HIPAA BAA v2',
        description: 'Updated 24-hour breach notification covenant.',
        mimeType: 'text/markdown',
        content: '# Meridian HIPAA Business Associate Agreement (v2)\n\n## Section 6 — Breach Notification\nCovered entity notification occurs within 24 hours of confirmed unauthorized disclosure.\n\n## Tenant Boundary\nPHI attachments are strictly confined to Meridian Health Systems sessions.',
    },
    {
        key: 'meridianClinicalProtocolDocV1',
        artifactKey: 'meridianClinicalProtocolDoc',
        versionNumber: 1,
        name: 'Meridian Clinical Data Protocol v1',
        description: 'Final Q1 signed clinical transfer protocol.',
        mimeType: 'text/markdown',
        content: '# Clinical Data Sharing Protocol (Q1 2026)\n\nDe-identification verified under Safe Harbor rules.',
    },
];

export const WORLD_MESSAGE_FILES: readonly WorldMessageFileSeed[] = [
    // 6 Artifact-backed MJ Doc MessageFiles (populated ArtifactID)
    {
        key: 'northstarMsaFile',
        orgKey: 'northstar',
        threadKey: 'northstarEngagement',
        messageKey: 'northstar-msa-out',
        artifactKey: 'northstarMsaDoc',
        filename: `${WORLD_MARK}-northstar-msa-v2.md`,
        contentType: 'text/markdown',
        size: 18_432,
    },
    {
        key: 'northstarAuditFile',
        orgKey: 'northstar',
        threadKey: 'northstarAudit',
        messageKey: 'northstar-audit-out',
        artifactKey: 'northstarAuditMatrix',
        filename: `${WORLD_MARK}-northstar-soc2-matrix.json`,
        contentType: 'application/json',
        size: 9_216,
    },
    {
        key: 'handbookBriefFile',
        orgKey: 'blueCypress',
        threadKey: 'manuscript',
        messageKey: 'manuscript-in',
        artifactKey: 'handbookBriefDoc',
        filename: `${WORLD_MARK}-style-handbook-4e-brief.md`,
        contentType: 'text/markdown',
        size: 14_336,
    },
    {
        key: 'w9SummaryFile',
        orgKey: 'blueCypress',
        threadKey: 'w9',
        messageKey: 'w9-out',
        artifactKey: 'w9EngagementDoc',
        filename: `${WORLD_MARK}-w9-engagement-summary.md`,
        contentType: 'text/markdown',
        size: 6_144,
    },
    {
        key: 'meridianHipaaFile',
        orgKey: 'meridian',
        threadKey: 'meridianHipaa',
        messageKey: 'meridian-hipaa-out',
        artifactKey: 'meridianHipaaBaaDoc',
        filename: `${WORLD_MARK}-meridian-hipaa-baa-v2.md`,
        contentType: 'text/markdown',
        size: 21_504,
    },
    {
        key: 'meridianClinicalFile',
        orgKey: 'meridian',
        threadKey: 'meridianClinical',
        messageKey: 'meridian-clinical-in',
        artifactKey: 'meridianClinicalProtocolDoc',
        filename: `${WORLD_MARK}-meridian-clinical-protocol.md`,
        contentType: 'text/markdown',
        size: 12_288,
    },
    // 4 Non-artifact binary MessageFiles (ArtifactID = null — verifies download fallback)
    {
        key: 'manuscriptPdfBinary',
        orgKey: 'blueCypress',
        threadKey: 'manuscript',
        messageKey: 'manuscript-in',
        artifactKey: null,
        filename: `${WORLD_MARK}-chapter-12.pdf`,
        contentType: 'application/pdf',
        size: 248_832,
    },
    {
        key: 'northstarWetInkScan',
        orgKey: 'northstar',
        threadKey: 'northstarEngagement',
        messageKey: 'northstar-msa-out',
        artifactKey: null,
        filename: `${WORLD_MARK}-northstar-signature-scan.png`,
        contentType: 'image/png',
        size: 184_320,
    },
    {
        key: 'meridianIntakeZip',
        orgKey: 'meridian',
        threadKey: 'meridianHipaa',
        messageKey: 'meridian-hipaa-out',
        artifactKey: null,
        filename: `${WORLD_MARK}-meridian-intake-packet.zip`,
        contentType: 'application/zip',
        size: 512_000,
    },
    {
        key: 'invoiceReceiptPdf',
        orgKey: 'blueCypress',
        threadKey: 'invoice',
        messageKey: 'invoice-in',
        artifactKey: null,
        filename: `${WORLD_MARK}-invoice-4412-receipt.pdf`,
        contentType: 'application/pdf',
        size: 64_512,
    },
];

export const WORLD_FILE_REQUESTS: readonly WorldFileRequestSeed[] = [
    {
        key: 'w9',
        orgKey: 'blueCypress',
        threadKey: 'w9',
        contactKey: 'grace',
        title: `${WORLD_MARK} — Signed W-9`,
        instructions: 'Upload the signed W-9 (PDF). Do not email it.',
        status: 'Pending',
        dueOffsetDays: 5,
        fulfilledOffsetHours: null,
    },
    {
        key: 'manuscript',
        orgKey: 'blueCypress',
        threadKey: 'manuscript',
        contactKey: 'ada',
        title: `${WORLD_MARK} — Chapter 12 manuscript`,
        instructions: 'Upload the current Chapter 12 draft.',
        status: 'Fulfilled',
        dueOffsetDays: -2,
        fulfilledOffsetHours: 30,
    },
    {
        key: 'northstarInsurance',
        orgKey: 'northstar',
        threadKey: 'northstarEngagement',
        contactKey: 'priya',
        title: `${WORLD_MARK} — Northstar Certificate of Insurance`,
        instructions: 'Upload current cyber-liability COI matching Section 4.2.',
        status: 'Pending',
        dueOffsetDays: 10,
        fulfilledOffsetHours: null,
    },
    {
        key: 'meridianRiskAudit',
        orgKey: 'meridian',
        threadKey: 'meridianHipaa',
        contactKey: 'samantha',
        title: `${WORLD_MARK} — Meridian Annual Risk Attestation`,
        instructions: 'Upload signed HIPAA security officer attestation.',
        status: 'Expired',
        dueOffsetDays: -7,
        fulfilledOffsetHours: null,
    },
];

export const WORLD_MAGIC_LINKS: readonly WorldMagicLinkSeed[] = [
    {
        key: 'james',
        contactKey: 'james',
        threadKey: 'invoice',
        rawToken: WORLD_TOKENS.jamesMagic,
        status: 'Pending',
        expiresOffsetMinutes: 14,
        usedOffsetHours: null,
    },
    {
        key: 'priya',
        contactKey: 'priya',
        threadKey: 'northstarEngagement',
        rawToken: WORLD_TOKENS.priyaMagic,
        status: 'Used',
        expiresOffsetMinutes: -60,
        usedOffsetHours: 4,
    },
];

/**
 * Computes a structured OpenApp v3 SeedDensityReport over the SM-WORLD fixture catalog.
 */
export function BuildSeedDensityReport(): SeedDensityReport {
    const rolesCovered = Array.from(new Set(WORLD_PEOPLE.map((p) => p.role)));
    const periodsCovered = Array.from(new Set(WORLD_THREADS.map((t) => t.period)));
    const threadStatusesCovered = Array.from(new Set(WORLD_THREADS.map((t) => t.status)));
    const artifactLinkedFilesCount = WORLD_MESSAGE_FILES.filter((f) => f.artifactKey !== null).length;
    const nonArtifactFilesCount = WORLD_MESSAGE_FILES.filter((f) => f.artifactKey === null).length;

    const totalRecords =
        WORLD_ORGANIZATIONS.length +
        WORLD_PEOPLE.length +
        WORLD_THREADS.length +
        WORLD_PEOPLE.length + // 1 portal session per person
        WORLD_MESSAGES.length +
        WORLD_ARTIFACTS.length +
        WORLD_ARTIFACT_VERSIONS.length +
        WORLD_MESSAGE_FILES.length +
        WORLD_FILE_REQUESTS.length +
        WORLD_MAGIC_LINKS.length;

    const violations: string[] = [];
    if (totalRecords < 20) {
        violations.push(`Expected >= 20 total seed records, got ${totalRecords}`);
    }
    if (WORLD_ORGANIZATIONS.length < 3) {
        violations.push(`Expected >= 3 distinct organizations, got ${WORLD_ORGANIZATIONS.length}`);
    }
    if (periodsCovered.length < 3) {
        violations.push(`Expected >= 3 distinct time periods, got ${periodsCovered.length}`);
    }
    if (threadStatusesCovered.length < 3) {
        violations.push(`Expected >= 3 thread lifecycle statuses, got ${threadStatusesCovered.length}`);
    }
    if (artifactLinkedFilesCount < 4) {
        violations.push(`Expected >= 4 artifact-linked MessageFiles, got ${artifactLinkedFilesCount}`);
    }
    if (nonArtifactFilesCount < 2) {
        violations.push(`Expected >= 2 non-artifact binary MessageFiles, got ${nonArtifactFilesCount}`);
    }

    const passed = violations.length === 0;
    return {
        schemaVersion: 'sf-readiness/v3',
        overallPassed: passed,
        totalRecords,
        organizationsCount: WORLD_ORGANIZATIONS.length,
        peopleCount: WORLD_PEOPLE.length,
        rolesCovered,
        periodsCovered,
        threadStatusesCovered,
        threadsCount: WORLD_THREADS.length,
        sessionsCount: WORLD_PEOPLE.length,
        messagesCount: WORLD_MESSAGES.length,
        artifactsCount: WORLD_ARTIFACTS.length,
        artifactVersionsCount: WORLD_ARTIFACT_VERSIONS.length,
        messageFilesCount: WORLD_MESSAGE_FILES.length,
        artifactLinkedFilesCount,
        nonArtifactFilesCount,
        fileRequestsCount: WORLD_FILE_REQUESTS.length,
        magicLinksCount: WORLD_MAGIC_LINKS.length,
        pillars: {
            seedDensity: {
                passed,
                summary: `${totalRecords} multi-entity records across ${WORLD_ORGANIZATIONS.length} organizations, ${rolesCovered.length} roles, ${periodsCovered.length} periods, ${WORLD_ARTIFACTS.length} versioned MJ Doc artifacts (${WORLD_ARTIFACT_VERSIONS.length} versions), ${artifactLinkedFilesCount} artifact-linked MessageFiles, and ${nonArtifactFilesCount} binary fallback files`,
                checkedCount: totalRecords,
                violationCount: violations.length,
                violations,
            },
        },
    };
}
