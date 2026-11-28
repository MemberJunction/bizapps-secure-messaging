import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RunView } from '@memberjunction/core';
import { OwnedMessageStore } from '../../dist/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../../..');
const UUID_V4_RE = /^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i;

describe('Secure Messaging Chief of Staff skill metadata & auto-install integrity', () => {
    const mjAppPath = resolve(repoRoot, 'mj-app.json');
    const rootSyncPath = resolve(repoRoot, 'metadata/.mj-sync.json');
    const skillDir = resolve(repoRoot, 'metadata/chief-of-staff-skills');
    const skillSyncPath = resolve(skillDir, '.mj-sync.json');
    const skillFilePath = resolve(skillDir, '.chief-of-staff-secure-messaging-skill.json');
    const actionsMetadataPath = resolve(repoRoot, 'metadata/actions/.secure-messaging-actions.json');

    it('wires metadata/chief-of-staff-skills into mj-app.json and root directoryOrder after actions', () => {
        const mjApp = JSON.parse(readFileSync(mjAppPath, 'utf8'));
        assert.equal(mjApp.metadata?.directory, 'metadata');

        const rootSync = JSON.parse(readFileSync(rootSyncPath, 'utf8'));
        const order = rootSync.directoryOrder ?? [];
        assert.ok(order.includes('actions'), 'root directoryOrder must include actions');
        assert.ok(order.includes('chief-of-staff-skills'), 'root directoryOrder must include chief-of-staff-skills');
        assert.ok(
            order.indexOf('chief-of-staff-skills') > order.indexOf('actions'),
            'chief-of-staff-skills must push after actions'
        );

        const skillSync = JSON.parse(readFileSync(skillSyncPath, 'utf8'));
        assert.equal(skillSync.entity, 'MJ: AI Skills');
        assert.equal(skillSync.filePattern, '**/.*.json');
    });

    it('defines a valid Chief of Staff skill with UUIDv4 PKs, zero sync blocks, real entity docs, and active template grant', () => {
        const records = JSON.parse(readFileSync(skillFilePath, 'utf8'));
        assert.equal(records.length, 1);

        const skill = records[0];
        assert.equal(skill.fields.Name, 'Secure Messaging');
        assert.equal(skill.fields.Status, 'Active');
        assert.equal(skill.fields.ActivationMode, 'Auto');
        assert.equal(skill.fields.CreatedByUserID, '@lookup:MJ: Users.Name=System');
        assert.match(skill.primaryKey.ID, UUID_V4_RE);
        assert.equal(skill.sync, undefined, 'skill metadata must not carry a sync block');

        assert.ok(skill.fields.Instructions.startsWith('@file:'));
        const instructionsPath = resolve(skillDir, skill.fields.Instructions.replace('@file:', ''));
        assert.ok(existsSync(instructionsPath), 'instructions markdown template must exist');
        const instructions = readFileSync(instructionsPath, 'utf8');
        for (const entityName of [
            'MJ_BizApps_SecureMessaging: Secure Threads',
            'MJ_BizApps_SecureMessaging: Secure Messages',
            'MJ_BizApps_SecureMessaging: File Requests',
            'MJ_BizApps_SecureMessaging: Message Files',
            'MJ_BizApps_SecureMessaging: Portal Sessions',
            'MJ_BizApps_SecureMessaging: Portal Magic Links',
        ]) {
            assert.ok(instructions.includes(entityName), `instructions must reference ${entityName}`);
        }
        assert.ok(instructions.includes('RunView'));

        const grants = skill.relatedEntities?.['MJ: AI Agent Skills'] ?? [];
        assert.equal(grants.length, 1);
        assert.equal(grants[0].fields.AgentID, '@lookup:MJ: AI Agents.Name=Chief of Staff');
        assert.equal(grants[0].fields.SkillID, '@parent:ID');
        assert.equal(grants[0].fields.Status, 'Active');
        assert.match(grants[0].primaryKey.ID, UUID_V4_RE);
        assert.equal(grants[0].sync, undefined);

        // Personal instances (e.g. Pepper) with BaseAgentID = Chief of Staff inherit active template grants
        const chiefOfStaffTemplateId = 'CHIEF-OF-STAFF-TEMPLATE';
        const inheritedSkills = grants
            .filter((g) => g.fields.Status === 'Active' && g.fields.AgentID === '@lookup:MJ: AI Agents.Name=Chief of Staff')
            .map(() => skill.fields.Name);
        const pepperInstance = { Name: 'Pepper', BaseAgentID: chiefOfStaffTemplateId };
        assert.equal(pepperInstance.BaseAgentID, chiefOfStaffTemplateId);
        assert.deepEqual(inheritedSkills, ['Secure Messaging']);
    });

    it('binds only declared Secure Messaging actions and uses zero raw SQL in any action source file', () => {
        const records = JSON.parse(readFileSync(skillFilePath, 'utf8'));
        const skillActions = records[0].relatedEntities?.['MJ: AI Skill Actions'] ?? [];
        assert.equal(skillActions.length, 4);

        const declared = new Set(
            JSON.parse(readFileSync(actionsMetadataPath, 'utf8')).map((a) => a.fields.Name)
        );
        const seenIds = new Set([records[0].primaryKey.ID]);
        for (const binding of skillActions) {
            assert.match(binding.primaryKey.ID, UUID_V4_RE);
            assert.ok(!seenIds.has(binding.primaryKey.ID), 'duplicate primaryKey ID');
            seenIds.add(binding.primaryKey.ID);
            assert.equal(binding.sync, undefined);
            assert.equal(binding.fields.SkillID, '@parent:ID');
            const actionName = binding.fields.ActionID.replace('@lookup:MJ: Actions.Name=', '');
            assert.ok(declared.has(actionName), `action '${actionName}' not found in .secure-messaging-actions.json`);
        }

        const customActionsDir = resolve(repoRoot, 'packages/Actions/src/custom');
        const actionFiles = readdirSync(customActionsDir).filter((f) => f.endsWith('.ts'));
        assert.ok(actionFiles.length > 0);
        const rawSqlPattern = /\b(ExecuteSQL|knex|sql\.Request|SELECT\s+.+\s+FROM\s+)\b/i;
        for (const file of actionFiles) {
            const src = readFileSync(resolve(customActionsDir, file), 'utf8');
            assert.equal(rawSqlPattern.test(src), false, `raw SQL detected in ${file}`);
        }
    });
});

