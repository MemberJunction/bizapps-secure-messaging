import { Request, Response } from 'express';
import { RunView, UserInfo } from '@memberjunction/core';
import { PortalRequest, assertThreadAccess, assertThreadWritable } from './middleware.js';
import { getFileStore } from '@mj-biz-apps/secure-messaging-core';

/**
 * Object-level authorization for the optional message-link body fields on upload: when the
 * caller names a message to attach the file to, that message must belong to THIS thread —
 * otherwise any authenticated contact could hang files off another thread's messages by
 * guessing IDs (mirrors the containment check fulfillFileRequest performs on its request
 * record). Writes a 404 and returns false when the message is not part of the thread.
 * Both message entities carry the SecureThread id in ThreadID: the owned store's Secure
 * Messages FK to it directly, and the channel adapter's Channel Messages are written with
 * ThreadID = the SecureThread id (see ChannelMessageStore). If the optional Channel Messages
 * entity is not installed, the lookup fails and the link is refused — which is correct, since
 * externalMessageId is only meaningful when the channel backend exists.
 */
async function assertMessageInThread(
    entityName: string,
    messageId: string,
    threadId: string,
    systemUser: UserInfo,
    res: Response
): Promise<boolean> {
    const rv = new RunView();
    const result = await rv.RunView<{ ID: string }>({
        EntityName: entityName,
        ExtraFilter: `ID = '${messageId.replace(/'/g, "''")}' AND ThreadID = '${threadId.replace(/'/g, "''")}'`,
        Fields: ['ID'],
        MaxRows: 1,
        ResultType: 'simple',
    }, systemUser);
    if (!result.Success || result.Results.length === 0) {
        res.status(404).json({ error: 'Message not found in this thread' });
        return false;
    }
    return true;
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
