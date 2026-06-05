import { Request, Response } from 'express';
import { getSystemUser } from '@memberjunction/server';
import { PortalRequest } from './middleware.js';
import { getFileStore } from '../stores/ArtifactFileStore.js';

/**
 * GET /threads/:threadId/attachments
 *
 * Lists all files attached to messages in the thread.
 */
export async function getThreadAttachments(req: Request, res: Response): Promise<void> {
    const { threadId } = req.params;
    const session = (req as PortalRequest).portalSession;

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const files = await getFileStore().listThreadFiles(threadId, systemUser);
        res.json({
            attachments: files.map(f => ({
                id: f.messageFileId,
                artifactId: f.artifactId,
                fileId: f.fileId,
                filename: f.filename,
                contentType: f.contentType,
                size: f.size,
            })),
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging get attachments error: ${msg}`);
        res.status(500).json({ error: 'Failed to load attachments' });
    }
}

/**
 * POST /threads/:threadId/attachments
 *
 * Uploads a file (multipart/form-data, field name "file") and attaches it to the thread.
 * Bytes are stored in core MJ File Storage and wrapped as an MJ Artifact.
 *
 * Optional body field "secureMessageId" or "externalMessageId" links the file to a
 * specific message; otherwise it is attached at the thread level.
 */
export async function uploadAttachment(req: Request, res: Response): Promise<void> {
    const { threadId } = req.params;
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
        const stored = await getFileStore().store(
            {
                filename: file.originalname,
                contentType: file.mimetype || 'application/octet-stream',
                bytes: file.buffer,
            },
            {
                threadId,
                secureMessageId: typeof req.body?.secureMessageId === 'string' ? req.body.secureMessageId : undefined,
                externalMessageId: typeof req.body?.externalMessageId === 'string' ? req.body.externalMessageId : undefined,
            },
            systemUser
        );

        res.status(201).json({
            attachmentId: stored.messageFileId,
            artifactId: stored.artifactId,
            filename: stored.filename,
            contentType: stored.contentType,
            size: stored.size,
            status: 'created',
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging upload attachment error: ${msg}`);
        // Configuration problems (no storage account) and size limits are client-actionable.
        if (/storage account|maximum size|empty/i.test(msg)) {
            res.status(400).json({ error: msg });
            return;
        }
        res.status(500).json({ error: 'Failed to upload attachment' });
    }
}

/**
 * GET /threads/:threadId/attachments/:attachmentId/download
 *
 * Returns a pre-authenticated download URL for a stored file.
 */
export async function downloadAttachment(req: Request, res: Response): Promise<void> {
    const threadId = String(req.params.threadId);
    const attachmentId = String(req.params.attachmentId);
    const session = (req as PortalRequest).portalSession;

    if (session.threadId !== threadId) {
        res.status(403).json({ error: 'Access denied to this thread' });
        return;
    }

    try {
        const systemUser = await getSystemUser();
        const url = await getFileStore().getDownloadUrl(attachmentId, threadId, systemUser);
        res.json({ url });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`Secure Messaging download attachment error: ${msg}`);
        if (/not found/i.test(msg)) {
            res.status(404).json({ error: msg });
            return;
        }
        res.status(500).json({ error: 'Failed to generate download URL' });
    }
}