describe('Secure Messaging Chief of Staff skill — two-user RLS isolation', () => {
    const userA = { ID: '11111111-1111-4111-8111-111111111111', Name: 'Advisor Alice', Email: 'alice@org.example' };
    const userB = { ID: '22222222-2222-4222-8222-222222222222', Name: 'Advisor Bob', Email: 'bob@org.example' };

    const threads = [
        { ID: 'thread-a1', ContactID: 'contact-a', Subject: 'Alice Client Tax Return', Status: 'Active', CreatedByUserID: userA.ID, IsDeleted: false },
        { ID: 'thread-b1', ContactID: 'contact-b', Subject: 'Bob Client Estate Plan', Status: 'Active', CreatedByUserID: userB.ID, IsDeleted: false },
    ];

    const messages = [
        {
            ID: 'msg-a1',
            ThreadID: 'thread-a1',
            OwnerUserID: userA.ID,
            Sender: 'client-a@external.example',
            Recipient: userA.Email,
            Subject: 'Alice Client Tax Return',
            Content: 'Uploaded 2026 W-2 for Alice',
            ReceivedAt: '2026-11-20T10:00:00.000Z',
        },
        {
            ID: 'msg-b1',
            ThreadID: 'thread-b1',
            OwnerUserID: userB.ID,
            Sender: 'client-b@external.example',
            Recipient: userB.Email,
            Subject: 'Bob Client Estate Plan',
            Content: 'Signed trust addendum for Bob',
            ReceivedAt: '2026-11-20T11:00:00.000Z',
        },
    ];

    const fileRequests = [
        { ID: 'fr-a1', ThreadID: 'thread-a1', Title: 'W-2 Upload', Status: 'Pending', RequestedByUserID: userA.ID },
        { ID: 'fr-b1', ThreadID: 'thread-b1', Title: 'Trust Schedule', Status: 'Pending', RequestedByUserID: userB.ID },
    ];

    function installRlsRunViewMock() {
        const origRunView = RunView.prototype.RunView;
        RunView.prototype.RunView = async function (params, contextUser) {
            const callerId = contextUser?.ID;
            const filter = params.ExtraFilter ?? '';

            if (params.EntityName === 'MJ_BizApps_SecureMessaging: Secure Threads') {
                const scoped = threads.filter((t) => {
                    if (t.CreatedByUserID !== callerId) return false;
                    const idMatch = filter.match(/ID\s*=\s*'([^']+)'/);
                    return idMatch ? t.ID === idMatch[1] : true;
                });
                return { Success: true, Results: scoped };
            }

            if (params.EntityName === 'MJ_BizApps_SecureMessaging: Secure Messages') {
                const threadMatch = filter.match(/ThreadID\s*=\s*'([^']+)'/);
                const scoped = messages.filter((m) => {
                    if (m.OwnerUserID !== callerId) return false;
                    return threadMatch ? m.ThreadID === threadMatch[1] : true;
                });
                return { Success: true, Results: scoped };
            }

            if (params.EntityName === 'MJ_BizApps_SecureMessaging: File Requests') {
                const scoped = fileRequests.filter((fr) => fr.RequestedByUserID === callerId);
                return { Success: true, Results: scoped };
            }

            return { Success: true, Results: [] };
        };
        return () => {
            RunView.prototype.RunView = origRunView;
        };
    }

    it('two users querying threads, messages, and file requests through the same skill receive strictly isolated records', async () => {
        const restore = installRlsRunViewMock();
        try {
            const rv = new RunView();
            const store = new OwnedMessageStore();

            // User A sees only Alice's thread, message, and file request
            const threadsA = await rv.RunView(
                { EntityName: 'MJ_BizApps_SecureMessaging: Secure Threads', ResultType: 'simple' },
                userA
            );
            const msgsA = await store.getThreadMessages(
                { sessionId: 'sess-a', contactId: 'contact-a', contactEmail: 'client-a@external.example' },
                'thread-a1',
                userA
            );
            const requestsA = await rv.RunView(
                { EntityName: 'MJ_BizApps_SecureMessaging: File Requests', ResultType: 'simple' },
                userA
            );

            // User B sees only Bob's thread, message, and file request
            const threadsB = await rv.RunView(
                { EntityName: 'MJ_BizApps_SecureMessaging: Secure Threads', ResultType: 'simple' },
                userB
            );
            const msgsB = await store.getThreadMessages(
                { sessionId: 'sess-b', contactId: 'contact-b', contactEmail: 'client-b@external.example' },
                'thread-b1',
                userB
            );
            const requestsB = await rv.RunView(
                { EntityName: 'MJ_BizApps_SecureMessaging: File Requests', ResultType: 'simple' },
                userB
            );

            assert.deepEqual(threadsA.Results.map((t) => t.ID), ['thread-a1']);
            assert.deepEqual(threadsB.Results.map((t) => t.ID), ['thread-b1']);
            assert.deepEqual(msgsA.map((m) => m.id), ['msg-a1']);
            assert.deepEqual(msgsB.map((m) => m.id), ['msg-b1']);
            assert.deepEqual(requestsA.Results.map((r) => r.ID), ['fr-a1']);
            assert.deepEqual(requestsB.Results.map((r) => r.ID), ['fr-b1']);

            // Cross-user probe: User A reading User B's thread gets zero messages; User B reading User A's gets zero
            const crossA = await store.getThreadMessages(
                { sessionId: 'sess-a', contactId: 'contact-a', contactEmail: 'client-a@external.example' },
                'thread-b1',
                userA
            );
            const crossB = await store.getThreadMessages(
                { sessionId: 'sess-b', contactId: 'contact-b', contactEmail: 'client-b@external.example' },
                'thread-a1',
                userB
            );
            assert.deepEqual(crossA, []);
            assert.deepEqual(crossB, []);
        } finally {
            restore();
        }
    });

    it('OwnedMessageStore.createOutboundMessage fails closed when User B attempts to send into User A thread', async () => {
        const restore = installRlsRunViewMock();
        try {
            const store = new OwnedMessageStore();
            await assert.rejects(
                () =>
                    store.createOutboundMessage(
                        'thread-a1',
                        { content: 'Unauthorized reply', senderEmail: userB.Email, senderName: userB.Name },
                        userB
                    ),
                /Secure thread thread-a1 not found/
            );
        } finally {
            restore();
        }
    });
});
