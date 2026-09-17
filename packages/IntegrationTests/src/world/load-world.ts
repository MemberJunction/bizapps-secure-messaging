/**
 * Commit SM-WORLD through BaseEntity so Explorer has a living secure inbox.
 *
 * Never the throwaway `test/seed-test-data.sql` INSERT script. Re-runs upsert by
 * Email (people), Subject (threads), ContactID (sessions), content marker (messages).
 *
 * People share the `com-world.test` directory with common/orders when that world exists.
 */
import { createHash } from 'node:crypto';
import type { IntegrationCheckContext } from '@memberjunction/testing-integration/registry';
import { Assert } from '@memberjunction/testing-integration/registry';
import {
    E_FILE_REQUEST,
    E_MAGIC,
    E_MESSAGE,
    E_MESSAGE_FILE,
    E_ORGANIZATION,
    E_PERSON,
    E_SESSION,
    E_THREAD,
    WORLD_EMAIL_DOMAIN,
    WORLD_MARK,
    WORLD_TOKENS,
} from '../entity-names.js';
import { FindId, Quote, Upsert } from '../entity-io.js';
import { SetWorld, type WorldIds, type WorldPerson } from './world.js';

const PEOPLE: ReadonlyArray<{
    key: string;
    first: string;
    last: string;
    title: string;
    email: string;
    token: string;
}> = [
    { key: 'nora', first: 'Nora', last: 'Calhoun', title: 'Director', email: `nora.calhoun@${WORLD_EMAIL_DOMAIN}`, token: WORLD_TOKENS.noraActive },
    { key: 'elena', first: 'Elena', last: 'Voss', title: "Children's Librarian", email: `elena.voss@${WORLD_EMAIL_DOMAIN}`, token: WORLD_TOKENS.elenaActive },
    { key: 'grace', first: 'Grace', last: 'Hopper', title: 'Counsel', email: `grace.hopper@${WORLD_EMAIL_DOMAIN}`, token: WORLD_TOKENS.graceActive },
    { key: 'jordan', first: 'Jordan', last: 'Blake', title: 'Independent', email: `jordan.blake@${WORLD_EMAIL_DOMAIN}`, token: WORLD_TOKENS.jordanActive },
    { key: 'alan', first: 'Alan', last: 'Turing', title: 'Faculty', email: `alan.turing@${WORLD_EMAIL_DOMAIN}`, token: WORLD_TOKENS.alanActive },
    { key: 'marcus', first: 'Marcus', last: 'Webb', title: 'Coach', email: `marcus.webb@${WORLD_EMAIL_DOMAIN}`, token: WORLD_TOKENS.marcusActive },
    { key: 'james', first: 'James', last: 'Whitaker', title: 'Acquisitions Librarian', email: `james.whitaker@${WORLD_EMAIL_DOMAIN}`, token: WORLD_TOKENS.jamesExpired },
    { key: 'ada', first: 'Ada', last: 'Lovelace', title: 'Editor in Chief', email: `ada.lovelace@${WORLD_EMAIL_DOMAIN}`, token: WORLD_TOKENS.adaActive },
];

