import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Metadata, RunView } from '@memberjunction/core';
import { UserCache } from '@memberjunction/sqlserver-dataprovider';
import { PortalAuthService } from '@mj-biz-apps/secure-messaging-core';
import { getFileRequests } from '../../dist/handlers/fileRequests.js';
import { getSignatureRequests, createSignatureRequest } from '../../dist/handlers/signatures.js';

function createMockRes() {
    const state = { statusCode: 200, body: null };
    return {
        state,
        status(code) {
            state.statusCode = code;
            return this;
        },
        json(payload) {
            state.body = payload;
            return this;
        },
    };
}

describe('Server handlers batched & projected RunView optimizations', () => {
    it('getFileRequests uses ResultType simple + Fields and skips BaseEntity hydration when no request is overdue', async () => {
        const origGetSystemUser = UserCache.Instance.GetSystemUser;
        const origStatus = PortalAuthService.Instance.contactThreadStatus;
        const origRunView = RunView.prototype.RunView;
        const origGetEntity = Metadata.prototype.GetEntityObject;
        const runViewCalls = [];
        let entityHydrationCalls = 0;

        UserCache.Instance.GetSystemUser = () => ({ ID: 'sys-1', Email: 'sys@example.com' });
        PortalAuthService.Instance.contactThreadStatus = async () => 'Active';
        RunView.prototype.RunView = async function (params) {
            runViewCalls.push(params);
            return {
                Success: true,
                Results: [
                    {
                        ID: 'fr-1',
                        Title: 'Upload W-9',
                        Instructions: 'PDF only',
                        Status: 'Pending',
                        DueAt: new Date(Date.now() + 86_400_000).toISOString(),
                        FulfilledAt: null,
                        __mj_CreatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };
        };
        Metadata.prototype.GetEntityObject = async function () {
            entityHydrationCalls++;
            throw new Error('Should not hydrate entity when no request is overdue');
        };

        try {
            const req = {
                params: { threadId: 'thread-1' },
                portalSession: { sessionId: 's-1', contactId: 'c-1', contactEmail: 'a@b.com' },
            };
            const res = createMockRes();
            await getFileRequests(req, res);

            assert.equal(res.state.statusCode, 200);
            assert.equal(runViewCalls.length, 1);
            assert.equal(runViewCalls[0].ResultType, 'simple');
            assert.deepEqual(runViewCalls[0].Fields, [
                'ID',
                'Title',
                'Instructions',
                'Status',
                'DueAt',
                'FulfilledAt',
                '__mj_CreatedAt',
            ]);
            assert.equal(entityHydrationCalls, 0);
            assert.equal(res.state.body.fileRequests.length, 1);
            assert.equal(res.state.body.fileRequests[0].status, 'Pending');
        } finally {
            UserCache.Instance.GetSystemUser = origGetSystemUser;
            PortalAuthService.Instance.contactThreadStatus = origStatus;
            RunView.prototype.RunView = origRunView;
            Metadata.prototype.GetEntityObject = origGetEntity;
        }
    });

    it('getSignatureRequests uses ResultType simple + explicit Fields projection', async () => {
        const origGetSystemUser = UserCache.Instance.GetSystemUser;
        const origStatus = PortalAuthService.Instance.contactThreadStatus;
        const origRunView = RunView.prototype.RunView;
        const origEntityByName = Metadata.prototype.EntityByName;
        const runViewCalls = [];

        UserCache.Instance.GetSystemUser = () => ({ ID: 'sys-1', Email: 'sys@example.com' });
        PortalAuthService.Instance.contactThreadStatus = async () => 'Active';
        Metadata.prototype.EntityByName = () => ({ ID: 'ent-threads' });
        RunView.prototype.RunView = async function (params) {
            runViewCalls.push(params);
            return {
                Success: true,
                Results: [
                    {
                        ID: 'sig-1',
                        Name: 'Engagement Letter',
                        Status: 'Sent',
                        ExternalEnvelopeID: 'env-123',
                        SentAt: '2026-01-02T00:00:00Z',
                        CompletedAt: null,
                        __mj_CreatedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };
        };

        try {
            const req = {
                params: { threadId: 'thread-1' },
                portalSession: { sessionId: 's-1', contactId: 'c-1', contactEmail: 'a@b.com' },
            };
            const res = createMockRes();
            await getSignatureRequests(req, res);

            assert.equal(res.state.statusCode, 200);
            assert.equal(runViewCalls.length, 1);
            assert.equal(runViewCalls[0].ResultType, 'simple');
            assert.deepEqual(runViewCalls[0].Fields, [
                'ID',
                'Name',
                'Status',
                'ExternalEnvelopeID',
                'SentAt',
                'CompletedAt',
                '__mj_CreatedAt',
            ]);
            assert.equal(res.state.body.signatureRequests.length, 1);
            assert.equal(res.state.body.signatureRequests[0].status, 'Sent');
            assert.equal('signatureAccountId' in res.state.body.signatureRequests[0], false);
        } finally {
            UserCache.Instance.GetSystemUser = origGetSystemUser;
            PortalAuthService.Instance.contactThreadStatus = origStatus;
            RunView.prototype.RunView = origRunView;
            Metadata.prototype.EntityByName = origEntityByName;
        }
    });

    it('createSignatureRequest batches Message Files ownership check + People lookup in ONE RunViews call', async () => {
        const origGetSystemUser = UserCache.Instance.GetSystemUser;
        const origStatus = PortalAuthService.Instance.contactThreadStatus;
        const origRunViews = RunView.prototype.RunViews;
        const batches = [];

        UserCache.Instance.GetSystemUser = () => ({ ID: 'sys-1', Email: 'sys@example.com' });
        PortalAuthService.Instance.contactThreadStatus = async () => 'Active';
        RunView.prototype.RunViews = async function (paramsList) {
            batches.push(paramsList);
            // Return no matching MessageFile link to exercise the 404 early exit cleanly
            return [
                { Success: true, Results: [] },
                { Success: true, Results: [{ DisplayName: 'Ada Lovelace' }] },
            ];
        };

        try {
            const req = {
                params: { threadId: 'thread-1' },
                portalSession: { sessionId: 's-1', contactId: 'c-1', contactEmail: 'ada@example.com' },
                body: { title: 'Sign NDA', signatureAccountId: 'acct-1', artifactId: 'art-1' },
            };
            const res = createMockRes();
            await createSignatureRequest(req, res);

            assert.equal(res.state.statusCode, 404);
            assert.equal(batches.length, 1, 'must execute a single batched RunViews call');
            assert.equal(batches[0].length, 2);
            assert.equal(batches[0][0].EntityName, 'MJ_BizApps_SecureMessaging: Message Files');
            assert.equal(batches[0][0].ResultType, 'simple');
            assert.deepEqual(batches[0][0].Fields, ['ID']);
            assert.equal(batches[0][1].EntityName, 'MJ_BizApps_Common: People');
            assert.equal(batches[0][1].ResultType, 'simple');
            assert.deepEqual(batches[0][1].Fields, ['DisplayName', 'FirstName', 'LastName']);
        } finally {
            UserCache.Instance.GetSystemUser = origGetSystemUser;
            PortalAuthService.Instance.contactThreadStatus = origStatus;
            RunView.prototype.RunViews = origRunViews;
        }
    });
});
