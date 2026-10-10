import { Request, Response } from 'express';
import { CompositeKey, Metadata, RunView } from '@memberjunction/core';
import { mjBizAppsSecureMessagingFileRequestEntity } from '@mj-biz-apps/secure-messaging-entities';
import { PortalRequest, assertThreadAccess, assertThreadWritable, isWellFormedUuid } from './middleware.js';
import { getFileStore } from '@mj-biz-apps/secure-messaging-core';

/** A Pending request whose DueAt has passed is treated as Expired (PRD §7, enforced lazily). */
function isOverdue(dueAt: Date | null): boolean {
    return !!dueAt && dueAt.getTime() < Date.now();
}

/**
 * GET /threads/:threadId/file-requests
 *
 * Lists the thread's file requests. Pending requests whose DueAt has passed are lazily flipped to
 * Expired here (no scheduler needed). The widget shows only Pending ones as action callouts; the
 * terminal states (Fulfilled / Cancelled / Expired) are returned too so they can collapse into
 * thread history.
 */
export async function getFileRequests(req: Request, res: Response): Promise<void> {
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    const { systemUser, threadId } = access;

    try {
        const rv = new RunView();
        const result = await rv.RunView<mjBizAppsSecureMessagingFileRequestEntity>({
            EntityName: 'MJ_BizApps_SecureMessaging: File Requests',
            ExtraFilter: `ThreadID = '${threadId.replace(/'/g, "''")}'`,
            OrderBy: '__mj_CreatedAt DESC',
            ResultType: 'entity_object',
        }, systemUser);

        if (!result.Success) {
            res.status(500).json({ error: 'Failed to load file requests' });
            return;
        }

        // Lazily expire overdue Pending requests so they leave the contact's action strip.
        for (const r of result.Results) {
            if (r.Status === 'Pending' && isOverdue(r.DueAt)) {
                r.Status = 'Expired';
                await r.Save();
            }
        }

        const fileRequests = result.Results.map(r => ({
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
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    if (!assertThreadWritable(access, res)) return;
    const { systemUser, threadId } = access;
    const session = (req as PortalRequest).portalSession;
    const { title, instructions, dueAt } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
        res.status(400).json({ error: 'A title is required' });
        return;
    }

    try {
        const md = new Metadata();
        const entity = await md.GetEntityObject<mjBizAppsSecureMessagingFileRequestEntity>(
            'MJ_BizApps_SecureMessaging: File Requests', systemUser);
        entity.NewRecord();
        entity.PortalSessionID = session.sessionId;
        entity.ThreadID = threadId;
        entity.Title = title.trim();
        entity.Status = 'Pending';
        if (typeof instructions === 'string') entity.Instructions = instructions.trim();
        if (typeof dueAt === 'string') entity.DueAt = new Date(dueAt);

        if (!(await entity.Save())) {
            res.status(500).json({ error: entity.LatestResult?.CompleteMessage || 'Failed to create file request' });
            return;
        }

        res.status(201).json({ fileRequestId: entity.ID, status: 'created' });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging create file request error: ${msg}`);
        res.status(500).json({ error: 'Failed to create file request' });
    }
}

/**
 * POST /threads/:threadId/file-requests/:requestId/fulfill
 *
 * Uploads one file toward a file request (multipart field "file"). Supports MULTIPLE files per
 * request: each call attaches a file and, unless the caller passes `complete=false`, marks the
 * request Fulfilled. To upload several files, send `complete=false` on all but the last. A request
 * that is already in a terminal state cannot be fulfilled.
 */
export async function fulfillFileRequest(req: Request, res: Response): Promise<void> {
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    if (!assertThreadWritable(access, res)) return;
    const { systemUser, threadId } = access;
    const requestId = String(req.params.requestId);
    // Boundary-validate the caller-supplied request ID before it reaches the entity load.
    if (!isWellFormedUuid(requestId)) {
        res.status(404).json({ error: 'File request not found in this thread' });
        return;
    }
    // Default true (a single upload fulfills); pass complete=false for intermediate multi-file uploads.
    const markComplete = String(req.body?.complete ?? 'true').toLowerCase() !== 'false';

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file || !file.buffer || file.buffer.length === 0) {
        res.status(400).json({ error: 'No file uploaded (expected multipart field "file")' });
        return;
    }

    try {
        const md = new Metadata();

        // Load and validate the request belongs to this thread.
        const request = await md.GetEntityObject<mjBizAppsSecureMessagingFileRequestEntity>(
            'MJ_BizApps_SecureMessaging: File Requests', systemUser);
        const loaded = await request.InnerLoad(CompositeKey.FromID(requestId));
        if (!loaded || request.ThreadID !== threadId) {
            res.status(404).json({ error: 'File request not found in this thread' });
            return;
        }
        // Only an open (Pending) request accepts uploads — terminal ones are closed.
        if (request.Status !== 'Pending') {
            res.status(409).json({ error: `This request is ${String(request.Status).toLowerCase()} and no longer accepts files.` });
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

        if (markComplete) {
            request.Status = 'Fulfilled';
            request.FulfilledAt = new Date();
            if (!(await request.Save())) {
                res.status(500).json({ error: request.LatestResult?.CompleteMessage || 'Failed to update file request' });
                return;
            }
        }

        res.status(201).json({
            fileRequestId: requestId,
            attachmentId: stored.messageFileId,
            filename: stored.filename,
            status: markComplete ? 'fulfilled' : 'pending',
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