export async function LoadWorld(ctx: IntegrationCheckContext): Promise<WorldIds> {
    const staff = StaffOf(ctx);
    const orgID = await upsertOrg(ctx);
    const people: Record<string, WorldPerson> = {};
    for (const p of PEOPLE) {
        people[p.key] = await upsertPerson(ctx, p);
    }

    const threads: Record<string, string> = {};
    threads.dues = await upsertThread(ctx, {
        key: 'dues',
        contact: people.nora,
        subject: `${WORLD_MARK} — 2026 membership dues`,
        status: 'Active',
        sourceChannel: null,
        createdBy: staff.id,
        lastMessageAt: HoursAgo(2),
    });
    threads.catalog = await upsertThread(ctx, {
        key: 'catalog',
        contact: people.elena,
        subject: `${WORLD_MARK} — Children's catalog standing order`,
        status: 'Active',
        sourceChannel: null,
        createdBy: staff.id,
        lastMessageAt: HoursAgo(5),
    });
    threads.w9 = await upsertThread(ctx, {
        key: 'w9',
        contact: people.grace,
        subject: `${WORLD_MARK} — Engagement letter and W-9`,
        status: 'Active',
        sourceChannel: null,
        createdBy: staff.id,
        lastMessageAt: HoursAgo(8),
    });
    threads.promote = await upsertThread(ctx, {
        key: 'promote',
        contact: people.jordan,
        subject: `${WORLD_MARK} — Switching this conversation to a secure channel`,
        status: 'Active',
        sourceChannel: 'Email',
        createdBy: staff.id,
        lastMessageAt: HoursAgo(20),
    });
    threads.deskcopy = await upsertThread(ctx, {
        key: 'deskcopy',
        contact: people.alan,
        subject: `${WORLD_MARK} — Summit University desk copy request`,
        status: 'Closed',
        sourceChannel: null,
        createdBy: staff.id,
        lastMessageAt: DaysAgo(28),
    });
    threads.quote = await upsertThread(ctx, {
        key: 'quote',
        contact: people.marcus,
        subject: `${WORLD_MARK} — Atlas Athletics bulk handbook quote`,
        status: 'Archived',
        sourceChannel: null,
        createdBy: staff.id,
        lastMessageAt: DaysAgo(40),
    });
    threads.invoice = await upsertThread(ctx, {
        key: 'invoice',
        contact: people.james,
        subject: `${WORLD_MARK} — Acquisitions invoice #4412`,
        status: 'Active',
        sourceChannel: null,
        createdBy: staff.id,
        lastMessageAt: HoursAgo(1),
    });
    threads.manuscript = await upsertThread(ctx, {
        key: 'manuscript',
        contact: people.ada,
        subject: `${WORLD_MARK} — Style Handbook 4e manuscript`,
        status: 'Active',
        sourceChannel: null,
        createdBy: staff.id,
        lastMessageAt: HoursAgo(30),
    });

    const sessions: Record<string, string> = {};
    for (const p of PEOPLE) {
        const expired = p.key === 'james';
        sessions[p.key] = await upsertSession(ctx, {
            contactID: people[p.key].ID,
            token: p.token,
            status: expired ? 'Expired' : 'Active',
            expiresAt: expired ? DaysAgo(1) : DaysAgo(-7),
        });
    }

    const messages: Record<string, string> = {};
    messages.duesIn = await upsertMessage(ctx, {
        key: 'dues-in',
        threadID: threads.dues,
        sessionID: sessions.nora,
        person: people.nora,
        staff,
        direction: 'Inbound',
        status: 'New',
        receivedAt: HoursAgo(2),
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Can you confirm the EIN we have on file before I pay 2026 dues? I would rather not put the number in email.',
    });
    messages.catalogOut = await upsertMessage(ctx, {
        key: 'catalog-out',
        threadID: threads.catalog,
        sessionID: sessions.elena,
        person: people.elena,
        staff,
        direction: 'Outbound',
        status: 'Sent',
        receivedAt: HoursAgo(26),
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Elena — standing order for the 2027 children\'s catalog is ready to confirm. Reply here if the quantity is still 40.',
    });
    messages.catalogIn = await upsertMessage(ctx, {
        key: 'catalog-in',
        threadID: threads.catalog,
        sessionID: sessions.elena,
        person: people.elena,
        staff,
        direction: 'Inbound',
        status: 'Read',
        receivedAt: HoursAgo(5),
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Yes, still 40 — please ship to the Riverside children\'s desk, not the main receiving dock.',
    });
    messages.w9Out = await upsertMessage(ctx, {
        key: 'w9-out',
        threadID: threads.w9,
        sessionID: sessions.grace,
        person: people.grace,
        staff,
        direction: 'Outbound',
        status: 'Sent',
        receivedAt: HoursAgo(8),
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Grace — please upload the signed W-9 and the engagement letter on this request. We cannot issue the retainer until both are in.',
    });
    messages.promoteImported = await upsertMessage(ctx, {
        key: 'promote-imported',
        threadID: threads.promote,
        sessionID: sessions.jordan,
        person: people.jordan,
        staff,
        direction: 'Inbound',
        status: 'Read',
        receivedAt: DaysAgo(6),
        starred: false,
        imported: true,
        sourceChannel: 'Email',
        body: 'I emailed a SSN correction last week. Moving the rest of this off email.',
    });
    messages.promoteOut = await upsertMessage(ctx, {
        key: 'promote-out',
        threadID: threads.promote,
        sessionID: sessions.jordan,
        person: people.jordan,
        staff,
        direction: 'Outbound',
        status: 'Sent',
        receivedAt: HoursAgo(20),
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Jordan — this thread is now on the secure channel. The earlier email is preserved above as imported history.',
    });
    messages.deskcopyIn = await upsertMessage(ctx, {
        key: 'deskcopy-in',
        threadID: threads.deskcopy,
        sessionID: sessions.alan,
        person: people.alan,
        staff,
        direction: 'Inbound',
        status: 'Read',
        receivedAt: DaysAgo(30),
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Requesting a desk copy of Style Handbook 3e for the fall seminar.',
    });
    messages.deskcopyOut = await upsertMessage(ctx, {
        key: 'deskcopy-out',
        threadID: threads.deskcopy,
        sessionID: sessions.alan,
        person: people.alan,
        staff,
        direction: 'Outbound',
        status: 'Sent',
        receivedAt: DaysAgo(28),
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Shipped. Closing this thread — reopen if the copy does not arrive by next week.',
    });
    messages.quoteIn = await upsertMessage(ctx, {
        key: 'quote-in',
        threadID: threads.quote,
        sessionID: sessions.marcus,
        person: people.marcus,
        staff,
        direction: 'Inbound',
        status: 'Read',
        receivedAt: DaysAgo(42),
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Need a bulk quote for 200 handbooks for the Atlas coaches clinic.',
    });
    messages.invoiceIn = await upsertMessage(ctx, {
        key: 'invoice-in',
        threadID: threads.invoice,
        sessionID: sessions.james,
        person: people.james,
        staff,
        direction: 'Inbound',
        status: 'New',
        receivedAt: HoursAgo(1),
        starred: false,
        imported: false,
        sourceChannel: null,
        body: 'Invoice 4412 looks wrong — the PO on our side is 18-992. Session expired; I will use the magic link.',
    });
    messages.manuscriptIn = await upsertMessage(ctx, {
        key: 'manuscript-in',
        threadID: threads.manuscript,
        sessionID: sessions.ada,
        person: people.ada,
        staff,
        direction: 'Inbound',
        status: 'Read',
        receivedAt: HoursAgo(30),
        starred: true,
        imported: false,
        sourceChannel: null,
        body: 'Chapter 12 of Style Handbook 4e is attached to the fulfilled request. Please flag anything that still needs a legal read.',
    });

    const fileRequests: Record<string, string> = {};
    fileRequests.w9 = await Upsert(
        ctx,
        E_FILE_REQUEST,
        `Title = '${Quote(`${WORLD_MARK} — Signed W-9`)}'`,
        {
            PortalSessionID: sessions.grace,
            ThreadID: threads.w9,
            Title: `${WORLD_MARK} — Signed W-9`,
            Instructions: 'Upload the signed W-9 (PDF). Do not email it.',
            Status: 'Pending',
            RequestedByUserID: staff.id,
            DueAt: DaysAgo(-5),
            FulfilledAt: null,
        },
    );
    fileRequests.manuscript = await Upsert(
        ctx,
        E_FILE_REQUEST,
        `Title = '${Quote(`${WORLD_MARK} — Chapter 12 manuscript`)}'`,
        {
            PortalSessionID: sessions.ada,
            ThreadID: threads.manuscript,
            Title: `${WORLD_MARK} — Chapter 12 manuscript`,
            Instructions: 'Upload the current Chapter 12 draft.',
            Status: 'Fulfilled',
            RequestedByUserID: staff.id,
            DueAt: DaysAgo(2),
            FulfilledAt: HoursAgo(30),
        },
    );

    await Upsert(
        ctx,
        E_MESSAGE_FILE,
        `Filename = '${Quote(`${WORLD_MARK}-chapter-12.pdf`)}'`,
        {
            SecureMessageID: messages.manuscriptIn,
            ThreadID: threads.manuscript,
            Filename: `${WORLD_MARK}-chapter-12.pdf`,
            ContentType: 'application/pdf',
            Size: 248_832,
        },
    );

    const magicLinks: Record<string, string> = {};
    magicLinks.james = await Upsert(
        ctx,
        E_MAGIC,
        `TokenHash = '${Quote(HashToken(WORLD_TOKENS.jamesMagic))}'`,
        {
            PortalSessionID: sessions.james,
            TokenHash: HashToken(WORLD_TOKENS.jamesMagic),
            Status: 'Pending',
            ExpiresAt: new Date(Date.now() + 14 * 60_000),
            UsedAt: null,
            DeepLinkThreadID: threads.invoice,
        },
    );

    const world: WorldIds = {
        OrganizationID: orgID,
        People: people,
        Threads: threads,
        Sessions: sessions,
        Messages: messages,
        FileRequests: fileRequests,
        MagicLinks: magicLinks,
    };
    SetWorld(world);
    return world;
}

function HashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
}

function HoursAgo(hours: number): Date {
    return new Date(Date.now() - hours * 3_600_000);
}

function DaysAgo(days: number): Date {
    return new Date(Date.now() - days * 86_400_000);
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

async function upsertOrg(ctx: IntegrationCheckContext): Promise<string> {
    return Upsert(ctx, E_ORGANIZATION, `Name = 'Blue Cypress Press'`, {
        Name: 'Blue Cypress Press',
        Status: 'Active',
    });
}

async function upsertPerson(
    ctx: IntegrationCheckContext,
    p: { first: string; last: string; title: string; email: string },
): Promise<WorldPerson> {
    const id = await Upsert(ctx, E_PERSON, `Email = '${Quote(p.email)}'`, {
        FirstName: p.first,
        LastName: p.last,
        Email: p.email,
        Title: p.title,
        Status: 'Active',
        PhotoURL: `https://api.dicebear.com/9.x/lorelei/png?seed=${encodeURIComponent(p.email)}&size=256`,
    });
    return { ID: id, Email: p.email, FirstName: p.first, LastName: p.last };
}

async function upsertThread(
    ctx: IntegrationCheckContext,
    args: {
        key: string;
        contact: WorldPerson;
        subject: string;
        status: 'Active' | 'Archived' | 'Closed';
        sourceChannel: string | null;
        createdBy: string;
        lastMessageAt: Date;
    },
): Promise<string> {
    void args.key;
    return Upsert(ctx, E_THREAD, `Subject = '${Quote(args.subject)}'`, {
        ContactID: args.contact.ID,
        Subject: args.subject,
        Status: args.status,
        SourceChannel: args.sourceChannel,
        CreatedByUserID: args.createdBy,
        LastMessageAt: args.lastMessageAt,
        IsDeleted: false,
    });
}

async function upsertSession(
    ctx: IntegrationCheckContext,
    args: { contactID: string; token: string; status: 'Active' | 'Expired' | 'Revoked'; expiresAt: Date },
): Promise<string> {
    return Upsert(ctx, E_SESSION, `ContactID = '${args.contactID}'`, {
        ContactID: args.contactID,
        TokenHash: HashToken(args.token),
        Status: args.status,
        ExpiresAt: args.expiresAt,
        LastAccessedAt: new Date(),
    });
}

async function upsertMessage(
    ctx: IntegrationCheckContext,
    args: {
        key: string;
        threadID: string;
        sessionID: string;
        person: WorldPerson;
        staff: { email: string; name: string };
        direction: 'Inbound' | 'Outbound';
        status: 'Failed' | 'New' | 'Read' | 'Replied' | 'Sent';
        receivedAt: Date;
        starred: boolean;
        imported: boolean;
        sourceChannel: string | null;
        body: string;
    },
): Promise<string> {
    const inbound = args.direction === 'Inbound';
    const existing = await FindId(ctx, E_MESSAGE, `ThreadID = '${args.threadID}' AND Content LIKE '%<!--sm-world:${Quote(args.key)}-->%'`);
    const fields = {
        PortalSessionID: args.sessionID,
        ThreadID: args.threadID,
        PersonID: args.person.ID,
        Direction: args.direction,
        Sender: inbound ? args.person.Email : args.staff.email,
        Recipient: inbound ? args.staff.email : args.person.Email,
        Subject: null,
        Content: WorldContent(args.key, args.body),
        IsSecure: true,
        Status: args.status,
        ReceivedAt: args.receivedAt,
        IsStarred: args.starred,
        IsImported: args.imported,
        SourceChannel: args.sourceChannel,
    };
    if (existing) {
        return Upsert(ctx, E_MESSAGE, `ID = '${existing}'`, fields);
    }
    return Upsert(ctx, E_MESSAGE, `ThreadID = '${args.threadID}' AND Content LIKE '%<!--sm-world:${Quote(args.key)}-->%'`, fields);
}
