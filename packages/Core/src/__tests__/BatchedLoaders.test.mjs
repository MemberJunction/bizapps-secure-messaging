import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RunView } from '@memberjunction/core';
import { SecureMessagingEngineBase } from '@mj-biz-apps/secure-messaging-entities';
import {
    ArtifactFileStore,
    OwnedMessageStore,
    PortalAuthService,
} from '../../dist/index.js';

describe('Core batched loaders & engine integration', () => {
    it('PortalAuthService.resolveContactEmailAndSession batches People + Portal Sessions into ONE RunViews call', async () => {
        const origRunViews = RunView.prototype.RunViews;
        const capturedBatches = [];

        RunView.prototype.RunViews = async function (paramsList) {
            capturedBatches.push(paramsList);
            return [
                {
                    Success: true,
                    Results: [{ ID: 'contact-1', Email: 'ada@example.com' }],
                },
                {
                    Success: true,
                    Results: [
                        {
                            ID: 'sess-1',
                            Status: 'Active',
                            __mj_CreatedAt: new Date(),
                        },
                    ],
                },
            ];
        };

        try {
            const res = await PortalAuthService.Instance.resolveContactEmailAndSession(
                'contact-1',
                { ID: 'sys-1' }
            );
            assert.equal(capturedBatches.length, 1, 'must execute a single batched RunViews call');
            assert.equal(capturedBatches[0].length, 2);
            assert.equal(capturedBatches[0][0].EntityName, PortalAuthService.contactEntityName);
            assert.equal(capturedBatches[0][0].ResultType, 'simple');
            assert.deepEqual(capturedBatches[0][0].Fields, ['ID', PortalAuthService.contactEmailField]);
            assert.equal(capturedBatches[0][0].MaxRows, 1);
            assert.equal(capturedBatches[0][1].EntityName, 'MJ_BizApps_SecureMessaging: Portal Sessions');
            assert.equal(capturedBatches[0][1].MaxRows, 1);

            assert.equal(res.contactEmail, 'ada@example.com');
            assert.equal(res.sessionId, 'sess-1');
            assert.equal(res.rawToken, undefined);
        } finally {
            RunView.prototype.RunViews = origRunViews;
        }
    });

    it('OwnedMessageStore.getThreadMessages uses ResultType simple with explicit Fields projection', async () => {
        const origRunView = RunView.prototype.RunView;
        const calls = [];

        RunView.prototype.RunView = async function (params) {
            calls.push(params);
            return {
                Success: true,
                Results: [
                    {
                        ID: 'm-1',
                        Sender: 'ada@example.com',
                        Recipient: '',
                        Subject: 'Hello',
                        Content: 'Body text',
                        ReceivedAt: '2026-01-01T00:00:00Z',
                    },
                ],
            };
        };

        try {
            const store = new OwnedMessageStore();
            const msgs = await store.getThreadMessages(
                { sessionId: 's-1', contactId: 'c-1', contactEmail: 'ada@example.com' },
                'thread-1',
                { ID: 'sys-1' }
            );
            assert.equal(calls.length, 1);
            assert.equal(calls[0].ResultType, 'simple');
            assert.deepEqual(calls[0].Fields, ['ID', 'Sender', 'Recipient', 'Subject', 'Content', 'ReceivedAt']);
            assert.equal(msgs.length, 1);
            assert.equal(msgs[0].id, 'm-1');
            assert.equal(msgs[0].content, 'Body text');
        } finally {
            RunView.prototype.RunView = origRunView;
        }
    });

    it('ArtifactFileStore.listThreadFiles uses ResultType simple with explicit Fields projection', async () => {
        const origRunView = RunView.prototype.RunView;
        const calls = [];

        RunView.prototype.RunView = async function (params) {
            calls.push(params);
            return {
                Success: true,
                Results: [
                    {
                        ID: 'mf-1',
                        ArtifactID: 'art-1',
                        FileID: 'f-1',
                        Filename: 'tax.pdf',
                        ContentType: 'application/pdf',
                        Size: 1024,
                    },
                ],
            };
        };

        try {
            const store = new ArtifactFileStore();
            const files = await store.listThreadFiles('thread-1', { ID: 'sys-1' });
            assert.equal(calls.length, 1);
            assert.equal(calls[0].ResultType, 'simple');
            assert.deepEqual(calls[0].Fields, ['ID', 'ArtifactID', 'FileID', 'Filename', 'ContentType', 'Size']);
            assert.equal(files.length, 1);
            assert.equal(files[0].filename, 'tax.pdf');
            assert.equal(files[0].size, 1024);
        } finally {
            RunView.prototype.RunView = origRunView;
        }
    });

    it('ArtifactFileStore resolves Artifact Types via SecureMessagingEngineBase without issuing direct RunViews', async () => {
        const origRunView = RunView.prototype.RunView;
        const origConfig = SecureMessagingEngineBase.Instance.Config;
        const origResolve = SecureMessagingEngineBase.Instance.ResolveArtifactTypeId;
        let directRunViewCalls = 0;
        let configCalls = 0;

        RunView.prototype.RunView = async function () {
            directRunViewCalls++;
            return { Success: true, Results: [] };
        };
        SecureMessagingEngineBase.Instance.Config = async () => {
            configCalls++;
        };
        SecureMessagingEngineBase.Instance.ResolveArtifactTypeId = (mime) =>
            mime === 'application/pdf' ? 'at-pdf' : null;

        try {
            const store = new ArtifactFileStore();
            const resolved = await store.resolveArtifactTypeId('application/pdf', { ID: 'sys-1' });
            assert.equal(resolved, 'at-pdf');
            assert.equal(configCalls, 1);
            assert.equal(directRunViewCalls, 0, 'must resolve via SecureMessagingEngineBase without direct RunView');
        } finally {
            RunView.prototype.RunView = origRunView;
            SecureMessagingEngineBase.Instance.Config = origConfig;
            SecureMessagingEngineBase.Instance.ResolveArtifactTypeId = origResolve;
        }
    });
});
