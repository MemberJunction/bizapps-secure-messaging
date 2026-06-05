import { Request, Response } from 'express';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { getSystemUser } from '@memberjunction/server';
import { PortalRequest } from './middleware.js';
import { getFileStore } from '../stores/ArtifactFileStore.js';

/**
 * GET /threads/:threadId/file-requests
 *
 * Lists file requests for the thread (the widget shows pending ones to the contact).
 */
export async function getFileRequests(req: Request, res: Response): Promise<void> {
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
            EntityName: 'File Requests',
            ExtraFilter: `ThreadID = '${threadId.replace(/'/g, "''")}'`,
            OrderBy: '__mj_CreatedAt DESC',
        }, systemUser);

        if (!result.Success) {
            res.status(500).json({ error: 'Failed to load file requests' });
            return;
        }

        const fileRequests = (result.Results as Record<string, unknown>[]).map(r => ({
            id: r.ID,
            title: r.Title,
            instructions: r.Instructions,
            status: r.Status,
            dueAt: r.DueAt,
            fulfilledAt: r.FulfilledAt,
            createdAt: r.__mj_CreatedAt,
        }));

        res.json({ fileRequests });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging get file requests error: ${msg}`);
        res.status(500).json({ error: 'Failed to load file requests' });
    }
}

/**
 * POST /threads/:threadId/file-requests
 *
 * Creates a file request (typically by staff) asking the contact to upload files.
 *
 * Body: { title: string, instructions?: string, dueAt?: string }
 */
export async function createFileRequest(req: Request, res: Response): Promise<void> {
    const { threadId } = req.params;
    const session = (req as PortalRequest).portalSession;
    const { title, instructions, dueAt } = req.body;

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
        const entity = await md.GetEntityObject('File Requests', systemUser);
        entity.NewRecord();
        entity.Set('PortalSessionID', session.sessionId);
        entity.Set('ThreadID', threadId);
        entity.Set('Title', title.trim());
        entity.Set('Status', 'Pending');
        if (typeof instructions === 'string') entity.Set('Instructions', instructions.trim());
        if (typeof dueAt === 'string') entity.Set('DueAt', dueAt);

        if (!(await entity.Save())) {
            res.status(500).json({ error: entity.LatestResult?.CompleteMessage || 'Failed to create file request' });
            return;
        }

        res.status(201).json({ fileRequestId: entity.Get('ID'), status: 'created' });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging create file request error: ${msg}`);
        res.status(500).json({ error: 'Failed to create file request' });
    }
}

/**
 * POST /threads/:threadId/file-requests/:requestId/fulfill
 *
 * Fulfills a file request by uploading a file (multipart field "file"). The file is
 * stored via the same path as a regular attachment and the request is marked Fulfilled.
 */
export async function fulfillFileRequest(req: Request, res: Response): Promise<void> {
    const threadId = String(req.params.threadId);
    const requestId = String(req.params.requestId);
    const session = (req as PortalRequest).portalSession;

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file || !file.buffer || file.buffer.length === 0) {
        res.status(400).json({ error: 'No file uploaded (expected multipart field "file")' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const md = new Metadata();

        // Load and validate the request belongs to this thread.
        const request = await md.GetEntityObject('File Requests', systemUser);
        const loaded = await request.InnerLoad(CompositeKey.FromID(requestId));
        if (!loaded || request.Get('ThreadID') !== threadId) {
            res.status(404).json({ error: 'File request not found in this thread' });
            return;
        }

        const stored = await getFileStore().store(
            {
                filename: file.originalname,
                contentType: file.mimetype || 'application/octet-stream',
                bytes: file.buffer,
            },
            { threadId },
            systemUser
        );

        request.Set('Status', 'Fulfilled');
        request.Set('FulfilledAt', new Date().toISOString());
        if (!(await request.Save())) {
            res.status(500).json({ error: request.LatestResult?.CompleteMessage || 'Failed to update file request' });
            return;
        }

        res.status(201).json({
            fileRequestId: requestId,
            attachmentId: stored.messageFileId,
            filename: stored.filename,
            status: 'fulfilled',
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging fulfill file request error: ${msg}`);
        if (/storage account|maximum size|empty/i.test(msg)) {
            res.status(400).json({ error: msg });
            return;
        }
        res.status(500).json({ error: 'Failed to fulfill file request' });
    }
}
