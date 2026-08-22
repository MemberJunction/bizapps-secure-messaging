import { Metadata, RunView, UserInfo } from '@memberjunction/core';
import { FileStorageEngine } from '@memberjunction/storage';
import type {
    MJArtifactEntity,
    MJArtifactVersionEntity,
    MJFileEntity,
} from '@memberjunction/core-entities';
import { isUuid } from '../utils/validation.js';

/** Maximum upload size, mirroring the cap MJ's attachment pipeline uses. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** A generic Artifact Type name to fall back to when no MIME-specific type matches. */
const FALLBACK_ARTIFACT_TYPE_NAME = 'Document';

export interface StoreFileInput {
    filename: string;
    contentType: string;
    bytes: Buffer;
}

export interface StoreFileContext {
    threadId: string;
    /** The owned SecureMessage ID, when the file attaches to an owned-store message. */
    secureMessageId?: string;
    /** The external (Channel) message ID, when using the channel adapter. */
    externalMessageId?: string;
}

export interface StoredFile {
    messageFileId: string;
    artifactId: string;
    fileId: string;
    filename: string;
    contentType: string;
    size: number;
}

/**
 * Stores uploaded file bytes using only **core** MemberJunction primitives, so the app
 * is app-agnostic:
 *   1. bytes → MJ: Files via FileStorageEngine (lands in the configured storage provider)
 *   2. wrap in MJ: Artifacts + MJ: Artifact Versions (ContentMode='File') — when present,
 *      Izzy's AI attachment pipeline picks these up automatically
 *   3. link to a secure message via __mj_BizAppsSecureMessaging.MessageFile
 *
 * Requires a FileStorageAccount to be configured in the host instance.
 */
export class ArtifactFileStore {
    /** Resolves the Artifact Type ID best matching a MIME type, with a generic fallback. */
    private async resolveArtifactTypeId(contentType: string, systemUser: UserInfo): Promise<string> {
        const rv = new RunView();
        const result = await rv.RunView<{ ID: string; ContentType: string; Priority: number }>({
            EntityName: 'MJ: Artifact Types',
            ExtraFilter: 'IsEnabled = 1',
            OrderBy: 'Priority DESC',
        }, systemUser);

        if (!result.Success || result.Results.length === 0) {
            throw new Error('No enabled MJ Artifact Types are configured');
        }

        const types = result.Results;
        const ct = contentType.toLowerCase();
        // Exact match first, then wildcard (e.g. 'image/*'), highest Priority wins (already ordered).
        const exact = types.find(t => (t.ContentType || '').toLowerCase() === ct);
        if (exact) return exact.ID;
        const wildcard = types.find(t => {
            const pat = (t.ContentType || '').toLowerCase();
            return pat.endsWith('/*') && ct.startsWith(pat.slice(0, -1));
        });
        if (wildcard) return wildcard.ID;
        const fallback = types.find(t => t.ContentType?.toLowerCase() === FALLBACK_ARTIFACT_TYPE_NAME.toLowerCase())
            || types.find(t => (t as unknown as { Name: string }).Name === FALLBACK_ARTIFACT_TYPE_NAME);
        // Last resort: the highest-priority enabled type.
        return (fallback?.ID) || types[0].ID;
    }

