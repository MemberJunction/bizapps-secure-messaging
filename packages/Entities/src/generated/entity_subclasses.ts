import { BaseEntity, EntitySaveOptions, EntityDeleteOptions, CompositeKey, ValidationResult, ValidationErrorInfo, ValidationErrorType, Metadata, ProviderType, DatabaseProviderBase } from "@memberjunction/core";
import { RegisterClass } from "@memberjunction/global";
import { z } from "zod";

export const loadModule = () => {
  // no-op, only used to ensure this file is a valid module and to allow easy loading
}

     
 
/**
 * zod schema definition for the entity MJ_BizApps_SecureMessaging: File Requests
 */
export const mjBizAppsSecureMessagingFileRequestSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PortalSessionID: z.string().describe(`
        * * Field Name: PortalSessionID
        * * Display Name: Portal Session ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Portal Sessions (vwPortalSessions.ID)`),
    ThreadID: z.string().describe(`
        * * Field Name: ThreadID
        * * Display Name: Thread ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Secure Threads (vwSecureThreads.ID)`),
    Title: z.string().describe(`
        * * Field Name: Title
        * * Display Name: Title
        * * SQL Data Type: nvarchar(255)`),
    Instructions: z.string().nullable().describe(`
        * * Field Name: Instructions
        * * Display Name: Instructions
        * * SQL Data Type: nvarchar(MAX)`),
    Status: z.union([z.literal('Cancelled'), z.literal('Expired'), z.literal('Fulfilled'), z.literal('Pending')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Expired
    *   * Fulfilled
    *   * Pending
        * * Description: Request lifecycle status: Pending (awaiting the contact), Fulfilled (files uploaded and the contact marked it complete), Cancelled (staff closed it out), or Expired (the DueAt deadline passed while still Pending). Only Pending requests appear as action callouts in the portal; terminal states collapse into thread history.`),
    RequestedByUserID: z.string().nullable().describe(`
        * * Field Name: RequestedByUserID
        * * Display Name: Requested By User ID
        * * SQL Data Type: uniqueidentifier`),
    DueAt: z.date().nullable().describe(`
        * * Field Name: DueAt
        * * Display Name: Due At
        * * SQL Data Type: datetimeoffset`),
    FulfilledAt: z.date().nullable().describe(`
        * * Field Name: FulfilledAt
        * * Display Name: Fulfilled At
        * * SQL Data Type: datetimeoffset`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsSecureMessagingFileRequestEntityType = z.infer<typeof mjBizAppsSecureMessagingFileRequestSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_SecureMessaging: Message Files
 */
export const mjBizAppsSecureMessagingMessageFileSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    SecureMessageID: z.string().nullable().describe(`
        * * Field Name: SecureMessageID
        * * Display Name: Secure Message ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Secure Messages (vwSecureMessages.ID)`),
    ExternalMessageID: z.string().nullable().describe(`
        * * Field Name: ExternalMessageID
        * * Display Name: External Message ID
        * * SQL Data Type: uniqueidentifier`),
    ThreadID: z.string().describe(`
        * * Field Name: ThreadID
        * * Display Name: Thread ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Secure Threads (vwSecureThreads.ID)`),
    ArtifactID: z.string().nullable().describe(`
        * * Field Name: ArtifactID
        * * Display Name: Artifact ID
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference to MJ: Artifacts.ID wrapping the uploaded file.`),
    FileID: z.string().nullable().describe(`
        * * Field Name: FileID
        * * Display Name: File ID
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference to MJ: Files.ID holding the bytes in the configured storage provider.`),
    Filename: z.string().describe(`
        * * Field Name: Filename
        * * Display Name: Filename
        * * SQL Data Type: nvarchar(500)`),
    ContentType: z.string().nullable().describe(`
        * * Field Name: ContentType
        * * Display Name: Content Type
        * * SQL Data Type: nvarchar(255)`),
    Size: z.number().nullable().describe(`
        * * Field Name: Size
        * * Display Name: Size
        * * SQL Data Type: bigint`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsSecureMessagingMessageFileEntityType = z.infer<typeof mjBizAppsSecureMessagingMessageFileSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_SecureMessaging: Portal Magic Links
 */
export const mjBizAppsSecureMessagingPortalMagicLinkSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PortalSessionID: z.string().describe(`
        * * Field Name: PortalSessionID
        * * Display Name: Portal Session ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Portal Sessions (vwPortalSessions.ID)`),
    TokenHash: z.string().describe(`
        * * Field Name: TokenHash
        * * Display Name: Token Hash
        * * SQL Data Type: nvarchar(128)
        * * Description: SHA-256 hash of the magic link token (sm_ml_ prefix). Raw token is never stored.`),
    Status: z.union([z.literal('Expired'), z.literal('Pending'), z.literal('Used')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Expired
    *   * Pending
    *   * Used
        * * Description: Magic link lifecycle status: Pending, Used, or Expired`),
    ExpiresAt: z.date().describe(`
        * * Field Name: ExpiresAt
        * * Display Name: Expires At
        * * SQL Data Type: datetimeoffset
        * * Description: When the magic link expires. Default is 15 minutes from creation.`),
    UsedAt: z.date().nullable().describe(`
        * * Field Name: UsedAt
        * * Display Name: Used At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp when the magic link was redeemed. NULL if not yet used.`),
    DeepLinkThreadID: z.string().nullable().describe(`
        * * Field Name: DeepLinkThreadID
        * * Display Name: Deep Link Thread ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Secure Threads (vwSecureThreads.ID)`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsSecureMessagingPortalMagicLinkEntityType = z.infer<typeof mjBizAppsSecureMessagingPortalMagicLinkSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_SecureMessaging: Portal Sessions
 */
export const mjBizAppsSecureMessagingPortalSessionSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ContactID: z.string().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact ID
        * * SQL Data Type: uniqueidentifier`),
    TokenHash: z.string().describe(`
        * * Field Name: TokenHash
        * * Display Name: Token Hash
        * * SQL Data Type: nvarchar(128)
        * * Description: SHA-256 hash of the opaque session token (sm_ prefix). Raw token is never stored.`),
    Status: z.union([z.literal('Active'), z.literal('Expired'), z.literal('Revoked')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * Revoked
        * * Description: Session lifecycle status: Active, Expired, or Revoked`),
    ExpiresAt: z.date().describe(`
        * * Field Name: ExpiresAt
        * * Display Name: Expires At
        * * SQL Data Type: datetimeoffset
        * * Description: When the session token expires. Default TTL is 7 days, extended on each access.`),
    LastAccessedAt: z.date().describe(`
        * * Field Name: LastAccessedAt
        * * Display Name: Last Accessed At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()
        * * Description: Last time the session was accessed. Used for session extension and cleanup.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsSecureMessagingPortalSessionEntityType = z.infer<typeof mjBizAppsSecureMessagingPortalSessionSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_SecureMessaging: Secure Messages
 */
export const mjBizAppsSecureMessagingSecureMessageSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    PortalSessionID: z.string().describe(`
        * * Field Name: PortalSessionID
        * * Display Name: Portal Session ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Portal Sessions (vwPortalSessions.ID)`),
    ThreadID: z.string().describe(`
        * * Field Name: ThreadID
        * * Display Name: Thread ID
        * * SQL Data Type: uniqueidentifier
        * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Secure Threads (vwSecureThreads.ID)`),
    PersonID: z.string().nullable().describe(`
        * * Field Name: PersonID
        * * Display Name: Person ID
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference to the person (e.g. MJ_BizApps_Common.People.ID). Not a hard FK so the schema stays standalone.`),
    Direction: z.union([z.literal('Inbound'), z.literal('Outbound')]).describe(`
        * * Field Name: Direction
        * * Display Name: Direction
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Inbound
    * * Value List Type: List
    * * Possible Values 
    *   * Inbound
    *   * Outbound
        * * Description: Direction of the message relative to the organization: Inbound (from contact) or Outbound (reply to contact).`),
    Sender: z.string().describe(`
        * * Field Name: Sender
        * * Display Name: Sender
        * * SQL Data Type: nvarchar(255)`),
    Recipient: z.string().describe(`
        * * Field Name: Recipient
        * * Display Name: Recipient
        * * SQL Data Type: nvarchar(255)`),
    Subject: z.string().nullable().describe(`
        * * Field Name: Subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(255)`),
    Content: z.string().describe(`
        * * Field Name: Content
        * * Display Name: Content
        * * SQL Data Type: nvarchar(MAX)`),
    IsSecure: z.boolean().describe(`
        * * Field Name: IsSecure
        * * Display Name: Is Secure
        * * SQL Data Type: bit
        * * Default Value: 1`),
    Status: z.union([z.literal('Failed'), z.literal('New'), z.literal('Read'), z.literal('Replied'), z.literal('Sent')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: New
    * * Value List Type: List
    * * Possible Values 
    *   * Failed
    *   * New
    *   * Read
    *   * Replied
    *   * Sent`),
    ExternalMessageID: z.string().nullable().describe(`
        * * Field Name: ExternalMessageID
        * * Display Name: External Message ID
        * * SQL Data Type: uniqueidentifier
        * * Description: When the Channel Messages adapter is active, holds the mirrored Channel Message ID so the AI pipeline can process the message. NULL in the self-contained path.`),
    ReceivedAt: z.date().describe(`
        * * Field Name: ReceivedAt
        * * Display Name: Received At
        * * SQL Data Type: datetimeoffset
        * * Default Value: sysdatetimeoffset()`),
    IsStarred: z.boolean().describe(`
        * * Field Name: IsStarred
        * * Display Name: Is Starred
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: When 1, this message is starred/flagged by staff for quick retrieval (shown under the Starred category). Per-message, staff-toggled.`),
    IsImported: z.boolean().describe(`
        * * Field Name: IsImported
        * * Display Name: Is Imported
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: When 1, this message was imported (copied) into the secure thread during a promotion/bridge from an insecure channel, rather than originating natively in the secure channel. Imported messages predate the switch to secure.`),
    SourceChannel: z.string().nullable().describe(`
        * * Field Name: SourceChannel
        * * Display Name: Source Channel
        * * SQL Data Type: nvarchar(50)
        * * Description: For imported messages, the insecure channel the message originated from (e.g. Email, SMS). NULL for messages that originated natively in the secure channel.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsSecureMessagingSecureMessageEntityType = z.infer<typeof mjBizAppsSecureMessagingSecureMessageSchema>;

/**
 * zod schema definition for the entity MJ_BizApps_SecureMessaging: Secure Threads
 */
export const mjBizAppsSecureMessagingSecureThreadSchema = z.object({
    ID: z.string().describe(`
        * * Field Name: ID
        * * Display Name: ID
        * * SQL Data Type: uniqueidentifier
        * * Default Value: newsequentialid()`),
    ContactID: z.string().describe(`
        * * Field Name: ContactID
        * * Display Name: Contact ID
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference to the external contact (MJ_BizApps_Common.Person.ID). Not a hard FK so the schema stays standalone.`),
    Subject: z.string().describe(`
        * * Field Name: Subject
        * * Display Name: Subject
        * * SQL Data Type: nvarchar(500)
        * * Description: The conversation subject line (TitanFile-channel style), set by staff at compose or derived at promotion.`),
    Status: z.union([z.literal('Active'), z.literal('Archived'), z.literal('Closed')]).describe(`
        * * Field Name: Status
        * * Display Name: Status
        * * SQL Data Type: nvarchar(20)
        * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Archived
    *   * Closed
        * * Description: Thread lifecycle: Active (open), Closed (contact-visible read-only), Archived (hidden from default lists). Contact-visible, unlike the old session-level archive flags.`),
    SourceChannel: z.string().nullable().describe(`
        * * Field Name: SourceChannel
        * * Display Name: Source Channel
        * * SQL Data Type: nvarchar(50)
        * * Description: NULL for threads that originated natively in the secure channel; the insecure channel name (e.g. Email, SMS) for threads created by promotion (PRD §9 bridges).`),
    CreatedByUserID: z.string().nullable().describe(`
        * * Field Name: CreatedByUserID
        * * Display Name: Created By User ID
        * * SQL Data Type: uniqueidentifier
        * * Description: Soft reference to the MJ user (staff) who created the thread; NULL for promoted/backfilled threads. Not a hard FK so the schema stays standalone.`),
    LastMessageAt: z.date().nullable().describe(`
        * * Field Name: LastMessageAt
        * * Display Name: Last Message At
        * * SQL Data Type: datetimeoffset
        * * Description: Timestamp of the most recent message in the thread (denormalized for inbox ordering).`),
    IsDeleted: z.boolean().describe(`
        * * Field Name: IsDeleted
        * * Display Name: Is Deleted
        * * SQL Data Type: bit
        * * Default Value: 0
        * * Description: Soft delete (staff Trash). Records are never hard-deleted — compliance/audit.`),
    __mj_CreatedAt: z.date().describe(`
        * * Field Name: __mj_CreatedAt
        * * Display Name: Created At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
    __mj_UpdatedAt: z.date().describe(`
        * * Field Name: __mj_UpdatedAt
        * * Display Name: Updated At
        * * SQL Data Type: datetimeoffset
        * * Default Value: getutcdate()`),
});

