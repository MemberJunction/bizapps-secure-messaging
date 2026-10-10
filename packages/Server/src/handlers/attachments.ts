import { Request, Response } from 'express';
import { RunView, UserInfo } from '@memberjunction/core';
import { PortalRequest, assertThreadAccess, assertThreadWritable, isWellFormedUuid } from './middleware.js';
import { getFileStore } from '@mj-biz-apps/secure-messaging-core';

/**
 * Object-level authorization for the optional message-link fields on an upload: the
 * caller-supplied message ID must be a record of the given entity that belongs to THIS thread.
 * Without this, a contact could associate an upload with a message in a different thread (the
 * MessageFile row carries SecureMessageID/ExternalMessageID independently of ThreadID), so any
 * consumer reading files by message ID would surface the attacker's file under someone else's
 * message. Writes the 400 response and returns false when the link target is not in this thread.
 */
async function assertMessageInThread(
    entityName: string,
    messageId: string,
    threadId: string,
    systemUser: UserInfo,
    res: Response
): Promise<boolean> {
    if (isWellFormedUuid(messageId)) {
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string }>({
            EntityName: entityName,
            ExtraFilter: `ID = '${messageId}' AND ThreadID = '${threadId.replace(/'/g, "''")}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        }, systemUser);
        if (result.Success && result.Results.length > 0) {
            return true;
        }
    }
    res.status(400).json({ error: 'The message to attach this file to was not found in this thread' });
    return false;
}

/**
 * GET /threads/:threadId/attachments
 *
 * Lists all files attached to messages in the thread.
 */
export async function getThreadAttachments(req: Request, res: Response): Promise<void> {
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    const { systemUser, threadId } = access;

    try {
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
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    if (!assertThreadWritable(access, res)) return;
    const { systemUser, threadId } = access;

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file || !file.buffer || file.buffer.length === 0) {
        res.status(400).json({ error: 'No file uploaded (expected multipart field "file")' });
        return;
    }

    // The optional message-link fields are caller-supplied IDs — verify each one actually
    // belongs to this thread before linking the file to it (object-level authorization).
    const secureMessageId = typeof req.body?.secureMessageId === 'string' ? req.body.secureMessageId : undefined;
    const externalMessageId = typeof req.body?.externalMessageId === 'string' ? req.body.externalMessageId : undefined;

    try {
        if (secureMessageId && !(await assertMessageInThread(
            'MJ_BizApps_SecureMessaging: Secure Messages', secureMessageId, threadId, systemUser, res))) {
            return;
        }
        if (externalMessageId && !(await assertMessageInThread(
            'Channel Messages', externalMessageId, threadId, systemUser, res))) {
            return;
        }

        const stored = await getFileStore().store(
            {
                filename: file.originalname,
                contentType: file.mimetype || 'application/octet-stream',
                bytes: file.buffer,
            },
            {
                threadId,
                secureMessageId,
                externalMessageId,
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
    const access = await assertThreadAccess(req as PortalRequest, res);
    if (!access) return;
    const { systemUser, threadId } = access;
    const attachmentId = String(req.params.attachmentId);

    try {
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
