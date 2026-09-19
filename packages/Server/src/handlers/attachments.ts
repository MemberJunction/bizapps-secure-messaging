import { Request, Response } from 'express';
import { RunView, UserInfo } from '@memberjunction/core';
import { PortalRequest, assertThreadAccess, assertThreadWritable } from './middleware.js';
import { getFileStore, getSecureMessagingConfig } from '@mj-biz-apps/secure-messaging-core';

/** Canonical UUID shape (8-4-4-4-12 hex). */
const UUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** The validated optional message-link fields an upload may carry. */
interface MessageLink {
    secureMessageId?: string;
    externalMessageId?: string;
}

/**
 * Object-level authorization for the OPTIONAL message-link fields on an upload. A
 * caller-supplied message ID must be a well-formed UUID AND belong to the thread whose access
 * was already asserted — without this, an authenticated contact could link an uploaded file to
 * a message in ANOTHER contact's thread by supplying its ID (the FK only requires the message
 * to exist, not to be theirs). Writes the error response and returns null on failure.
 */
async function resolveMessageLink(
    body: Record<string, unknown> | undefined,
    threadId: string,
    systemUser: UserInfo,
    res: Response
): Promise<MessageLink | null> {
    const secureMessageId = typeof body?.secureMessageId === 'string' ? body.secureMessageId : undefined;
    const externalMessageId = typeof body?.externalMessageId === 'string' ? body.externalMessageId : undefined;
    const link: MessageLink = {};

    if (secureMessageId) {
        if (!UUID_REGEX.test(secureMessageId)) {
            res.status(400).json({ error: 'secureMessageId is not a valid ID' });
            return null;
        }
        const rv = new RunView();
        const check = await rv.RunView<{ ID: string }>({
            EntityName: 'MJ_BizApps_SecureMessaging: Secure Messages',
            ExtraFilter: `ID = '${secureMessageId}' AND ThreadID = '${threadId.replace(/'/g, "''")}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        }, systemUser);
        if (!check.Success || check.Results.length === 0) {
            res.status(404).json({ error: 'Message not found in this thread' });
            return null;
        }
        link.secureMessageId = secureMessageId;
    }

    if (externalMessageId) {
        // External (Channel) message links are only meaningful under the channel backend,
        // where they can be verified against the thread; otherwise they cannot be validated.
        if (!UUID_REGEX.test(externalMessageId) || getSecureMessagingConfig().messageBackend !== 'channel') {
            res.status(400).json({ error: 'externalMessageId is not a valid ID for this configuration' });
            return null;
        }
        const rv = new RunView();
        const check = await rv.RunView<{ ID: string }>({
            EntityName: 'Channel Messages',
            ExtraFilter: `ID = '${externalMessageId}' AND ThreadID = '${threadId.replace(/'/g, "''")}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        }, systemUser);
        if (!check.Success || check.Results.length === 0) {
            res.status(404).json({ error: 'Message not found in this thread' });
            return null;
        }
        link.externalMessageId = externalMessageId;
    }

    return link;
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

    try {
        const link = await resolveMessageLink(req.body, threadId, systemUser, res);
        if (!link) return;

        const stored = await getFileStore().store(
            {
                filename: file.originalname,
                contentType: file.mimetype || 'application/octet-stream',
                bytes: file.buffer,
            },
            {
                threadId,
                secureMessageId: link.secureMessageId,
                externalMessageId: link.externalMessageId,
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
