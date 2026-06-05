import { Request, Response } from 'express';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { MJGlobal } from '@memberjunction/global';
import { getSystemUser } from '@memberjunction/server';
import { PortalRequest } from './middleware.js';
import { BaseSignatureProvider } from '../services/SignatureProvider.js';
import { getFileStore } from '../stores/ArtifactFileStore.js';

const DEFAULT_SIGNATURE_PROVIDER = 'DocuSign';

/**
 * GET /threads/:threadId/signature-requests
 *
 * Lists signature requests for the thread.
 */
export async function getSignatureRequests(req: Request, res: Response): Promise<void> {
    const { threadId } = req.params;
    const session = (req as PortalRequest).portalSession;

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'Signature Requests',
            ExtraFilter: `ThreadID = '${threadId.replace(/'/g, "''")}'`,
            OrderBy: '__mj_CreatedAt DESC',
        }, systemUser);

        if (!result.Success) {
            res.status(500).json({ error: 'Failed to load signature requests' });
            return;
        }

        const signatureRequests = (result.Results as Record<string, unknown>[]).map(r => ({
            id: r.ID,
            title: r.Title,
            status: r.Status,
            provider: r.Provider,
            artifactId: r.ArtifactID,
            sentAt: r.SentAt,
            completedAt: r.CompletedAt,
            createdAt: r.__mj_CreatedAt,
        }));

        res.json({ signatureRequests });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging get signature requests error: ${msg}`);
        res.status(500).json({ error: 'Failed to load signature requests' });
    }
}

/**
 * POST /threads/:threadId/signature-requests
 *
 * Creates a Draft signature request for a document.
 *
 * Body: { title: string, artifactId?: string, provider?: string }
 */
export async function createSignatureRequest(req: Request, res: Response): Promise<void> {
    const { threadId } = req.params;
    const session = (req as PortalRequest).portalSession;
    const { title, artifactId, provider } = req.body;

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
        res.status(400).json({ error: 'A title is required' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const md = new Metadata();
        const entity = await md.GetEntityObject('Signature Requests', systemUser);
        entity.NewRecord();
        entity.Set('PortalSessionID', session.sessionId);
        entity.Set('ThreadID', threadId);
        entity.Set('Title', title.trim());
        entity.Set('Status', 'Draft');
        entity.Set('Provider', typeof provider === 'string' && provider ? provider : DEFAULT_SIGNATURE_PROVIDER);
        if (typeof artifactId === 'string') entity.Set('ArtifactID', artifactId);

        if (!(await entity.Save())) {
            res.status(500).json({ error: entity.LatestResult?.CompleteMessage || 'Failed to create signature request' });
            return;
        }

        res.status(201).json({ signatureRequestId: entity.Get('ID'), status: 'created' });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging create signature request error: ${msg}`);
        res.status(500).json({ error: 'Failed to create signature request' });
    }
}

/**
 * POST /threads/:threadId/signature-requests/:requestId/send
 *
 * Sends a signature request through its configured provider. With the default DocuSign
 * stub this returns a 501-style "not implemented" so the flow is observable end-to-end
 * without real signing credentials.
 */
export async function sendSignatureRequest(req: Request, res: Response): Promise<void> {
    const threadId = String(req.params.threadId);
    const requestId = String(req.params.requestId);
    const session = (req as PortalRequest).portalSession;

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const md = new Metadata();
        const entity = await md.GetEntityObject('Signature Requests', systemUser);
        const loaded = await entity.InnerLoad(CompositeKey.FromID(requestId));
        if (!loaded || entity.Get('ThreadID') !== threadId) {
            res.status(404).json({ error: 'Signature request not found in this thread' });
            return;
        }

        const providerName = (entity.Get('Provider') as string) || DEFAULT_SIGNATURE_PROVIDER;
        const provider = MJGlobal.Instance.ClassFactory.CreateInstance<BaseSignatureProvider>(
            BaseSignatureProvider,
            providerName
        );
        if (!provider) {
            res.status(500).json({ error: `No signature provider registered for '${providerName}'` });
            return;
        }

        // Load the document to sign from its artifact, if one is attached.
        const artifactId = (entity.Get('ArtifactID') as string) || undefined;
        let document: { bytes: Buffer; filename: string; contentType: string } | undefined;
        if (artifactId) {
            try {
                document = await getFileStore().loadArtifactDocument(artifactId, systemUser);
            } catch (docErr) {
                const m = docErr instanceof Error ? docErr.message : String(docErr);
                res.status(400).json({ error: `Could not load the document to sign: ${m}` });
                return;
            }
        }

        const result = await provider.createEnvelope({
            signatureRequestId: requestId,
            title: entity.Get('Title') as string,
            signerEmail: session.contactEmail,
            artifactId,
            document,
        });

        if (!result.success) {
            // Provider misconfigured or upstream failure — surface clearly.
            res.status(502).json({
                error: result.errorMessage || 'Signature provider could not send the envelope',
                provider: providerName,
            });
            return;
        }

        entity.Set('Status', 'Sent');
        entity.Set('SentAt', new Date().toISOString());
        if (result.externalEnvelopeId) entity.Set('ExternalEnvelopeID', result.externalEnvelopeId);
        if (!(await entity.Save())) {
            res.status(500).json({ error: entity.LatestResult?.CompleteMessage || 'Failed to update signature request' });
            return;
        }

        res.json({
            signatureRequestId: requestId,
            status: 'sent',
            signingUrl: result.signingUrl,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging send signature request error: ${msg}`);
        res.status(500).json({ error: 'Failed to send signature request' });
    }
}

/**
 * POST /threads/:threadId/signature-requests/:requestId/refresh-status
 *
 * Polls the provider for the envelope's current status and updates the record.
 */
export async function refreshSignatureStatus(req: Request, res: Response): Promise<void> {
    const threadId = String(req.params.threadId);
    const requestId = String(req.params.requestId);
    const session = (req as PortalRequest).portalSession;

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const md = new Metadata();
        const entity = await md.GetEntityObject('Signature Requests', systemUser);
        const loaded = await entity.InnerLoad(CompositeKey.FromID(requestId));
        if (!loaded || entity.Get('ThreadID') !== threadId) {
            res.status(404).json({ error: 'Signature request not found in this thread' });
            return;
        }

        const envelopeId = entity.Get('ExternalEnvelopeID') as string | null;
        if (!envelopeId) {
            res.status(400).json({ error: 'Signature request has not been sent yet' });
            return;
        }

        const providerName = (entity.Get('Provider') as string) || DEFAULT_SIGNATURE_PROVIDER;
        const provider = MJGlobal.Instance.ClassFactory.CreateInstance<BaseSignatureProvider>(
            BaseSignatureProvider,
            providerName
        );
        if (!provider) {
            res.status(500).json({ error: `No signature provider registered for '${providerName}'` });
            return;
        }

        const statusResult = await provider.getStatus(envelopeId);
        if (statusResult.status === 'Unknown') {
            res.status(502).json({ error: statusResult.errorMessage || 'Could not determine envelope status' });
            return;
        }

        // Persist the mapped status (and completion time when signed).
        entity.Set('Status', statusResult.status);
        if (statusResult.status === 'Signed') {
            entity.Set('CompletedAt', new Date().toISOString());
        }
        if (!(await entity.Save())) {
            res.status(500).json({ error: entity.LatestResult?.CompleteMessage || 'Failed to update signature request' });
            return;
        }

        res.json({ signatureRequestId: requestId, status: statusResult.status });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging refresh signature status error: ${msg}`);
        res.status(500).json({ error: 'Failed to refresh signature status' });
    }
}