export type mjBizAppsSecureMessagingSecureThreadEntityType = z.infer<typeof mjBizAppsSecureMessagingSecureThreadSchema>;
 
 

/**
 * MJ_BizApps_SecureMessaging: File Requests - strongly typed entity sub-class
 * * Schema: __mj_BizAppsSecureMessaging
 * * Base Table: FileRequest
 * * Base View: vwFileRequests
 * * @description A request from staff for the external contact to securely upload one or more files. Fulfilled by uploading files (stored as MessageFile rows) and setting Status to Fulfilled.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_SecureMessaging: File Requests')
export class mjBizAppsSecureMessagingFileRequestEntity extends BaseEntity<mjBizAppsSecureMessagingFileRequestEntityType> {
    /**
    * Loads the MJ_BizApps_SecureMessaging: File Requests record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_SecureMessaging: File Requests record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsSecureMessagingFileRequestEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PortalSessionID
    * * Display Name: Portal Session ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Portal Sessions (vwPortalSessions.ID)
    */
    get PortalSessionID(): string {
        return this.Get('PortalSessionID');
    }
    set PortalSessionID(value: string) {
        this.Set('PortalSessionID', value);
    }

    /**
    * * Field Name: ThreadID
    * * Display Name: Thread ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Secure Threads (vwSecureThreads.ID)
    */
    get ThreadID(): string {
        return this.Get('ThreadID');
    }
    set ThreadID(value: string) {
        this.Set('ThreadID', value);
    }

    /**
    * * Field Name: Title
    * * Display Name: Title
    * * SQL Data Type: nvarchar(255)
    */
    get Title(): string {
        return this.Get('Title');
    }
    set Title(value: string) {
        this.Set('Title', value);
    }

    /**
    * * Field Name: Instructions
    * * Display Name: Instructions
    * * SQL Data Type: nvarchar(MAX)
    */
    get Instructions(): string | null {
        return this.Get('Instructions');
    }
    set Instructions(value: string | null) {
        this.Set('Instructions', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Cancelled
    *   * Expired
    *   * Fulfilled
    *   * Pending
    * * Description: Request lifecycle status: Pending (awaiting the contact), Fulfilled (files uploaded and the contact marked it complete), Cancelled (staff closed it out), or Expired (the DueAt deadline passed while still Pending). Only Pending requests appear as action callouts in the portal; terminal states collapse into thread history.
    */
    get Status(): 'Cancelled' | 'Expired' | 'Fulfilled' | 'Pending' {
        return this.Get('Status');
    }
    set Status(value: 'Cancelled' | 'Expired' | 'Fulfilled' | 'Pending') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: RequestedByUserID
    * * Display Name: Requested By User ID
    * * SQL Data Type: uniqueidentifier
    */
    get RequestedByUserID(): string | null {
        return this.Get('RequestedByUserID');
    }
    set RequestedByUserID(value: string | null) {
        this.Set('RequestedByUserID', value);
    }

    /**
    * * Field Name: DueAt
    * * Display Name: Due At
    * * SQL Data Type: datetimeoffset
    */
    get DueAt(): Date | null {
        return this.Get('DueAt');
    }
    set DueAt(value: Date | null) {
        this.Set('DueAt', value);
    }

    /**
    * * Field Name: FulfilledAt
    * * Display Name: Fulfilled At
    * * SQL Data Type: datetimeoffset
    */
    get FulfilledAt(): Date | null {
        return this.Get('FulfilledAt');
    }
    set FulfilledAt(value: Date | null) {
        this.Set('FulfilledAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_SecureMessaging: Message Files - strongly typed entity sub-class
 * * Schema: __mj_BizAppsSecureMessaging
 * * Base Table: MessageFile
 * * Base View: vwMessageFiles
 * * @description Links an uploaded file to a secure message. Bytes are stored in core MJ File Storage (MJ: Files) and wrapped as an MJ Artifact; this table holds references and display metadata only.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_SecureMessaging: Message Files')
export class mjBizAppsSecureMessagingMessageFileEntity extends BaseEntity<mjBizAppsSecureMessagingMessageFileEntityType> {
    /**
    * Loads the MJ_BizApps_SecureMessaging: Message Files record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_SecureMessaging: Message Files record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsSecureMessagingMessageFileEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: SecureMessageID
    * * Display Name: Secure Message ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Secure Messages (vwSecureMessages.ID)
    */
    get SecureMessageID(): string | null {
        return this.Get('SecureMessageID');
    }
    set SecureMessageID(value: string | null) {
        this.Set('SecureMessageID', value);
    }

    /**
    * * Field Name: ExternalMessageID
    * * Display Name: External Message ID
    * * SQL Data Type: uniqueidentifier
    */
    get ExternalMessageID(): string | null {
        return this.Get('ExternalMessageID');
    }
    set ExternalMessageID(value: string | null) {
        this.Set('ExternalMessageID', value);
    }

    /**
    * * Field Name: ThreadID
    * * Display Name: Thread ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Secure Threads (vwSecureThreads.ID)
    */
    get ThreadID(): string {
        return this.Get('ThreadID');
    }
    set ThreadID(value: string) {
        this.Set('ThreadID', value);
    }

    /**
    * * Field Name: ArtifactID
    * * Display Name: Artifact ID
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference to MJ: Artifacts.ID wrapping the uploaded file.
    */
    get ArtifactID(): string | null {
        return this.Get('ArtifactID');
    }
    set ArtifactID(value: string | null) {
        this.Set('ArtifactID', value);
    }

    /**
    * * Field Name: FileID
    * * Display Name: File ID
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference to MJ: Files.ID holding the bytes in the configured storage provider.
    */
    get FileID(): string | null {
        return this.Get('FileID');
    }
    set FileID(value: string | null) {
        this.Set('FileID', value);
    }

    /**
    * * Field Name: Filename
    * * Display Name: Filename
    * * SQL Data Type: nvarchar(500)
    */
    get Filename(): string {
        return this.Get('Filename');
    }
    set Filename(value: string) {
        this.Set('Filename', value);
    }

    /**
    * * Field Name: ContentType
    * * Display Name: Content Type
    * * SQL Data Type: nvarchar(255)
    */
    get ContentType(): string | null {
        return this.Get('ContentType');
    }
    set ContentType(value: string | null) {
        this.Set('ContentType', value);
    }

    /**
    * * Field Name: Size
    * * Display Name: Size
    * * SQL Data Type: bigint
    */
    get Size(): number | null {
        return this.Get('Size');
    }
    set Size(value: number | null) {
        this.Set('Size', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_SecureMessaging: Portal Magic Links - strongly typed entity sub-class
 * * Schema: __mj_BizAppsSecureMessaging
 * * Base Table: PortalMagicLink
 * * Base View: vwPortalMagicLinks
 * * @description Single-use magic links — the passwordless entry path. Short-lived (15 min default), redeems into a fresh session token, and may deep-link to a specific thread.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_SecureMessaging: Portal Magic Links')
export class mjBizAppsSecureMessagingPortalMagicLinkEntity extends BaseEntity<mjBizAppsSecureMessagingPortalMagicLinkEntityType> {
    /**
    * Loads the MJ_BizApps_SecureMessaging: Portal Magic Links record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_SecureMessaging: Portal Magic Links record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsSecureMessagingPortalMagicLinkEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PortalSessionID
    * * Display Name: Portal Session ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Portal Sessions (vwPortalSessions.ID)
    */
    get PortalSessionID(): string {
        return this.Get('PortalSessionID');
    }
    set PortalSessionID(value: string) {
        this.Set('PortalSessionID', value);
    }

    /**
    * * Field Name: TokenHash
    * * Display Name: Token Hash
    * * SQL Data Type: nvarchar(128)
    * * Description: SHA-256 hash of the magic link token (sm_ml_ prefix). Raw token is never stored.
    */
    get TokenHash(): string {
        return this.Get('TokenHash');
    }
    set TokenHash(value: string) {
        this.Set('TokenHash', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Pending
    * * Value List Type: List
    * * Possible Values 
    *   * Expired
    *   * Pending
    *   * Used
    * * Description: Magic link lifecycle status: Pending, Used, or Expired
    */
    get Status(): 'Expired' | 'Pending' | 'Used' {
        return this.Get('Status');
    }
    set Status(value: 'Expired' | 'Pending' | 'Used') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ExpiresAt
    * * Display Name: Expires At
    * * SQL Data Type: datetimeoffset
    * * Description: When the magic link expires. Default is 15 minutes from creation.
    */
    get ExpiresAt(): Date {
        return this.Get('ExpiresAt');
    }
    set ExpiresAt(value: Date) {
        this.Set('ExpiresAt', value);
    }

    /**
    * * Field Name: UsedAt
    * * Display Name: Used At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp when the magic link was redeemed. NULL if not yet used.
    */
    get UsedAt(): Date | null {
        return this.Get('UsedAt');
    }
    set UsedAt(value: Date | null) {
        this.Set('UsedAt', value);
    }

    /**
    * * Field Name: DeepLinkThreadID
    * * Display Name: Deep Link Thread ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Secure Threads (vwSecureThreads.ID)
    */
    get DeepLinkThreadID(): string | null {
        return this.Get('DeepLinkThreadID');
    }
    set DeepLinkThreadID(value: string | null) {
        this.Set('DeepLinkThreadID', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_SecureMessaging: Portal Sessions - strongly typed entity sub-class
 * * Schema: __mj_BizAppsSecureMessaging
 * * Base Table: PortalSession
 * * Base View: vwPortalSessions
 * * @description A contact's authenticated portal session. Sessions are per-contact: one active session grants access to all of that contact's secure threads. Authenticated via a hashed opaque token with a sliding TTL; revocable by staff.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_SecureMessaging: Portal Sessions')
export class mjBizAppsSecureMessagingPortalSessionEntity extends BaseEntity<mjBizAppsSecureMessagingPortalSessionEntityType> {
    /**
    * Loads the MJ_BizApps_SecureMessaging: Portal Sessions record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_SecureMessaging: Portal Sessions record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsSecureMessagingPortalSessionEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact ID
    * * SQL Data Type: uniqueidentifier
    */
    get ContactID(): string {
        return this.Get('ContactID');
    }
    set ContactID(value: string) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: TokenHash
    * * Display Name: Token Hash
    * * SQL Data Type: nvarchar(128)
    * * Description: SHA-256 hash of the opaque session token (sm_ prefix). Raw token is never stored.
    */
    get TokenHash(): string {
        return this.Get('TokenHash');
    }
    set TokenHash(value: string) {
        this.Set('TokenHash', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Expired
    *   * Revoked
    * * Description: Session lifecycle status: Active, Expired, or Revoked
    */
    get Status(): 'Active' | 'Expired' | 'Revoked' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Expired' | 'Revoked') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ExpiresAt
    * * Display Name: Expires At
    * * SQL Data Type: datetimeoffset
    * * Description: When the session token expires. Default TTL is 7 days, extended on each access.
    */
    get ExpiresAt(): Date {
        return this.Get('ExpiresAt');
    }
    set ExpiresAt(value: Date) {
        this.Set('ExpiresAt', value);
    }

    /**
    * * Field Name: LastAccessedAt
    * * Display Name: Last Accessed At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    * * Description: Last time the session was accessed. Used for session extension and cleanup.
    */
    get LastAccessedAt(): Date {
        return this.Get('LastAccessedAt');
    }
    set LastAccessedAt(value: Date) {
        this.Set('LastAccessedAt', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_SecureMessaging: Secure Messages - strongly typed entity sub-class
 * * Schema: __mj_BizAppsSecureMessaging
 * * Base Table: SecureMessage
 * * Base View: vwSecureMessages
 * * @description Self-contained secure message store. Each row is one inbound or outbound message in a thread. App-agnostic: does not require an external Channel Messages entity.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_SecureMessaging: Secure Messages')
export class mjBizAppsSecureMessagingSecureMessageEntity extends BaseEntity<mjBizAppsSecureMessagingSecureMessageEntityType> {
    /**
    * Loads the MJ_BizApps_SecureMessaging: Secure Messages record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_SecureMessaging: Secure Messages record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsSecureMessagingSecureMessageEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: PortalSessionID
    * * Display Name: Portal Session ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Portal Sessions (vwPortalSessions.ID)
    */
    get PortalSessionID(): string {
        return this.Get('PortalSessionID');
    }
    set PortalSessionID(value: string) {
        this.Set('PortalSessionID', value);
    }

    /**
    * * Field Name: ThreadID
    * * Display Name: Thread ID
    * * SQL Data Type: uniqueidentifier
    * * Related Entity/Foreign Key: MJ_BizApps_SecureMessaging: Secure Threads (vwSecureThreads.ID)
    */
    get ThreadID(): string {
        return this.Get('ThreadID');
    }
    set ThreadID(value: string) {
        this.Set('ThreadID', value);
    }

    /**
    * * Field Name: PersonID
    * * Display Name: Person ID
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference to the person (e.g. MJ_BizApps_Common.People.ID). Not a hard FK so the schema stays standalone.
    */
    get PersonID(): string | null {
        return this.Get('PersonID');
    }
    set PersonID(value: string | null) {
        this.Set('PersonID', value);
    }

    /**
    * * Field Name: Direction
    * * Display Name: Direction
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Inbound
    * * Value List Type: List
    * * Possible Values 
    *   * Inbound
    *   * Outbound
    * * Description: Direction of the message relative to the organization: Inbound (from contact) or Outbound (reply to contact).
    */
    get Direction(): 'Inbound' | 'Outbound' {
        return this.Get('Direction');
    }
    set Direction(value: 'Inbound' | 'Outbound') {
        this.Set('Direction', value);
    }

    /**
    * * Field Name: Sender
    * * Display Name: Sender
    * * SQL Data Type: nvarchar(255)
    */
    get Sender(): string {
        return this.Get('Sender');
    }
    set Sender(value: string) {
        this.Set('Sender', value);
    }

    /**
    * * Field Name: Recipient
    * * Display Name: Recipient
    * * SQL Data Type: nvarchar(255)
    */
    get Recipient(): string {
        return this.Get('Recipient');
    }
    set Recipient(value: string) {
        this.Set('Recipient', value);
    }

    /**
    * * Field Name: Subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(255)
    */
    get Subject(): string | null {
        return this.Get('Subject');
    }
    set Subject(value: string | null) {
        this.Set('Subject', value);
    }

    /**
    * * Field Name: Content
    * * Display Name: Content
    * * SQL Data Type: nvarchar(MAX)
    */
    get Content(): string {
        return this.Get('Content');
    }
    set Content(value: string) {
        this.Set('Content', value);
    }

    /**
    * * Field Name: IsSecure
    * * Display Name: Is Secure
    * * SQL Data Type: bit
    * * Default Value: 1
    */
    get IsSecure(): boolean {
        return this.Get('IsSecure');
    }
    set IsSecure(value: boolean) {
        this.Set('IsSecure', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: New
    * * Value List Type: List
    * * Possible Values 
    *   * Failed
    *   * New
    *   * Read
    *   * Replied
    *   * Sent
    */
    get Status(): 'Failed' | 'New' | 'Read' | 'Replied' | 'Sent' {
        return this.Get('Status');
    }
    set Status(value: 'Failed' | 'New' | 'Read' | 'Replied' | 'Sent') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: ExternalMessageID
    * * Display Name: External Message ID
    * * SQL Data Type: uniqueidentifier
    * * Description: When the Channel Messages adapter is active, holds the mirrored Channel Message ID so the AI pipeline can process the message. NULL in the self-contained path.
    */
    get ExternalMessageID(): string | null {
        return this.Get('ExternalMessageID');
    }
    set ExternalMessageID(value: string | null) {
        this.Set('ExternalMessageID', value);
    }

    /**
    * * Field Name: ReceivedAt
    * * Display Name: Received At
    * * SQL Data Type: datetimeoffset
    * * Default Value: sysdatetimeoffset()
    */
    get ReceivedAt(): Date {
        return this.Get('ReceivedAt');
    }
    set ReceivedAt(value: Date) {
        this.Set('ReceivedAt', value);
    }

    /**
    * * Field Name: IsStarred
    * * Display Name: Is Starred
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: When 1, this message is starred/flagged by staff for quick retrieval (shown under the Starred category). Per-message, staff-toggled.
    */
    get IsStarred(): boolean {
        return this.Get('IsStarred');
    }
    set IsStarred(value: boolean) {
        this.Set('IsStarred', value);
    }

    /**
    * * Field Name: IsImported
    * * Display Name: Is Imported
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: When 1, this message was imported (copied) into the secure thread during a promotion/bridge from an insecure channel, rather than originating natively in the secure channel. Imported messages predate the switch to secure.
    */
    get IsImported(): boolean {
        return this.Get('IsImported');
    }
    set IsImported(value: boolean) {
        this.Set('IsImported', value);
    }

    /**
    * * Field Name: SourceChannel
    * * Display Name: Source Channel
    * * SQL Data Type: nvarchar(50)
    * * Description: For imported messages, the insecure channel the message originated from (e.g. Email, SMS). NULL for messages that originated natively in the secure channel.
    */
    get SourceChannel(): string | null {
        return this.Get('SourceChannel');
    }
    set SourceChannel(value: string | null) {
        this.Set('SourceChannel', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}


/**
 * MJ_BizApps_SecureMessaging: Secure Threads - strongly typed entity sub-class
 * * Schema: __mj_BizAppsSecureMessaging
 * * Base Table: SecureThread
 * * Base View: vwSecureThreads
 * * @description A first-class secure conversation (thread) between the organization and one external contact. Owns the subject, lifecycle status, and all messages/files/requests via FKs. The unit of the contact portal inbox; magic links deep-link into a thread.
 * * Primary Key: ID
 * @extends {BaseEntity}
 * @class
 * @public
 */
@RegisterClass(BaseEntity, 'MJ_BizApps_SecureMessaging: Secure Threads')
export class mjBizAppsSecureMessagingSecureThreadEntity extends BaseEntity<mjBizAppsSecureMessagingSecureThreadEntityType> {
    /**
    * Loads the MJ_BizApps_SecureMessaging: Secure Threads record from the database
    * @param ID: string - primary key value to load the MJ_BizApps_SecureMessaging: Secure Threads record.
    * @param EntityRelationshipsToLoad - (optional) the relationships to load
    * @returns {Promise<boolean>} - true if successful, false otherwise
    * @public
    * @async
    * @memberof mjBizAppsSecureMessagingSecureThreadEntity
    * @method
    * @override
    */
    public async Load(ID: string, EntityRelationshipsToLoad?: string[]) : Promise<boolean> {
        const compositeKey: CompositeKey = new CompositeKey();
        compositeKey.KeyValuePairs.push({ FieldName: 'ID', Value: ID });
        return await super.InnerLoad(compositeKey, EntityRelationshipsToLoad);
    }

    /**
    * * Field Name: ID
    * * Display Name: ID
    * * SQL Data Type: uniqueidentifier
    * * Default Value: newsequentialid()
    */
    get ID(): string {
        return this.Get('ID');
    }
    set ID(value: string) {
        this.Set('ID', value);
    }

    /**
    * * Field Name: ContactID
    * * Display Name: Contact ID
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference to the external contact (MJ_BizApps_Common.Person.ID). Not a hard FK so the schema stays standalone.
    */
    get ContactID(): string {
        return this.Get('ContactID');
    }
    set ContactID(value: string) {
        this.Set('ContactID', value);
    }

    /**
    * * Field Name: Subject
    * * Display Name: Subject
    * * SQL Data Type: nvarchar(500)
    * * Description: The conversation subject line (TitanFile-channel style), set by staff at compose or derived at promotion.
    */
    get Subject(): string {
        return this.Get('Subject');
    }
    set Subject(value: string) {
        this.Set('Subject', value);
    }

    /**
    * * Field Name: Status
    * * Display Name: Status
    * * SQL Data Type: nvarchar(20)
    * * Default Value: Active
    * * Value List Type: List
    * * Possible Values 
    *   * Active
    *   * Archived
    *   * Closed
    * * Description: Thread lifecycle: Active (open), Closed (contact-visible read-only), Archived (hidden from default lists). Contact-visible, unlike the old session-level archive flags.
    */
    get Status(): 'Active' | 'Archived' | 'Closed' {
        return this.Get('Status');
    }
    set Status(value: 'Active' | 'Archived' | 'Closed') {
        this.Set('Status', value);
    }

    /**
    * * Field Name: SourceChannel
    * * Display Name: Source Channel
    * * SQL Data Type: nvarchar(50)
    * * Description: NULL for threads that originated natively in the secure channel; the insecure channel name (e.g. Email, SMS) for threads created by promotion (PRD §9 bridges).
    */
    get SourceChannel(): string | null {
        return this.Get('SourceChannel');
    }
    set SourceChannel(value: string | null) {
        this.Set('SourceChannel', value);
    }

    /**
    * * Field Name: CreatedByUserID
    * * Display Name: Created By User ID
    * * SQL Data Type: uniqueidentifier
    * * Description: Soft reference to the MJ user (staff) who created the thread; NULL for promoted/backfilled threads. Not a hard FK so the schema stays standalone.
    */
    get CreatedByUserID(): string | null {
        return this.Get('CreatedByUserID');
    }
    set CreatedByUserID(value: string | null) {
        this.Set('CreatedByUserID', value);
    }

    /**
    * * Field Name: LastMessageAt
    * * Display Name: Last Message At
    * * SQL Data Type: datetimeoffset
    * * Description: Timestamp of the most recent message in the thread (denormalized for inbox ordering).
    */
    get LastMessageAt(): Date | null {
        return this.Get('LastMessageAt');
    }
    set LastMessageAt(value: Date | null) {
        this.Set('LastMessageAt', value);
    }

    /**
    * * Field Name: IsDeleted
    * * Display Name: Is Deleted
    * * SQL Data Type: bit
    * * Default Value: 0
    * * Description: Soft delete (staff Trash). Records are never hard-deleted — compliance/audit.
    */
    get IsDeleted(): boolean {
        return this.Get('IsDeleted');
    }
    set IsDeleted(value: boolean) {
        this.Set('IsDeleted', value);
    }

    /**
    * * Field Name: __mj_CreatedAt
    * * Display Name: Created At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_CreatedAt(): Date {
        return this.Get('__mj_CreatedAt');
    }

    /**
    * * Field Name: __mj_UpdatedAt
    * * Display Name: Updated At
    * * SQL Data Type: datetimeoffset
    * * Default Value: getutcdate()
    */
    get __mj_UpdatedAt(): Date {
        return this.Get('__mj_UpdatedAt');
    }
}