    /** Stores a file and links it to a secure message. */
    async store(input: StoreFileInput, ctx: StoreFileContext, systemUser: UserInfo): Promise<StoredFile> {
        if (input.bytes.length === 0) {
            throw new Error('Uploaded file is empty');
        }
        if (input.bytes.length > MAX_FILE_BYTES) {
            throw new Error(`File exceeds the maximum size of ${MAX_FILE_BYTES} bytes`);
        }

        const engine = FileStorageEngine.Instance;
        await engine.Config(false, systemUser);
        if (!engine.HasStorageAccounts) {
            throw new Error('No file storage account is configured in this MemberJunction instance');
        }

        // 1. bytes → MJ: Files (provider holds the actual bytes)
        const upload = await engine.UploadFile({
            content: input.bytes,
            fileName: input.filename,
            mimeType: input.contentType,
            contextUser: systemUser,
        });

        const md = new Metadata();

        // 2a. MJ: Artifacts
        const typeId = await this.resolveArtifactTypeId(input.contentType, systemUser);
        const artifact = await md.GetEntityObject<MJArtifactEntity>('MJ: Artifacts', systemUser);
        artifact.NewRecord();
        artifact.Name = input.filename;
        artifact.TypeID = typeId;
        artifact.UserID = systemUser.ID;
        if (!(await artifact.Save())) {
            throw new Error(artifact.LatestResult?.CompleteMessage || 'Failed to create artifact');
        }

        // 2b. MJ: Artifact Versions (file mode → references MJ: Files)
        const version = await md.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', systemUser);
        version.NewRecord();
        version.ArtifactID = artifact.ID;
        version.VersionNumber = 1;
        version.ContentMode = 'File';
        version.FileID = upload.FileID;
        version.MimeType = input.contentType;
        version.FileName = input.filename;
        version.ContentSizeBytes = input.bytes.length;
        version.UserID = systemUser.ID;
        if (!(await version.Save())) {
            throw new Error(version.LatestResult?.CompleteMessage || 'Failed to create artifact version');
        }

        // 3. __mj_BizAppsSecureMessaging.MessageFile link
        const link = await md.GetEntityObject('MJ_BizApps_SecureMessaging: Message Files', systemUser);
        link.NewRecord();
        if (ctx.secureMessageId) link.Set('SecureMessageID', ctx.secureMessageId);
        if (ctx.externalMessageId) link.Set('ExternalMessageID', ctx.externalMessageId);
        link.Set('ThreadID', ctx.threadId);
        link.Set('ArtifactID', artifact.ID);
        link.Set('FileID', upload.FileID);
        link.Set('Filename', input.filename);
        link.Set('ContentType', input.contentType);
        link.Set('Size', input.bytes.length);
        if (!(await link.Save())) {
            throw new Error(link.LatestResult?.CompleteMessage || 'Failed to link file to message');
        }

        return {
            messageFileId: link.Get('ID') as string,
            artifactId: artifact.ID,
            fileId: upload.FileID,
            filename: input.filename,
            contentType: input.contentType,
            size: input.bytes.length,
        };
    }

    /** Lists files attached to a thread. */
    async listThreadFiles(threadId: string, systemUser: UserInfo): Promise<StoredFile[]> {
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'MJ_BizApps_SecureMessaging: Message Files',
            ExtraFilter: `ThreadID = '${threadId.replace(/'/g, "''")}'`,
            OrderBy: '__mj_CreatedAt ASC',
        }, systemUser);

        if (!result.Success) {
            throw new Error(result.ErrorMessage || 'Failed to load files');
        }

        return (result.Results as Record<string, unknown>[]).map(r => ({
            messageFileId: r.ID as string,
            artifactId: r.ArtifactID as string,
            fileId: r.FileID as string,
            filename: r.Filename as string,
            contentType: r.ContentType as string,
            size: Number(r.Size ?? 0),
        }));
    }

    /**
     * Loads the raw bytes + metadata of an artifact's latest version (file mode). Used by
     * integrations (e.g. e-signature) that need the actual document content.
     */
    async loadArtifactDocument(
        artifactId: string,
        systemUser: UserInfo
    ): Promise<{ bytes: Buffer; filename: string; contentType: string }> {
        // artifactId is caller-supplied (request body). Reject anything that isn't a UUID so it can
        // never be interpolated into the filter as SQL, and so it can't probe arbitrary artifacts.
        if (!isUuid(artifactId)) {
            throw new Error('Invalid artifact reference');
        }
        const rv = new RunView();
        const versionResult = await rv.RunView({
            EntityName: 'MJ: Artifact Versions',
            ExtraFilter: `ArtifactID = '${artifactId}'`,
            OrderBy: 'VersionNumber DESC',
            MaxRows: 1,
        }, systemUser);

        if (!versionResult.Success || versionResult.Results.length === 0) {
            throw new Error('Artifact has no versions');
        }
        const version = versionResult.Results[0] as Record<string, unknown>;
        const fileId = version.FileID as string | null;
        if (!fileId) {
            throw new Error('Artifact version is not stored as a file (ContentMode is not File)');
        }

        const md = new Metadata();
        const file = await md.GetEntityObject<MJFileEntity>('MJ: Files', systemUser);
        if (!(await file.Load(fileId))) {
            throw new Error('Underlying file record not found');
        }

        const engine = FileStorageEngine.Instance;
        await engine.Config(false, systemUser);
        const resolved = engine.ResolveStorageAccount();
        if (!resolved) {
            throw new Error('No file storage account is configured');
        }
        const driver = await engine.GetDriver(resolved.account.ID, systemUser);
        const bytes = await driver.GetObject({ fullPath: file.ProviderKey || file.Name });

        return {
            bytes,
            filename: (version.FileName as string) || file.Name,
            contentType: (version.MimeType as string) || file.ContentType || 'application/octet-stream',
        };
    }

    /**
     * True iff `artifactId` is attached (via a Message File link) to `threadId`. Used to confirm a
     * caller-supplied artifact actually belongs to the caller's thread before its bytes are read —
     * closes an IDOR where any artifact ID could otherwise be pulled through a thread-scoped action.
     */
    async artifactBelongsToThread(artifactId: string, threadId: string, systemUser: UserInfo): Promise<boolean> {
        if (!isUuid(artifactId) || !threadId) {
            return false;
        }
        const rv = new RunView();
        const result = await rv.RunView({
            EntityName: 'MJ_BizApps_SecureMessaging: Message Files',
            ExtraFilter: `ArtifactID = '${artifactId}' AND ThreadID = '${threadId.replace(/'/g, "''")}'`,
            Fields: ['ID'],
            MaxRows: 1,
            ResultType: 'simple',
        }, systemUser);
        return result.Success && result.Results.length > 0;
    }

    /**
     * Returns a pre-authenticated download URL for a stored file (by MessageFile ID),
     * resolving the underlying MJ: Files record and its storage provider.
     */
    async getDownloadUrl(messageFileId: string, threadId: string, systemUser: UserInfo): Promise<string> {
        // messageFileId is caller-supplied (route param). Reject anything that isn't a UUID: it is
        // interpolated into the filter, so a UUID guard both prevents SQL injection and stops the
        // ThreadID scope from being broken out of.
        if (!isUuid(messageFileId)) {
            throw new Error('File not found in this thread');
        }
        const rv = new RunView();
        const linkResult = await rv.RunView({
            EntityName: 'MJ_BizApps_SecureMessaging: Message Files',
            ExtraFilter: `ID = '${messageFileId}' AND ThreadID = '${threadId.replace(/'/g, "''")}'`,
        }, systemUser);

        if (!linkResult.Success || linkResult.Results.length === 0) {
            throw new Error('File not found in this thread');
        }
        const fileId = (linkResult.Results[0] as Record<string, unknown>).FileID as string;

        const md = new Metadata();
        const file = await md.GetEntityObject<MJFileEntity>('MJ: Files', systemUser);
        if (!(await file.Load(fileId))) {
            throw new Error('Underlying file record not found');
        }

        // Use the engine's INITIALIZED driver (built with the account's decrypted credential),
        // exactly as getFileBytes does. The standalone createDownloadUrl(provider, …) util builds
        // a credential-less, uninitialized driver (its `_client` is undefined) — which crashes on
        // providers like Box that need an authenticated client to resolve the path.
        const engine = FileStorageEngine.Instance;
        await engine.Config(false, systemUser);
        const resolved = engine.ResolveStorageAccount();
        if (!resolved) {
            throw new Error('No file storage account is configured');
        }
        const driver = await engine.GetDriver(resolved.account.ID, systemUser);
        return driver.CreatePreAuthDownloadUrl(file.ProviderKey || file.Name);
    }
}

let _fileStore: ArtifactFileStore | null = null;

/** Returns the singleton file store. */
export function getFileStore(): ArtifactFileStore {
    if (!_fileStore) {
        _fileStore = new ArtifactFileStore();
    }
    return _fileStore;
}
