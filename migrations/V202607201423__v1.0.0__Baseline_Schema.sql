-- =====================================================================================
-- MJ Secure Messaging — v1.0 baseline schema
--
-- The complete __mj_BizAppsSecureMessaging schema in one pass (squashed from the
-- pre-release migration chain; the app first ships at v1.0, so there is no upgrade
-- path to preserve). Model (docs/PRD.md):
--
--   SecureThread     — a first-class conversation between the org and ONE contact.
--                      Subject line, lifecycle (Active/Closed/Archived), soft delete.
--                      Everything else FKs to it; magic links deep-link into it.
--   PortalSession    — authenticates the CONTACT (not a thread): one active session
--                      grants portal access to all of that contact's threads.
--                      Opaque token, SHA-256 hashed, sliding TTL, revocable.
--   PortalMagicLink  — single-use, short-lived links that redeem into a fresh session
--                      token; optionally deep-link to a specific thread.
--   SecureMessage    — the self-contained message store (no external Channel Messages
--                      dependency); provenance flags mark messages imported by the
--                      promote bridge.
--   MessageFile      — links an uploaded file to a thread/message. Bytes live in core
--                      MJ File Storage (MJ: Files) wrapped as MJ Artifacts; this table
--                      holds references only.
--   FileRequest      — staff ask the contact for documents; full lifecycle
--                      (Pending → Fulfilled | Cancelled | Expired).
--
-- E-signature is handled by the core MJ eSignature subsystem (@memberjunction/esignature);
-- a signature request links back to its SecureThread via the engine's polymorphic
-- EntityID/RecordID, so this schema defines no signature table.
--
-- ContactID / CreatedByUserID / PersonID are SOFT references (no cross-schema FK) so the
-- schema stays standalone; contacts resolve against MJ_BizApps_Common.Person by default.
-- Per MJ convention, CodeGen owns __mj timestamp columns, FK indexes, views, and SPs —
-- none of those appear here.
-- =====================================================================================

-- ── SecureThread ─────────────────────────────────────────────────────────────────────
CREATE TABLE [${flyway:defaultSchema}].[SecureThread] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ContactID] UNIQUEIDENTIFIER NOT NULL,
    [Subject] NVARCHAR(500) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [SourceChannel] NVARCHAR(50) NULL,
    [CreatedByUserID] UNIQUEIDENTIFIER NULL,
    [LastMessageAt] DATETIMEOFFSET NULL,
    [IsDeleted] BIT NOT NULL DEFAULT 0,
    CONSTRAINT [PK_SecureThread] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_SecureThread_Status] CHECK ([Status] IN ('Active','Closed','Archived'))
);

-- ── PortalSession ────────────────────────────────────────────────────────────────────
CREATE TABLE [${flyway:defaultSchema}].[PortalSession] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ContactID] UNIQUEIDENTIFIER NOT NULL,
    [TokenHash] NVARCHAR(128) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [ExpiresAt] DATETIMEOFFSET NOT NULL,
    [LastAccessedAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT [PK_PortalSession] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_PortalSession_Status] CHECK ([Status] IN ('Active', 'Expired', 'Revoked'))
);

-- ── PortalMagicLink ──────────────────────────────────────────────────────────────────
CREATE TABLE [${flyway:defaultSchema}].[PortalMagicLink] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PortalSessionID] UNIQUEIDENTIFIER NOT NULL,
    [TokenHash] NVARCHAR(128) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [ExpiresAt] DATETIMEOFFSET NOT NULL,
    [UsedAt] DATETIMEOFFSET NULL,
    [DeepLinkThreadID] UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_PortalMagicLink] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_PortalMagicLink_Status] CHECK ([Status] IN ('Pending', 'Used', 'Expired')),
    CONSTRAINT [FK_PortalMagicLink_PortalSession] FOREIGN KEY ([PortalSessionID]) REFERENCES [${flyway:defaultSchema}].[PortalSession]([ID]),
    CONSTRAINT [FK_PortalMagicLink_SecureThread] FOREIGN KEY ([DeepLinkThreadID]) REFERENCES [${flyway:defaultSchema}].[SecureThread]([ID])
);

-- ── SecureMessage ────────────────────────────────────────────────────────────────────
CREATE TABLE [${flyway:defaultSchema}].[SecureMessage] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PortalSessionID] UNIQUEIDENTIFIER NOT NULL,
    [ThreadID] UNIQUEIDENTIFIER NOT NULL,
    [PersonID] UNIQUEIDENTIFIER NULL,
    [Direction] NVARCHAR(20) NOT NULL DEFAULT 'Inbound',
    [Sender] NVARCHAR(255) NOT NULL,
    [Recipient] NVARCHAR(255) NOT NULL DEFAULT '',
    [Subject] NVARCHAR(255) NULL,
    [Content] NVARCHAR(MAX) NOT NULL,
    [IsSecure] BIT NOT NULL DEFAULT 1,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'New',
    [ExternalMessageID] UNIQUEIDENTIFIER NULL,
    [ReceivedAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    [IsStarred] BIT NOT NULL DEFAULT 0,
    [IsImported] BIT NOT NULL DEFAULT 0,
    [SourceChannel] NVARCHAR(50) NULL,
    CONSTRAINT [PK_SecureMessage] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_SecureMessage_Direction] CHECK ([Direction] IN ('Inbound', 'Outbound')),
    CONSTRAINT [CK_SecureMessage_Status] CHECK ([Status] IN ('New', 'Read', 'Replied', 'Sent', 'Failed')),
    CONSTRAINT [FK_SecureMessage_PortalSession] FOREIGN KEY ([PortalSessionID]) REFERENCES [${flyway:defaultSchema}].[PortalSession]([ID]),
    CONSTRAINT [FK_SecureMessage_SecureThread] FOREIGN KEY ([ThreadID]) REFERENCES [${flyway:defaultSchema}].[SecureThread]([ID])
);

-- ── MessageFile ──────────────────────────────────────────────────────────────────────
CREATE TABLE [${flyway:defaultSchema}].[MessageFile] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [SecureMessageID] UNIQUEIDENTIFIER NULL,
    [ExternalMessageID] UNIQUEIDENTIFIER NULL,
    [ThreadID] UNIQUEIDENTIFIER NOT NULL,
    [ArtifactID] UNIQUEIDENTIFIER NULL,
    [FileID] UNIQUEIDENTIFIER NULL,
    [Filename] NVARCHAR(500) NOT NULL,
    [ContentType] NVARCHAR(255) NULL,
    [Size] BIGINT NULL,
    CONSTRAINT [PK_MessageFile] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_MessageFile_SecureMessage] FOREIGN KEY ([SecureMessageID]) REFERENCES [${flyway:defaultSchema}].[SecureMessage]([ID]),
    CONSTRAINT [FK_MessageFile_SecureThread] FOREIGN KEY ([ThreadID]) REFERENCES [${flyway:defaultSchema}].[SecureThread]([ID])
);

-- ── FileRequest ──────────────────────────────────────────────────────────────────────
CREATE TABLE [${flyway:defaultSchema}].[FileRequest] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PortalSessionID] UNIQUEIDENTIFIER NOT NULL,
    [ThreadID] UNIQUEIDENTIFIER NOT NULL,
    [Title] NVARCHAR(255) NOT NULL,
    [Instructions] NVARCHAR(MAX) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [RequestedByUserID] UNIQUEIDENTIFIER NULL,
    [DueAt] DATETIMEOFFSET NULL,
    [FulfilledAt] DATETIMEOFFSET NULL,
    CONSTRAINT [PK_FileRequest] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_FileRequest_Status] CHECK ([Status] IN ('Pending', 'Fulfilled', 'Cancelled', 'Expired')),
    CONSTRAINT [FK_FileRequest_PortalSession] FOREIGN KEY ([PortalSessionID]) REFERENCES [${flyway:defaultSchema}].[PortalSession]([ID]),
    CONSTRAINT [FK_FileRequest_SecureThread] FOREIGN KEY ([ThreadID]) REFERENCES [${flyway:defaultSchema}].[SecureThread]([ID])
);
GO

-- =====================================================================================
-- Extended properties (CodeGen reads these as entity/field descriptions)
-- =====================================================================================

-- SecureThread
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'A first-class secure conversation (thread) between the organization and one external contact. Owns the subject, lifecycle status, and all messages/files/requests via FKs. The unit of the contact portal inbox; magic links deep-link into a thread.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureThread';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Soft reference to the external contact (MJ_BizApps_Common.Person.ID). Not a hard FK so the schema stays standalone.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'ContactID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The conversation subject line (TitanFile-channel style), set by staff at compose or derived at promotion.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'Subject';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Thread lifecycle: Active (open), Closed (contact-visible read-only), Archived (hidden from default lists). Contact-visible, unlike the old session-level archive flags.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'NULL for threads that originated natively in the secure channel; the insecure channel name (e.g. Email, SMS) for threads created by promotion (PRD §9 bridges).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'SourceChannel';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Soft reference to the MJ user (staff) who created the thread; NULL for promoted/backfilled threads. Not a hard FK so the schema stays standalone.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'CreatedByUserID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Timestamp of the most recent message in the thread (denormalized for inbox ordering).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'LastMessageAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Soft delete (staff Trash). Records are never hard-deleted — compliance/audit.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'IsDeleted';

-- PortalSession
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'A contact''s authenticated portal session. Sessions are per-contact: one active session grants access to all of that contact''s secure threads. Authenticated via a hashed opaque token with a sliding TTL; revocable by staff.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PortalSession';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'SHA-256 hash of the opaque session token (sm_ prefix). Raw token is never stored.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PortalSession', @level2type = N'COLUMN', @level2name = N'TokenHash';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Session lifecycle status: Active, Expired, or Revoked',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PortalSession', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the session token expires. Default TTL is 7 days, extended on each access.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PortalSession', @level2type = N'COLUMN', @level2name = N'ExpiresAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Last time the session was accessed. Used for session extension and cleanup.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PortalSession', @level2type = N'COLUMN', @level2name = N'LastAccessedAt';

-- PortalMagicLink
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Single-use magic links — the passwordless entry path. Short-lived (15 min default), redeems into a fresh session token, and may deep-link to a specific thread.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PortalMagicLink';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'SHA-256 hash of the magic link token (sm_ml_ prefix). Raw token is never stored.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PortalMagicLink', @level2type = N'COLUMN', @level2name = N'TokenHash';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Magic link lifecycle status: Pending, Used, or Expired',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PortalMagicLink', @level2type = N'COLUMN', @level2name = N'Status';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the magic link expires. Default is 15 minutes from creation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PortalMagicLink', @level2type = N'COLUMN', @level2name = N'ExpiresAt';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Timestamp when the magic link was redeemed. NULL if not yet used.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'PortalMagicLink', @level2type = N'COLUMN', @level2name = N'UsedAt';

-- SecureMessage
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Self-contained secure message store. Each row is one inbound or outbound message in a thread. App-agnostic: does not require an external Channel Messages entity.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureMessage';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Soft reference to the person (e.g. MJ_BizApps_Common.People.ID). Not a hard FK so the schema stays standalone.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureMessage', @level2type = N'COLUMN', @level2name = N'PersonID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Direction of the message relative to the organization: Inbound (from contact) or Outbound (reply to contact).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureMessage', @level2type = N'COLUMN', @level2name = N'Direction';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When the Channel Messages adapter is active, holds the mirrored Channel Message ID so the AI pipeline can process the message. NULL in the self-contained path.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureMessage', @level2type = N'COLUMN', @level2name = N'ExternalMessageID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When 1, this message is starred/flagged by staff for quick retrieval (shown under the Starred category). Per-message, staff-toggled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureMessage', @level2type = N'COLUMN', @level2name = N'IsStarred';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'When 1, this message was imported (copied) into the secure thread during a promotion/bridge from an insecure channel, rather than originating natively in the secure channel. Imported messages predate the switch to secure.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureMessage', @level2type = N'COLUMN', @level2name = N'IsImported';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'For imported messages, the insecure channel the message originated from (e.g. Email, SMS). NULL for messages that originated natively in the secure channel.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'SecureMessage', @level2type = N'COLUMN', @level2name = N'SourceChannel';

-- MessageFile
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Links an uploaded file to a secure message. Bytes are stored in core MJ File Storage (MJ: Files) and wrapped as an MJ Artifact; this table holds references and display metadata only.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MessageFile';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Soft reference to MJ: Artifacts.ID wrapping the uploaded file.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MessageFile', @level2type = N'COLUMN', @level2name = N'ArtifactID';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Soft reference to MJ: Files.ID holding the bytes in the configured storage provider.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'MessageFile', @level2type = N'COLUMN', @level2name = N'FileID';

-- FileRequest
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'A request from staff for the external contact to securely upload one or more files. Fulfilled by uploading files (stored as MessageFile rows) and setting Status to Fulfilled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FileRequest';
EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Request lifecycle status: Pending (awaiting the contact), Fulfilled (files uploaded and the contact marked it complete), Cancelled (staff closed it out), or Expired (the DueAt deadline passed while still Pending). Only Pending requests appear as action callouts in the portal; terminal states collapse into thread history.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'FileRequest', @level2type = N'COLUMN', @level2name = N'Status';
GO


-- =====================================================================================
-- Captured CodeGen run (metadata registration)
--
-- Appended verbatim from the CodeGen output produced against a fresh database running
-- ONLY the DDL above (see migrations/CLAUDE.md — "Baseline + captured-CodeGen pattern").
-- Registers the six entities with deterministic hardcoded IDs, their fields / value
-- lists / permissions / relationships, the schema Explorer application, __mj timestamp
-- columns, FK indexes, base views, and CRUD stored procedures — so every install
-- replays identical metadata without CodeGen having to invent it.
-- NOTE: '__mj_BizAppsCommon' below is intentionally a hardcoded literal (its schema
-- name is fixed regardless of the consumer's core schema name — see CLAUDE.md fixup).
-- =====================================================================================
/* SQL generated to create new entity MJ_BizApps_SecureMessaging: Secure Threads */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '1409049b-3e4a-4d8d-81ef-e70d9ce50a88',
         'MJ_BizApps_SecureMessaging: Secure Threads',
         'Secure Threads',
         'A first-class secure conversation (thread) between the organization and one external contact. Owns the subject, lifecycle status, and all messages/files/requests via FKs. The unit of the contact portal inbox; magic links deep-link into a thread.',
         NULL,
         'SecureThread',
         'vwSecureThreads',
         '${flyway:defaultSchema}',
         1,
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to create new application ${flyway:defaultSchema} */
INSERT INTO [${mjSchema}].[Application] (ID, Name, Description, SchemaAutoAddNewEntities, Path, AutoUpdatePath)
                       VALUES ('bbdffcbb-996c-4e99-9edc-e95983088738', '${flyway:defaultSchema}', 'Generated for schema', '${flyway:defaultSchema}', 'mjbizappssecuremessaging', 1);

/* Adding role UI to application ${flyway:defaultSchema} */
INSERT INTO [${mjSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('bbdffcbb-996c-4e99-9edc-e95983088738', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0);

/* Adding role Developer to application ${flyway:defaultSchema} */
INSERT INTO [${mjSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('bbdffcbb-996c-4e99-9edc-e95983088738', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1);

/* Adding role Integration to application ${flyway:defaultSchema} */
INSERT INTO [${mjSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('bbdffcbb-996c-4e99-9edc-e95983088738', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0);

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Secure Threads to application ID: 'bbdffcbb-996c-4e99-9edc-e95983088738' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('bbdffcbb-996c-4e99-9edc-e95983088738', '1409049b-3e4a-4d8d-81ef-e70d9ce50a88', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'bbdffcbb-996c-4e99-9edc-e95983088738'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Threads for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1409049b-3e4a-4d8d-81ef-e70d9ce50a88', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Threads for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1409049b-3e4a-4d8d-81ef-e70d9ce50a88', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Threads for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('1409049b-3e4a-4d8d-81ef-e70d9ce50a88', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_SecureMessaging: Portal Sessions */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '8a83c1e4-f2cb-4daa-87b5-fa9573a2c1f9',
         'MJ_BizApps_SecureMessaging: Portal Sessions',
         'Portal Sessions',
         'A contact''s authenticated portal session. Sessions are per-contact: one active session grants access to all of that contact''s secure threads. Authenticated via a hashed opaque token with a sliding TTL; revocable by staff.',
         NULL,
         'PortalSession',
         'vwPortalSessions',
         '${flyway:defaultSchema}',
         1,
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Portal Sessions to application ID: 'BBDFFCBB-996C-4E99-9EDC-E95983088738' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BBDFFCBB-996C-4E99-9EDC-E95983088738', '8a83c1e4-f2cb-4daa-87b5-fa9573a2c1f9', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BBDFFCBB-996C-4E99-9EDC-E95983088738'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Sessions for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8a83c1e4-f2cb-4daa-87b5-fa9573a2c1f9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Sessions for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8a83c1e4-f2cb-4daa-87b5-fa9573a2c1f9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Sessions for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('8a83c1e4-f2cb-4daa-87b5-fa9573a2c1f9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_SecureMessaging: Portal Magic Links */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '2b2e8762-39b4-488d-953c-ba1169e774d1',
         'MJ_BizApps_SecureMessaging: Portal Magic Links',
         'Portal Magic Links',
         'Single-use magic links — the passwordless entry path. Short-lived (15 min default), redeems into a fresh session token, and may deep-link to a specific thread.',
         NULL,
         'PortalMagicLink',
         'vwPortalMagicLinks',
         '${flyway:defaultSchema}',
         1,
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Portal Magic Links to application ID: 'BBDFFCBB-996C-4E99-9EDC-E95983088738' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BBDFFCBB-996C-4E99-9EDC-E95983088738', '2b2e8762-39b4-488d-953c-ba1169e774d1', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BBDFFCBB-996C-4E99-9EDC-E95983088738'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Magic Links for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2b2e8762-39b4-488d-953c-ba1169e774d1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Magic Links for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2b2e8762-39b4-488d-953c-ba1169e774d1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Magic Links for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('2b2e8762-39b4-488d-953c-ba1169e774d1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_SecureMessaging: Secure Messages */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '95a23eed-0c13-4d65-965c-fd40c371c870',
         'MJ_BizApps_SecureMessaging: Secure Messages',
         'Secure Messages',
         'Self-contained secure message store. Each row is one inbound or outbound message in a thread. App-agnostic: does not require an external Channel Messages entity.',
         NULL,
         'SecureMessage',
         'vwSecureMessages',
         '${flyway:defaultSchema}',
         1,
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Secure Messages to application ID: 'BBDFFCBB-996C-4E99-9EDC-E95983088738' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BBDFFCBB-996C-4E99-9EDC-E95983088738', '95a23eed-0c13-4d65-965c-fd40c371c870', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BBDFFCBB-996C-4E99-9EDC-E95983088738'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Messages for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('95a23eed-0c13-4d65-965c-fd40c371c870', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Messages for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('95a23eed-0c13-4d65-965c-fd40c371c870', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Messages for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('95a23eed-0c13-4d65-965c-fd40c371c870', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_SecureMessaging: Message Files */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'c08c5b36-fffd-455b-849e-9481c8e1286c',
         'MJ_BizApps_SecureMessaging: Message Files',
         'Message Files',
         'Links an uploaded file to a secure message. Bytes are stored in core MJ File Storage (MJ: Files) and wrapped as an MJ Artifact; this table holds references and display metadata only.',
         NULL,
         'MessageFile',
         'vwMessageFiles',
         '${flyway:defaultSchema}',
         1,
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Message Files to application ID: 'BBDFFCBB-996C-4E99-9EDC-E95983088738' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BBDFFCBB-996C-4E99-9EDC-E95983088738', 'c08c5b36-fffd-455b-849e-9481c8e1286c', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BBDFFCBB-996C-4E99-9EDC-E95983088738'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Message Files for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c08c5b36-fffd-455b-849e-9481c8e1286c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Message Files for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c08c5b36-fffd-455b-849e-9481c8e1286c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Message Files for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('c08c5b36-fffd-455b-849e-9481c8e1286c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to create new entity MJ_BizApps_SecureMessaging: File Requests */

      INSERT INTO [${mjSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         '92b5fc8b-0f4c-47dc-b57d-5a56ff77fc27',
         'MJ_BizApps_SecureMessaging: File Requests',
         'File Requests',
         'A request from staff for the external contact to securely upload one or more files. Fulfilled by uploading files (stored as MessageFile rows) and setting Status to Fulfilled.',
         NULL,
         'FileRequest',
         'vwFileRequests',
         '${flyway:defaultSchema}',
         1,
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: File Requests to application ID: 'BBDFFCBB-996C-4E99-9EDC-E95983088738' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('BBDFFCBB-996C-4E99-9EDC-E95983088738', '92b5fc8b-0f4c-47dc-b57d-5a56ff77fc27', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'BBDFFCBB-996C-4E99-9EDC-E95983088738'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: File Requests for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('92b5fc8b-0f4c-47dc-b57d-5a56ff77fc27', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: File Requests for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('92b5fc8b-0f4c-47dc-b57d-5a56ff77fc27', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: File Requests for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('92b5fc8b-0f4c-47dc-b57d-5a56ff77fc27', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon';

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FileRequest */
ALTER TABLE [${flyway:defaultSchema}].[FileRequest] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FileRequest */
UPDATE [${flyway:defaultSchema}].[FileRequest] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FileRequest */
ALTER TABLE [${flyway:defaultSchema}].[FileRequest] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.FileRequest */
ALTER TABLE [${flyway:defaultSchema}].[FileRequest] ADD CONSTRAINT [DF___mj_BizAppsSecureMessaging_FileRequest___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FileRequest */
ALTER TABLE [${flyway:defaultSchema}].[FileRequest] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FileRequest */
UPDATE [${flyway:defaultSchema}].[FileRequest] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FileRequest */
ALTER TABLE [${flyway:defaultSchema}].[FileRequest] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.FileRequest */
ALTER TABLE [${flyway:defaultSchema}].[FileRequest] ADD CONSTRAINT [DF___mj_BizAppsSecureMessaging_FileRequest___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MessageFile */
ALTER TABLE [${flyway:defaultSchema}].[MessageFile] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MessageFile */
UPDATE [${flyway:defaultSchema}].[MessageFile] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MessageFile */
ALTER TABLE [${flyway:defaultSchema}].[MessageFile] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.MessageFile */
ALTER TABLE [${flyway:defaultSchema}].[MessageFile] ADD CONSTRAINT [DF___mj_BizAppsSecureMessaging_MessageFile___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MessageFile */
ALTER TABLE [${flyway:defaultSchema}].[MessageFile] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MessageFile */
UPDATE [${flyway:defaultSchema}].[MessageFile] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MessageFile */
ALTER TABLE [${flyway:defaultSchema}].[MessageFile] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.MessageFile */
ALTER TABLE [${flyway:defaultSchema}].[MessageFile] ADD CONSTRAINT [DF___mj_BizAppsSecureMessaging_MessageFile___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PortalMagicLink */
ALTER TABLE [${flyway:defaultSchema}].[PortalMagicLink] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PortalMagicLink */
UPDATE [${flyway:defaultSchema}].[PortalMagicLink] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PortalMagicLink */
ALTER TABLE [${flyway:defaultSchema}].[PortalMagicLink] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PortalMagicLink */
ALTER TABLE [${flyway:defaultSchema}].[PortalMagicLink] ADD CONSTRAINT [DF___mj_BizAppsSecureMessaging_PortalMagicLink___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PortalMagicLink */
ALTER TABLE [${flyway:defaultSchema}].[PortalMagicLink] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PortalMagicLink */
UPDATE [${flyway:defaultSchema}].[PortalMagicLink] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PortalMagicLink */
ALTER TABLE [${flyway:defaultSchema}].[PortalMagicLink] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PortalMagicLink */
ALTER TABLE [${flyway:defaultSchema}].[PortalMagicLink] ADD CONSTRAINT [DF___mj_BizAppsSecureMessaging_PortalMagicLink___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SecureThread */
ALTER TABLE [${flyway:defaultSchema}].[SecureThread] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SecureThread */
UPDATE [${flyway:defaultSchema}].[SecureThread] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SecureThread */
ALTER TABLE [${flyway:defaultSchema}].[SecureThread] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SecureThread */
ALTER TABLE [${flyway:defaultSchema}].[SecureThread] ADD CONSTRAINT [DF___mj_BizAppsSecureMessaging_SecureThread___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SecureThread */
ALTER TABLE [${flyway:defaultSchema}].[SecureThread] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SecureThread */
UPDATE [${flyway:defaultSchema}].[SecureThread] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SecureThread */
ALTER TABLE [${flyway:defaultSchema}].[SecureThread] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SecureThread */
ALTER TABLE [${flyway:defaultSchema}].[SecureThread] ADD CONSTRAINT [DF___mj_BizAppsSecureMessaging_SecureThread___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PortalSession */
ALTER TABLE [${flyway:defaultSchema}].[PortalSession] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PortalSession */
UPDATE [${flyway:defaultSchema}].[PortalSession] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PortalSession */
ALTER TABLE [${flyway:defaultSchema}].[PortalSession] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.PortalSession */
ALTER TABLE [${flyway:defaultSchema}].[PortalSession] ADD CONSTRAINT [DF___mj_BizAppsSecureMessaging_PortalSession___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PortalSession */
ALTER TABLE [${flyway:defaultSchema}].[PortalSession] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PortalSession */
UPDATE [${flyway:defaultSchema}].[PortalSession] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PortalSession */
ALTER TABLE [${flyway:defaultSchema}].[PortalSession] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.PortalSession */
ALTER TABLE [${flyway:defaultSchema}].[PortalSession] ADD CONSTRAINT [DF___mj_BizAppsSecureMessaging_PortalSession___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SecureMessage */
ALTER TABLE [${flyway:defaultSchema}].[SecureMessage] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SecureMessage */
UPDATE [${flyway:defaultSchema}].[SecureMessage] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SecureMessage */
ALTER TABLE [${flyway:defaultSchema}].[SecureMessage] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.SecureMessage */
ALTER TABLE [${flyway:defaultSchema}].[SecureMessage] ADD CONSTRAINT [DF___mj_BizAppsSecureMessaging_SecureMessage___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SecureMessage */
ALTER TABLE [${flyway:defaultSchema}].[SecureMessage] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SecureMessage */
UPDATE [${flyway:defaultSchema}].[SecureMessage] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SecureMessage */
ALTER TABLE [${flyway:defaultSchema}].[SecureMessage] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.SecureMessage */
ALTER TABLE [${flyway:defaultSchema}].[SecureMessage] ADD CONSTRAINT [DF___mj_BizAppsSecureMessaging_SecureMessage___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd84af2eb-ea4e-41de-8b37-ce60aaccaceb' OR (EntityID = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND Name = 'ID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd84af2eb-ea4e-41de-8b37-ce60aaccaceb',
            '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- Entity: MJ_BizApps_SecureMessaging: File Requests
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '038cd3c8-da08-4afb-aadd-94d9b504eec8' OR (EntityID = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND Name = 'PortalSessionID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '038cd3c8-da08-4afb-aadd-94d9b504eec8',
            '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- Entity: MJ_BizApps_SecureMessaging: File Requests
            100002,
            'PortalSessionID',
            'Portal Session ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2c50079f-76d5-4dac-b9f3-42e4bedef662' OR (EntityID = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND Name = 'ThreadID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2c50079f-76d5-4dac-b9f3-42e4bedef662',
            '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- Entity: MJ_BizApps_SecureMessaging: File Requests
            100003,
            'ThreadID',
            'Thread ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7b6d1385-4061-45ed-b0c3-a4e442f9ff0c' OR (EntityID = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND Name = 'Title')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7b6d1385-4061-45ed-b0c3-a4e442f9ff0c',
            '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- Entity: MJ_BizApps_SecureMessaging: File Requests
            100004,
            'Title',
            'Title',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c9bac686-4990-4a3b-9e7e-f46a651ad2e9' OR (EntityID = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND Name = 'Instructions')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c9bac686-4990-4a3b-9e7e-f46a651ad2e9',
            '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- Entity: MJ_BizApps_SecureMessaging: File Requests
            100005,
            'Instructions',
            'Instructions',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2680a27e-5bbf-46bc-a9f9-46ef4ecc815e' OR (EntityID = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND Name = 'Status')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2680a27e-5bbf-46bc-a9f9-46ef4ecc815e',
            '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- Entity: MJ_BizApps_SecureMessaging: File Requests
            100006,
            'Status',
            'Status',
            'Request lifecycle status: Pending (awaiting the contact), Fulfilled (files uploaded and the contact marked it complete), Cancelled (staff closed it out), or Expired (the DueAt deadline passed while still Pending). Only Pending requests appear as action callouts in the portal; terminal states collapse into thread history.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fc0658e7-f0b2-43c4-a314-480cbf5a5e0a' OR (EntityID = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND Name = 'RequestedByUserID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fc0658e7-f0b2-43c4-a314-480cbf5a5e0a',
            '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- Entity: MJ_BizApps_SecureMessaging: File Requests
            100007,
            'RequestedByUserID',
            'Requested By User ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3cd18e90-f0e5-4ee0-a9a4-eab158588dbd' OR (EntityID = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND Name = 'DueAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '3cd18e90-f0e5-4ee0-a9a4-eab158588dbd',
            '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- Entity: MJ_BizApps_SecureMessaging: File Requests
            100008,
            'DueAt',
            'Due At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd9a6184f-5072-41eb-9410-dfa5111252dc' OR (EntityID = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND Name = 'FulfilledAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd9a6184f-5072-41eb-9410-dfa5111252dc',
            '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- Entity: MJ_BizApps_SecureMessaging: File Requests
            100009,
            'FulfilledAt',
            'Fulfilled At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '84812652-6bd1-4de7-b871-602c036cec42' OR (EntityID = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '84812652-6bd1-4de7-b871-602c036cec42',
            '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- Entity: MJ_BizApps_SecureMessaging: File Requests
            100010,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '20430bfb-17d5-411c-85a9-4307316dca80' OR (EntityID = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '20430bfb-17d5-411c-85a9-4307316dca80',
            '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- Entity: MJ_BizApps_SecureMessaging: File Requests
            100011,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0dbd9aab-b892-4a5f-a870-0d9a4b75b04a' OR (EntityID = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND Name = 'ID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0dbd9aab-b892-4a5f-a870-0d9a4b75b04a',
            'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- Entity: MJ_BizApps_SecureMessaging: Message Files
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fe794373-413d-4016-8877-10905ef9bfef' OR (EntityID = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND Name = 'SecureMessageID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'fe794373-413d-4016-8877-10905ef9bfef',
            'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- Entity: MJ_BizApps_SecureMessaging: Message Files
            100002,
            'SecureMessageID',
            'Secure Message ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '95A23EED-0C13-4D65-965C-FD40C371C870',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '35fe759e-89b1-4e32-83a4-c44627916e40' OR (EntityID = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND Name = 'ExternalMessageID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '35fe759e-89b1-4e32-83a4-c44627916e40',
            'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- Entity: MJ_BizApps_SecureMessaging: Message Files
            100003,
            'ExternalMessageID',
            'External Message ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '23302f51-b78b-4895-bb47-c72de4ea3e21' OR (EntityID = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND Name = 'ThreadID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '23302f51-b78b-4895-bb47-c72de4ea3e21',
            'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- Entity: MJ_BizApps_SecureMessaging: Message Files
            100004,
            'ThreadID',
            'Thread ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '65ad537f-fe26-45c4-af60-308976df9075' OR (EntityID = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND Name = 'ArtifactID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '65ad537f-fe26-45c4-af60-308976df9075',
            'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- Entity: MJ_BizApps_SecureMessaging: Message Files
            100005,
            'ArtifactID',
            'Artifact ID',
            'Soft reference to MJ: Artifacts.ID wrapping the uploaded file.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5de45282-d290-4891-be51-8089a1431b51' OR (EntityID = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND Name = 'FileID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '5de45282-d290-4891-be51-8089a1431b51',
            'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- Entity: MJ_BizApps_SecureMessaging: Message Files
            100006,
            'FileID',
            'File ID',
            'Soft reference to MJ: Files.ID holding the bytes in the configured storage provider.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '49972105-de2f-4b46-abed-4bdcc526cb7b' OR (EntityID = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND Name = 'Filename')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '49972105-de2f-4b46-abed-4bdcc526cb7b',
            'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- Entity: MJ_BizApps_SecureMessaging: Message Files
            100007,
            'Filename',
            'Filename',
            NULL,
            'nvarchar',
            1000,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '31c0011e-79b2-49c6-a57d-df86d54c327c' OR (EntityID = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND Name = 'ContentType')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '31c0011e-79b2-49c6-a57d-df86d54c327c',
            'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- Entity: MJ_BizApps_SecureMessaging: Message Files
            100008,
            'ContentType',
            'Content Type',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0caaa67e-afd2-4341-ab92-635c550cdb77' OR (EntityID = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND Name = 'Size')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0caaa67e-afd2-4341-ab92-635c550cdb77',
            'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- Entity: MJ_BizApps_SecureMessaging: Message Files
            100009,
            'Size',
            'Size',
            NULL,
            'bigint',
            8,
            19,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd97c178f-6dab-4464-a6b1-b961cb77b32d' OR (EntityID = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd97c178f-6dab-4464-a6b1-b961cb77b32d',
            'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- Entity: MJ_BizApps_SecureMessaging: Message Files
            100010,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f2ee3fc9-cc73-4ed8-bad7-2da240a84cba' OR (EntityID = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f2ee3fc9-cc73-4ed8-bad7-2da240a84cba',
            'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- Entity: MJ_BizApps_SecureMessaging: Message Files
            100011,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '90549dab-9b9b-4609-b718-e5bb7ac2b62b' OR (EntityID = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND Name = 'ID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '90549dab-9b9b-4609-b718-e5bb7ac2b62b',
            '2B2E8762-39B4-488D-953C-BA1169E774D1', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '03803e37-f1d3-4856-bb18-ea70f545479a' OR (EntityID = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND Name = 'PortalSessionID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '03803e37-f1d3-4856-bb18-ea70f545479a',
            '2B2E8762-39B4-488D-953C-BA1169E774D1', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
            100002,
            'PortalSessionID',
            'Portal Session ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '337dab0a-ff7f-4c7b-9a6d-7c3b521f2340' OR (EntityID = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND Name = 'TokenHash')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '337dab0a-ff7f-4c7b-9a6d-7c3b521f2340',
            '2B2E8762-39B4-488D-953C-BA1169E774D1', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
            100003,
            'TokenHash',
            'Token Hash',
            'SHA-256 hash of the magic link token (sm_ml_ prefix). Raw token is never stored.',
            'nvarchar',
            256,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '42885a4a-1b1f-4984-819d-b6a17a9992e3' OR (EntityID = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND Name = 'Status')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '42885a4a-1b1f-4984-819d-b6a17a9992e3',
            '2B2E8762-39B4-488D-953C-BA1169E774D1', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
            100004,
            'Status',
            'Status',
            'Magic link lifecycle status: Pending, Used, or Expired',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd88e34ba-df5a-480d-b74e-267dda1354bc' OR (EntityID = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND Name = 'ExpiresAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd88e34ba-df5a-480d-b74e-267dda1354bc',
            '2B2E8762-39B4-488D-953C-BA1169E774D1', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
            100005,
            'ExpiresAt',
            'Expires At',
            'When the magic link expires. Default is 15 minutes from creation.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '970b7879-9daa-4b3d-8abd-7eea89810262' OR (EntityID = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND Name = 'UsedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '970b7879-9daa-4b3d-8abd-7eea89810262',
            '2B2E8762-39B4-488D-953C-BA1169E774D1', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
            100006,
            'UsedAt',
            'Used At',
            'Timestamp when the magic link was redeemed. NULL if not yet used.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9b5a4416-2692-4a3d-b574-d045fb97892f' OR (EntityID = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND Name = 'DeepLinkThreadID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '9b5a4416-2692-4a3d-b574-d045fb97892f',
            '2B2E8762-39B4-488D-953C-BA1169E774D1', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
            100007,
            'DeepLinkThreadID',
            'Deep Link Thread ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b438f8e9-4399-4215-9f93-fba4a00fc56a' OR (EntityID = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b438f8e9-4399-4215-9f93-fba4a00fc56a',
            '2B2E8762-39B4-488D-953C-BA1169E774D1', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
            100008,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b9f9976c-3b78-490d-8560-227025ff25d5' OR (EntityID = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b9f9976c-3b78-490d-8560-227025ff25d5',
            '2B2E8762-39B4-488D-953C-BA1169E774D1', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
            100009,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a9a304d9-668c-476e-bc03-1d4b4ccf5784' OR (EntityID = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND Name = 'ID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a9a304d9-668c-476e-bc03-1d4b4ccf5784',
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- Entity: MJ_BizApps_SecureMessaging: Secure Threads
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8049b248-c54e-447b-a087-7477035e0fbc' OR (EntityID = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND Name = 'ContactID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8049b248-c54e-447b-a087-7477035e0fbc',
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- Entity: MJ_BizApps_SecureMessaging: Secure Threads
            100002,
            'ContactID',
            'Contact ID',
            'Soft reference to the external contact (MJ_BizApps_Common.Person.ID). Not a hard FK so the schema stays standalone.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'eef2d72a-e9bb-4a93-b7c7-55495ca0b786' OR (EntityID = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND Name = 'Subject')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'eef2d72a-e9bb-4a93-b7c7-55495ca0b786',
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- Entity: MJ_BizApps_SecureMessaging: Secure Threads
            100003,
            'Subject',
            'Subject',
            'The conversation subject line (TitanFile-channel style), set by staff at compose or derived at promotion.',
            'nvarchar',
            1000,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8b8422a2-c239-478f-8f6a-baa36c756e48' OR (EntityID = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND Name = 'Status')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8b8422a2-c239-478f-8f6a-baa36c756e48',
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- Entity: MJ_BizApps_SecureMessaging: Secure Threads
            100004,
            'Status',
            'Status',
            'Thread lifecycle: Active (open), Closed (contact-visible read-only), Archived (hidden from default lists). Contact-visible, unlike the old session-level archive flags.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'dcc13fd2-8193-4ab7-8acb-df6145afa307' OR (EntityID = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND Name = 'SourceChannel')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'dcc13fd2-8193-4ab7-8acb-df6145afa307',
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- Entity: MJ_BizApps_SecureMessaging: Secure Threads
            100005,
            'SourceChannel',
            'Source Channel',
            'NULL for threads that originated natively in the secure channel; the insecure channel name (e.g. Email, SMS) for threads created by promotion (PRD §9 bridges).',
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '111d2164-5b9b-4e57-9fd9-2f4c2cc9c997' OR (EntityID = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND Name = 'CreatedByUserID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '111d2164-5b9b-4e57-9fd9-2f4c2cc9c997',
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- Entity: MJ_BizApps_SecureMessaging: Secure Threads
            100006,
            'CreatedByUserID',
            'Created By User ID',
            'Soft reference to the MJ user (staff) who created the thread; NULL for promoted/backfilled threads. Not a hard FK so the schema stays standalone.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7bdf1478-bff1-4e6d-b0bf-b859b9db3f0b' OR (EntityID = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND Name = 'LastMessageAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '7bdf1478-bff1-4e6d-b0bf-b859b9db3f0b',
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- Entity: MJ_BizApps_SecureMessaging: Secure Threads
            100007,
            'LastMessageAt',
            'Last Message At',
            'Timestamp of the most recent message in the thread (denormalized for inbox ordering).',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6d103051-5a1d-4203-b6a1-021cd4bff60f' OR (EntityID = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND Name = 'IsDeleted')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6d103051-5a1d-4203-b6a1-021cd4bff60f',
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- Entity: MJ_BizApps_SecureMessaging: Secure Threads
            100008,
            'IsDeleted',
            'Is Deleted',
            'Soft delete (staff Trash). Records are never hard-deleted — compliance/audit.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ace2d094-77c9-4ce1-833d-cc88c1179fcd' OR (EntityID = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'ace2d094-77c9-4ce1-833d-cc88c1179fcd',
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- Entity: MJ_BizApps_SecureMessaging: Secure Threads
            100009,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f6b95a05-922a-4581-8588-cbc14bbf1481' OR (EntityID = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f6b95a05-922a-4581-8588-cbc14bbf1481',
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- Entity: MJ_BizApps_SecureMessaging: Secure Threads
            100010,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '03964bfd-d587-404f-971a-831f08f76aa1' OR (EntityID = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND Name = 'ID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '03964bfd-d587-404f-971a-831f08f76aa1',
            '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '633aa7f0-dc5b-4f83-90fa-e0cccda592cc' OR (EntityID = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND Name = 'ContactID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '633aa7f0-dc5b-4f83-90fa-e0cccda592cc',
            '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100002,
            'ContactID',
            'Contact ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '87293581-d7db-4493-bf50-f102ebe300d7' OR (EntityID = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND Name = 'TokenHash')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '87293581-d7db-4493-bf50-f102ebe300d7',
            '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100003,
            'TokenHash',
            'Token Hash',
            'SHA-256 hash of the opaque session token (sm_ prefix). Raw token is never stored.',
            'nvarchar',
            256,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '14bf5536-3c24-4264-912b-bce7b6d83901' OR (EntityID = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND Name = 'Status')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '14bf5536-3c24-4264-912b-bce7b6d83901',
            '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100004,
            'Status',
            'Status',
            'Session lifecycle status: Active, Expired, or Revoked',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Active',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '45ff9a5b-71c5-4748-8e0b-8fb44ef9cad5' OR (EntityID = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND Name = 'ExpiresAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '45ff9a5b-71c5-4748-8e0b-8fb44ef9cad5',
            '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100005,
            'ExpiresAt',
            'Expires At',
            'When the session token expires. Default TTL is 7 days, extended on each access.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '44c890b9-386a-45e2-87b9-7ee69e4cbedb' OR (EntityID = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND Name = 'LastAccessedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '44c890b9-386a-45e2-87b9-7ee69e4cbedb',
            '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100006,
            'LastAccessedAt',
            'Last Accessed At',
            'Last time the session was accessed. Used for session extension and cleanup.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '18c5c4d8-a3c7-49c2-b570-7a79257ca1b0' OR (EntityID = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '18c5c4d8-a3c7-49c2-b570-7a79257ca1b0',
            '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100007,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a057ba3c-e00e-497c-b5e9-91ba28f71077' OR (EntityID = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a057ba3c-e00e-497c-b5e9-91ba28f71077',
            '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100008,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '513651e9-54aa-4f8c-988b-9b6ad6798f3a' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'ID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '513651e9-54aa-4f8c-988b-9b6ad6798f3a',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100001,
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2b977d39-66a2-4f97-b918-1465195f43cf' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'PortalSessionID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '2b977d39-66a2-4f97-b918-1465195f43cf',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100002,
            'PortalSessionID',
            'Portal Session ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '592ddffb-9926-47b5-85bd-bab4cfc39a1c' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'ThreadID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '592ddffb-9926-47b5-85bd-bab4cfc39a1c',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100003,
            'ThreadID',
            'Thread ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            '1409049B-3E4A-4D8D-81EF-E70D9CE50A88',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '56e6c5c0-48b3-43fb-aa30-ec657a4cb7e5' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'PersonID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '56e6c5c0-48b3-43fb-aa30-ec657a4cb7e5',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100004,
            'PersonID',
            'Person ID',
            'Soft reference to the person (e.g. MJ_BizApps_Common.People.ID). Not a hard FK so the schema stays standalone.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c47729be-ed8f-4bd6-bde0-9ee08ee65c4e' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'Direction')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c47729be-ed8f-4bd6-bde0-9ee08ee65c4e',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100005,
            'Direction',
            'Direction',
            'Direction of the message relative to the organization: Inbound (from contact) or Outbound (reply to contact).',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Inbound',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '4f4dd79e-b9f6-4e22-9155-c7abe8c1b18d' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'Sender')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4f4dd79e-b9f6-4e22-9155-c7abe8c1b18d',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100006,
            'Sender',
            'Sender',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '09bc3f32-9b8e-4498-a689-b8593b67066d' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'Recipient')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '09bc3f32-9b8e-4498-a689-b8593b67066d',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100007,
            'Recipient',
            'Recipient',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '02614f66-f942-45bd-964f-13f31eda3577' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'Subject')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '02614f66-f942-45bd-964f-13f31eda3577',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100008,
            'Subject',
            'Subject',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bb897f01-29e0-45a3-8d04-98718e809dea' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'Content')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bb897f01-29e0-45a3-8d04-98718e809dea',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100009,
            'Content',
            'Content',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd101fb7c-780a-4cc0-986e-5656c650333b' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'IsSecure')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'd101fb7c-780a-4cc0-986e-5656c650333b',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100010,
            'IsSecure',
            'Is Secure',
            NULL,
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b26c0dfc-3cc7-46fb-bfdd-842e0929b978' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'Status')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b26c0dfc-3cc7-46fb-bfdd-842e0929b978',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100011,
            'Status',
            'Status',
            NULL,
            'nvarchar',
            40,
            0,
            0,
            0,
            'New',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1ecc4378-5d0a-4da3-98fa-9daeea12204b' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'ExternalMessageID')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '1ecc4378-5d0a-4da3-98fa-9daeea12204b',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100012,
            'ExternalMessageID',
            'External Message ID',
            'When the Channel Messages adapter is active, holds the mirrored Channel Message ID so the AI pipeline can process the message. NULL in the self-contained path.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '91aafabe-9a87-4b90-ac41-ddb26fd49b79' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'ReceivedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '91aafabe-9a87-4b90-ac41-ddb26fd49b79',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100013,
            'ReceivedAt',
            'Received At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8c53d93b-0775-4c15-9e72-226e07d06e2c' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'IsStarred')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8c53d93b-0775-4c15-9e72-226e07d06e2c',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100014,
            'IsStarred',
            'Is Starred',
            'When 1, this message is starred/flagged by staff for quick retrieval (shown under the Starred category). Per-message, staff-toggled.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '060aeccd-baa3-4bc8-829e-cb28eab6e954' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'IsImported')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '060aeccd-baa3-4bc8-829e-cb28eab6e954',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100015,
            'IsImported',
            'Is Imported',
            'When 1, this message was imported (copied) into the secure thread during a promotion/bridge from an insecure channel, rather than originating natively in the secure channel. Imported messages predate the switch to secure.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a537df35-8388-4fde-ad19-f429a07c2436' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = 'SourceChannel')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'a537df35-8388-4fde-ad19-f429a07c2436',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100016,
            'SourceChannel',
            'Source Channel',
            'For imported messages, the insecure channel the message originated from (e.g. Email, SMS). NULL for messages that originated natively in the secure channel.',
            'nvarchar',
            100,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e3d22297-0531-4289-a88e-31a792e5ba86' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'e3d22297-0531-4289-a88e-31a792e5ba86',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100017,
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '384ac274-3cfc-4d13-908e-b63674385e68' OR (EntityID = '95A23EED-0C13-4D65-965C-FD40C371C870' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${mjSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '384ac274-3cfc-4d13-908e-b63674385e68',
            '95A23EED-0C13-4D65-965C-FD40C371C870', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100018,
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to update existing entity fields from schema */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon';

/* SQL text to insert entity field value with ID 760f855c-384b-43eb-853c-3d54cf7e3355 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('760f855c-384b-43eb-853c-3d54cf7e3355', '8B8422A2-C239-478F-8F6A-BAA36C756E48', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ea44228c-f32f-4c73-ad23-b25039f6dad2 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ea44228c-f32f-4c73-ad23-b25039f6dad2', '8B8422A2-C239-478F-8F6A-BAA36C756E48', 2, 'Archived', 'Archived', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 6bd44d71-f434-412f-93e7-2408984b6dbb */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('6bd44d71-f434-412f-93e7-2408984b6dbb', '8B8422A2-C239-478F-8F6A-BAA36C756E48', 3, 'Closed', 'Closed', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 8B8422A2-C239-478F-8F6A-BAA36C756E48 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='8B8422A2-C239-478F-8F6A-BAA36C756E48';

/* SQL text to insert entity field value with ID 682dccc2-1517-49ad-950e-4c9a67c863df */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('682dccc2-1517-49ad-950e-4c9a67c863df', '14BF5536-3C24-4264-912B-BCE7B6D83901', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bd81339b-2508-4183-b385-efd955213186 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bd81339b-2508-4183-b385-efd955213186', '14BF5536-3C24-4264-912B-BCE7B6D83901', 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID c2eb92c5-7935-4548-807b-691fb30f43f4 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c2eb92c5-7935-4548-807b-691fb30f43f4', '14BF5536-3C24-4264-912B-BCE7B6D83901', 3, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 14BF5536-3C24-4264-912B-BCE7B6D83901 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='14BF5536-3C24-4264-912B-BCE7B6D83901';

/* SQL text to insert entity field value with ID 83664457-9c35-40c4-9259-b22d781f0f0c */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('83664457-9c35-40c4-9259-b22d781f0f0c', '42885A4A-1B1F-4984-819D-B6A17A9992E3', 1, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID eed63ee9-fb0c-4588-8c6a-a51807ae3ae9 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('eed63ee9-fb0c-4588-8c6a-a51807ae3ae9', '42885A4A-1B1F-4984-819D-B6A17A9992E3', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 9bf295bc-127f-4d84-84f9-27c38cf6215e */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('9bf295bc-127f-4d84-84f9-27c38cf6215e', '42885A4A-1B1F-4984-819D-B6A17A9992E3', 3, 'Used', 'Used', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 42885A4A-1B1F-4984-819D-B6A17A9992E3 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='42885A4A-1B1F-4984-819D-B6A17A9992E3';

/* SQL text to insert entity field value with ID e067ce56-a288-4f95-97f0-a143d0ada96a */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e067ce56-a288-4f95-97f0-a143d0ada96a', 'C47729BE-ED8F-4BD6-BDE0-9EE08EE65C4E', 1, 'Inbound', 'Inbound', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 57678279-1e9b-4b16-91f9-2bc37d802e15 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('57678279-1e9b-4b16-91f9-2bc37d802e15', 'C47729BE-ED8F-4BD6-BDE0-9EE08EE65C4E', 2, 'Outbound', 'Outbound', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID C47729BE-ED8F-4BD6-BDE0-9EE08EE65C4E */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='C47729BE-ED8F-4BD6-BDE0-9EE08EE65C4E';

/* SQL text to insert entity field value with ID abbd2f1a-bdd1-4e0e-8888-923b41845014 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('abbd2f1a-bdd1-4e0e-8888-923b41845014', 'B26C0DFC-3CC7-46FB-BFDD-842E0929B978', 1, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7046af48-b372-4dcf-b15b-5b78bb0ea39f */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7046af48-b372-4dcf-b15b-5b78bb0ea39f', 'B26C0DFC-3CC7-46FB-BFDD-842E0929B978', 2, 'New', 'New', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 17a2fc1f-2a8a-4d26-b1d6-0bc680946b20 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('17a2fc1f-2a8a-4d26-b1d6-0bc680946b20', 'B26C0DFC-3CC7-46FB-BFDD-842E0929B978', 3, 'Read', 'Read', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 7cda5eca-07e0-48ee-bab2-81caffba53d1 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('7cda5eca-07e0-48ee-bab2-81caffba53d1', 'B26C0DFC-3CC7-46FB-BFDD-842E0929B978', 4, 'Replied', 'Replied', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8c88ea9a-2fa0-4b53-88c5-206dd70b1af9 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8c88ea9a-2fa0-4b53-88c5-206dd70b1af9', 'B26C0DFC-3CC7-46FB-BFDD-842E0929B978', 5, 'Sent', 'Sent', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID B26C0DFC-3CC7-46FB-BFDD-842E0929B978 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='B26C0DFC-3CC7-46FB-BFDD-842E0929B978';

/* SQL text to insert entity field value with ID 85f9c6b8-ffe8-474e-afb0-2427ee02e119 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('85f9c6b8-ffe8-474e-afb0-2427ee02e119', '2680A27E-5BBF-46BC-A9F9-46EF4ECC815E', 1, 'Cancelled', 'Cancelled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 58ed5b6a-100c-490c-aa38-0f7ade9792e3 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('58ed5b6a-100c-490c-aa38-0f7ade9792e3', '2680A27E-5BBF-46BC-A9F9-46EF4ECC815E', 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d15d4ad6-8744-4fa4-9861-f2348e6cf6ed */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d15d4ad6-8744-4fa4-9861-f2348e6cf6ed', '2680A27E-5BBF-46BC-A9F9-46EF4ECC815E', 3, 'Fulfilled', 'Fulfilled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID e2dd19f5-a531-4aa0-888f-eccc3e2bb431 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('e2dd19f5-a531-4aa0-888f-eccc3e2bb431', '2680A27E-5BBF-46BC-A9F9-46EF4ECC815E', 4, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 2680A27E-5BBF-46BC-A9F9-46EF4ECC815E */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='2680A27E-5BBF-46BC-A9F9-46EF4ECC815E';


/* Create Entity Relationship: MJ_BizApps_SecureMessaging: Secure Threads -> MJ_BizApps_SecureMessaging: File Requests (One To Many via ThreadID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'a2e039a5-d192-433d-b9bd-ced54d36a8d4'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a2e039a5-d192-433d-b9bd-ced54d36a8d4', '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', 'ThreadID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_SecureMessaging: Secure Threads -> MJ_BizApps_SecureMessaging: Secure Messages (One To Many via ThreadID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'e64e58e2-81ca-4a75-b04f-af9c32b41f3f'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('e64e58e2-81ca-4a75-b04f-af9c32b41f3f', '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', '95A23EED-0C13-4D65-965C-FD40C371C870', 'ThreadID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_SecureMessaging: Secure Threads -> MJ_BizApps_SecureMessaging: Message Files (One To Many via ThreadID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '55b78ead-60f4-454a-93c4-927a683d09b7'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('55b78ead-60f4-454a-93c4-927a683d09b7', '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', 'C08C5B36-FFFD-455B-849E-9481C8E1286C', 'ThreadID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_SecureMessaging: Secure Threads -> MJ_BizApps_SecureMessaging: Portal Magic Links (One To Many via DeepLinkThreadID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '2a57f3ce-237e-48bf-a7cd-44671634af1f'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('2a57f3ce-237e-48bf-a7cd-44671634af1f', '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', '2B2E8762-39B4-488D-953C-BA1169E774D1', 'DeepLinkThreadID', 'One To Many', 1, 1, 4, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_SecureMessaging: Portal Sessions -> MJ_BizApps_SecureMessaging: Portal Magic Links (One To Many via PortalSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'bd6210a8-40c3-4eab-afd0-dc3649085c0f'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bd6210a8-40c3-4eab-afd0-dc3649085c0f', '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', '2B2E8762-39B4-488D-953C-BA1169E774D1', 'PortalSessionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ_BizApps_SecureMessaging: Portal Sessions -> MJ_BizApps_SecureMessaging: File Requests (One To Many via PortalSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '0849973d-cffd-439d-ba14-54cb43336d79'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0849973d-cffd-439d-ba14-54cb43336d79', '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', 'PortalSessionID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_SecureMessaging: Portal Sessions -> MJ_BizApps_SecureMessaging: Secure Messages (One To Many via PortalSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'a31a7f3f-4139-4e29-9ae3-9839383b23ca'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('a31a7f3f-4139-4e29-9ae3-9839383b23ca', '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', '95A23EED-0C13-4D65-965C-FD40C371C870', 'PortalSessionID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_SecureMessaging: Secure Messages -> MJ_BizApps_SecureMessaging: Message Files (One To Many via SecureMessageID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'f57f3926-3924-4194-a09b-710e9e98dc97'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('f57f3926-3924-4194-a09b-710e9e98dc97', '95A23EED-0C13-4D65-965C-FD40C371C870', 'C08C5B36-FFFD-455B-849E-9481C8E1286C', 'SecureMessageID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon';

/* Index for Foreign Keys for FileRequest */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: File Requests
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PortalSessionID in table FileRequest
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FileRequest_PortalSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FileRequest]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FileRequest_PortalSessionID ON [${flyway:defaultSchema}].[FileRequest] ([PortalSessionID]);

-- Index for foreign key ThreadID in table FileRequest
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_FileRequest_ThreadID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[FileRequest]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_FileRequest_ThreadID ON [${flyway:defaultSchema}].[FileRequest] ([ThreadID]);

/* Index for Foreign Keys for MessageFile */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Message Files
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SecureMessageID in table MessageFile
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MessageFile_SecureMessageID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MessageFile]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MessageFile_SecureMessageID ON [${flyway:defaultSchema}].[MessageFile] ([SecureMessageID]);

-- Index for foreign key ThreadID in table MessageFile
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_MessageFile_ThreadID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[MessageFile]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_MessageFile_ThreadID ON [${flyway:defaultSchema}].[MessageFile] ([ThreadID]);

/* Index for Foreign Keys for PortalMagicLink */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PortalSessionID in table PortalMagicLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PortalMagicLink_PortalSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PortalMagicLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PortalMagicLink_PortalSessionID ON [${flyway:defaultSchema}].[PortalMagicLink] ([PortalSessionID]);

-- Index for foreign key DeepLinkThreadID in table PortalMagicLink
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_PortalMagicLink_DeepLinkThreadID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[PortalMagicLink]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_PortalMagicLink_DeepLinkThreadID ON [${flyway:defaultSchema}].[PortalMagicLink] ([DeepLinkThreadID]);

/* Index for Foreign Keys for PortalSession */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Index for Foreign Keys for SecureMessage */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Messages
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key PortalSessionID in table SecureMessage
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SecureMessage_PortalSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SecureMessage]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SecureMessage_PortalSessionID ON [${flyway:defaultSchema}].[SecureMessage] ([PortalSessionID]);

-- Index for foreign key ThreadID in table SecureMessage
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_SecureMessage_ThreadID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[SecureMessage]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_SecureMessage_ThreadID ON [${flyway:defaultSchema}].[SecureMessage] ([ThreadID]);

/* Base View SQL for MJ_BizApps_SecureMessaging: File Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: File Requests
-- Item: vwFileRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_SecureMessaging: File Requests
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  FileRequest
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwFileRequests]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwFileRequests];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwFileRequests]
AS
SELECT
    f.*
FROM
    [${flyway:defaultSchema}].[FileRequest] AS f
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwFileRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_SecureMessaging: File Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: File Requests
-- Item: Permissions for vwFileRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwFileRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_SecureMessaging: File Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: File Requests
-- Item: spCreateFileRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FileRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateFileRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateFileRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateFileRequest]
    @ID uniqueidentifier = NULL,
    @PortalSessionID uniqueidentifier,
    @ThreadID uniqueidentifier,
    @Title nvarchar(255),
    @Instructions_Clear bit = 0,
    @Instructions nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @RequestedByUserID_Clear bit = 0,
    @RequestedByUserID uniqueidentifier = NULL,
    @DueAt_Clear bit = 0,
    @DueAt datetimeoffset = NULL,
    @FulfilledAt_Clear bit = 0,
    @FulfilledAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[FileRequest]
            (
                [ID],
                [PortalSessionID],
                [ThreadID],
                [Title],
                [Instructions],
                [Status],
                [RequestedByUserID],
                [DueAt],
                [FulfilledAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PortalSessionID,
                @ThreadID,
                @Title,
                CASE WHEN @Instructions_Clear = 1 THEN NULL ELSE ISNULL(@Instructions, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @RequestedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@RequestedByUserID, NULL) END,
                CASE WHEN @DueAt_Clear = 1 THEN NULL ELSE ISNULL(@DueAt, NULL) END,
                CASE WHEN @FulfilledAt_Clear = 1 THEN NULL ELSE ISNULL(@FulfilledAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[FileRequest]
            (
                [PortalSessionID],
                [ThreadID],
                [Title],
                [Instructions],
                [Status],
                [RequestedByUserID],
                [DueAt],
                [FulfilledAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PortalSessionID,
                @ThreadID,
                @Title,
                CASE WHEN @Instructions_Clear = 1 THEN NULL ELSE ISNULL(@Instructions, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @RequestedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@RequestedByUserID, NULL) END,
                CASE WHEN @DueAt_Clear = 1 THEN NULL ELSE ISNULL(@DueAt, NULL) END,
                CASE WHEN @FulfilledAt_Clear = 1 THEN NULL ELSE ISNULL(@FulfilledAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwFileRequests] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFileRequest] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_SecureMessaging: File Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateFileRequest] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_SecureMessaging: File Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: File Requests
-- Item: spUpdateFileRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FileRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateFileRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateFileRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateFileRequest]
    @ID uniqueidentifier,
    @PortalSessionID uniqueidentifier = NULL,
    @ThreadID uniqueidentifier = NULL,
    @Title nvarchar(255) = NULL,
    @Instructions_Clear bit = 0,
    @Instructions nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @RequestedByUserID_Clear bit = 0,
    @RequestedByUserID uniqueidentifier = NULL,
    @DueAt_Clear bit = 0,
    @DueAt datetimeoffset = NULL,
    @FulfilledAt_Clear bit = 0,
    @FulfilledAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileRequest]
    SET
        [PortalSessionID] = ISNULL(@PortalSessionID, [PortalSessionID]),
        [ThreadID] = ISNULL(@ThreadID, [ThreadID]),
        [Title] = ISNULL(@Title, [Title]),
        [Instructions] = CASE WHEN @Instructions_Clear = 1 THEN NULL ELSE ISNULL(@Instructions, [Instructions]) END,
        [Status] = ISNULL(@Status, [Status]),
        [RequestedByUserID] = CASE WHEN @RequestedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@RequestedByUserID, [RequestedByUserID]) END,
        [DueAt] = CASE WHEN @DueAt_Clear = 1 THEN NULL ELSE ISNULL(@DueAt, [DueAt]) END,
        [FulfilledAt] = CASE WHEN @FulfilledAt_Clear = 1 THEN NULL ELSE ISNULL(@FulfilledAt, [FulfilledAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwFileRequests] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwFileRequests]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFileRequest] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the FileRequest table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateFileRequest]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateFileRequest];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateFileRequest
ON [${flyway:defaultSchema}].[FileRequest]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[FileRequest]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[FileRequest] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_SecureMessaging: File Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateFileRequest] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_SecureMessaging: Message Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Message Files
-- Item: vwMessageFiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_SecureMessaging: Message Files
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  MessageFile
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwMessageFiles]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwMessageFiles];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwMessageFiles]
AS
SELECT
    m.*
FROM
    [${flyway:defaultSchema}].[MessageFile] AS m
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwMessageFiles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_SecureMessaging: Message Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Message Files
-- Item: Permissions for vwMessageFiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwMessageFiles] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_SecureMessaging: Message Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Message Files
-- Item: spCreateMessageFile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MessageFile
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMessageFile]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMessageFile];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMessageFile]
    @ID uniqueidentifier = NULL,
    @SecureMessageID_Clear bit = 0,
    @SecureMessageID uniqueidentifier = NULL,
    @ExternalMessageID_Clear bit = 0,
    @ExternalMessageID uniqueidentifier = NULL,
    @ThreadID uniqueidentifier,
    @ArtifactID_Clear bit = 0,
    @ArtifactID uniqueidentifier = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL,
    @Filename nvarchar(500),
    @ContentType_Clear bit = 0,
    @ContentType nvarchar(255) = NULL,
    @Size_Clear bit = 0,
    @Size bigint = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MessageFile]
            (
                [ID],
                [SecureMessageID],
                [ExternalMessageID],
                [ThreadID],
                [ArtifactID],
                [FileID],
                [Filename],
                [ContentType],
                [Size]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @SecureMessageID_Clear = 1 THEN NULL ELSE ISNULL(@SecureMessageID, NULL) END,
                CASE WHEN @ExternalMessageID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalMessageID, NULL) END,
                @ThreadID,
                CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END,
                @Filename,
                CASE WHEN @ContentType_Clear = 1 THEN NULL ELSE ISNULL(@ContentType, NULL) END,
                CASE WHEN @Size_Clear = 1 THEN NULL ELSE ISNULL(@Size, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MessageFile]
            (
                [SecureMessageID],
                [ExternalMessageID],
                [ThreadID],
                [ArtifactID],
                [FileID],
                [Filename],
                [ContentType],
                [Size]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @SecureMessageID_Clear = 1 THEN NULL ELSE ISNULL(@SecureMessageID, NULL) END,
                CASE WHEN @ExternalMessageID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalMessageID, NULL) END,
                @ThreadID,
                CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END,
                @Filename,
                CASE WHEN @ContentType_Clear = 1 THEN NULL ELSE ISNULL(@ContentType, NULL) END,
                CASE WHEN @Size_Clear = 1 THEN NULL ELSE ISNULL(@Size, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwMessageFiles] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMessageFile] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_SecureMessaging: Message Files */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMessageFile] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_SecureMessaging: Message Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Message Files
-- Item: spUpdateMessageFile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MessageFile
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMessageFile]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMessageFile];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMessageFile]
    @ID uniqueidentifier,
    @SecureMessageID_Clear bit = 0,
    @SecureMessageID uniqueidentifier = NULL,
    @ExternalMessageID_Clear bit = 0,
    @ExternalMessageID uniqueidentifier = NULL,
    @ThreadID uniqueidentifier = NULL,
    @ArtifactID_Clear bit = 0,
    @ArtifactID uniqueidentifier = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL,
    @Filename nvarchar(500) = NULL,
    @ContentType_Clear bit = 0,
    @ContentType nvarchar(255) = NULL,
    @Size_Clear bit = 0,
    @Size bigint = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MessageFile]
    SET
        [SecureMessageID] = CASE WHEN @SecureMessageID_Clear = 1 THEN NULL ELSE ISNULL(@SecureMessageID, [SecureMessageID]) END,
        [ExternalMessageID] = CASE WHEN @ExternalMessageID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalMessageID, [ExternalMessageID]) END,
        [ThreadID] = ISNULL(@ThreadID, [ThreadID]),
        [ArtifactID] = CASE WHEN @ArtifactID_Clear = 1 THEN NULL ELSE ISNULL(@ArtifactID, [ArtifactID]) END,
        [FileID] = CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, [FileID]) END,
        [Filename] = ISNULL(@Filename, [Filename]),
        [ContentType] = CASE WHEN @ContentType_Clear = 1 THEN NULL ELSE ISNULL(@ContentType, [ContentType]) END,
        [Size] = CASE WHEN @Size_Clear = 1 THEN NULL ELSE ISNULL(@Size, [Size]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwMessageFiles] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwMessageFiles]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMessageFile] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MessageFile table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMessageFile]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMessageFile];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMessageFile
ON [${flyway:defaultSchema}].[MessageFile]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MessageFile]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MessageFile] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_SecureMessaging: Message Files */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMessageFile] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_SecureMessaging: Portal Magic Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
-- Item: vwPortalMagicLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_SecureMessaging: Portal Magic Links
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PortalMagicLink
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPortalMagicLinks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPortalMagicLinks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPortalMagicLinks]
AS
SELECT
    p.*
FROM
    [${flyway:defaultSchema}].[PortalMagicLink] AS p
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPortalMagicLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_SecureMessaging: Portal Magic Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
-- Item: Permissions for vwPortalMagicLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPortalMagicLinks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_SecureMessaging: Portal Magic Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
-- Item: spCreatePortalMagicLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PortalMagicLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePortalMagicLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePortalMagicLink];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePortalMagicLink]
    @ID uniqueidentifier = NULL,
    @PortalSessionID uniqueidentifier,
    @TokenHash nvarchar(128),
    @Status nvarchar(20) = NULL,
    @ExpiresAt datetimeoffset,
    @UsedAt_Clear bit = 0,
    @UsedAt datetimeoffset = NULL,
    @DeepLinkThreadID_Clear bit = 0,
    @DeepLinkThreadID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PortalMagicLink]
            (
                [ID],
                [PortalSessionID],
                [TokenHash],
                [Status],
                [ExpiresAt],
                [UsedAt],
                [DeepLinkThreadID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PortalSessionID,
                @TokenHash,
                ISNULL(@Status, 'Pending'),
                @ExpiresAt,
                CASE WHEN @UsedAt_Clear = 1 THEN NULL ELSE ISNULL(@UsedAt, NULL) END,
                CASE WHEN @DeepLinkThreadID_Clear = 1 THEN NULL ELSE ISNULL(@DeepLinkThreadID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PortalMagicLink]
            (
                [PortalSessionID],
                [TokenHash],
                [Status],
                [ExpiresAt],
                [UsedAt],
                [DeepLinkThreadID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PortalSessionID,
                @TokenHash,
                ISNULL(@Status, 'Pending'),
                @ExpiresAt,
                CASE WHEN @UsedAt_Clear = 1 THEN NULL ELSE ISNULL(@UsedAt, NULL) END,
                CASE WHEN @DeepLinkThreadID_Clear = 1 THEN NULL ELSE ISNULL(@DeepLinkThreadID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPortalMagicLinks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePortalMagicLink] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_SecureMessaging: Portal Magic Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePortalMagicLink] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_SecureMessaging: Portal Magic Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
-- Item: spUpdatePortalMagicLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PortalMagicLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePortalMagicLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePortalMagicLink];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePortalMagicLink]
    @ID uniqueidentifier,
    @PortalSessionID uniqueidentifier = NULL,
    @TokenHash nvarchar(128) = NULL,
    @Status nvarchar(20) = NULL,
    @ExpiresAt datetimeoffset = NULL,
    @UsedAt_Clear bit = 0,
    @UsedAt datetimeoffset = NULL,
    @DeepLinkThreadID_Clear bit = 0,
    @DeepLinkThreadID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PortalMagicLink]
    SET
        [PortalSessionID] = ISNULL(@PortalSessionID, [PortalSessionID]),
        [TokenHash] = ISNULL(@TokenHash, [TokenHash]),
        [Status] = ISNULL(@Status, [Status]),
        [ExpiresAt] = ISNULL(@ExpiresAt, [ExpiresAt]),
        [UsedAt] = CASE WHEN @UsedAt_Clear = 1 THEN NULL ELSE ISNULL(@UsedAt, [UsedAt]) END,
        [DeepLinkThreadID] = CASE WHEN @DeepLinkThreadID_Clear = 1 THEN NULL ELSE ISNULL(@DeepLinkThreadID, [DeepLinkThreadID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPortalMagicLinks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPortalMagicLinks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePortalMagicLink] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PortalMagicLink table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePortalMagicLink]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePortalMagicLink];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePortalMagicLink
ON [${flyway:defaultSchema}].[PortalMagicLink]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PortalMagicLink]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PortalMagicLink] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_SecureMessaging: Portal Magic Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePortalMagicLink] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_SecureMessaging: Portal Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
-- Item: vwPortalSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_SecureMessaging: Portal Sessions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  PortalSession
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwPortalSessions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwPortalSessions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwPortalSessions]
AS
SELECT
    p.*
FROM
    [${flyway:defaultSchema}].[PortalSession] AS p
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwPortalSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_SecureMessaging: Portal Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
-- Item: Permissions for vwPortalSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwPortalSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_SecureMessaging: Portal Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
-- Item: spCreatePortalSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PortalSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreatePortalSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreatePortalSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreatePortalSession]
    @ID uniqueidentifier = NULL,
    @ContactID uniqueidentifier,
    @TokenHash nvarchar(128),
    @Status nvarchar(20) = NULL,
    @ExpiresAt datetimeoffset,
    @LastAccessedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[PortalSession]
            (
                [ID],
                [ContactID],
                [TokenHash],
                [Status],
                [ExpiresAt],
                [LastAccessedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContactID,
                @TokenHash,
                ISNULL(@Status, 'Active'),
                @ExpiresAt,
                ISNULL(@LastAccessedAt, sysdatetimeoffset())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[PortalSession]
            (
                [ContactID],
                [TokenHash],
                [Status],
                [ExpiresAt],
                [LastAccessedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContactID,
                @TokenHash,
                ISNULL(@Status, 'Active'),
                @ExpiresAt,
                ISNULL(@LastAccessedAt, sysdatetimeoffset())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwPortalSessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePortalSession] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_SecureMessaging: Portal Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreatePortalSession] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_SecureMessaging: Portal Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
-- Item: spUpdatePortalSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PortalSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdatePortalSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdatePortalSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdatePortalSession]
    @ID uniqueidentifier,
    @ContactID uniqueidentifier = NULL,
    @TokenHash nvarchar(128) = NULL,
    @Status nvarchar(20) = NULL,
    @ExpiresAt datetimeoffset = NULL,
    @LastAccessedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PortalSession]
    SET
        [ContactID] = ISNULL(@ContactID, [ContactID]),
        [TokenHash] = ISNULL(@TokenHash, [TokenHash]),
        [Status] = ISNULL(@Status, [Status]),
        [ExpiresAt] = ISNULL(@ExpiresAt, [ExpiresAt]),
        [LastAccessedAt] = ISNULL(@LastAccessedAt, [LastAccessedAt])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwPortalSessions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwPortalSessions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePortalSession] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the PortalSession table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdatePortalSession]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdatePortalSession];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdatePortalSession
ON [${flyway:defaultSchema}].[PortalSession]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[PortalSession]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[PortalSession] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_SecureMessaging: Portal Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdatePortalSession] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ_BizApps_SecureMessaging: Secure Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Messages
-- Item: vwSecureMessages
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_SecureMessaging: Secure Messages
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SecureMessage
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSecureMessages]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSecureMessages];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSecureMessages]
AS
SELECT
    s.*
FROM
    [${flyway:defaultSchema}].[SecureMessage] AS s
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSecureMessages] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_SecureMessaging: Secure Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Messages
-- Item: Permissions for vwSecureMessages
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSecureMessages] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_SecureMessaging: Secure Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Messages
-- Item: spCreateSecureMessage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SecureMessage
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSecureMessage]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSecureMessage];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSecureMessage]
    @ID uniqueidentifier = NULL,
    @PortalSessionID uniqueidentifier,
    @ThreadID uniqueidentifier,
    @PersonID_Clear bit = 0,
    @PersonID uniqueidentifier = NULL,
    @Direction nvarchar(20) = NULL,
    @Sender nvarchar(255),
    @Recipient nvarchar(255),
    @Subject_Clear bit = 0,
    @Subject nvarchar(255) = NULL,
    @Content nvarchar(MAX),
    @IsSecure bit = NULL,
    @Status nvarchar(20) = NULL,
    @ExternalMessageID_Clear bit = 0,
    @ExternalMessageID uniqueidentifier = NULL,
    @ReceivedAt datetimeoffset = NULL,
    @IsStarred bit = NULL,
    @IsImported bit = NULL,
    @SourceChannel_Clear bit = 0,
    @SourceChannel nvarchar(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SecureMessage]
            (
                [ID],
                [PortalSessionID],
                [ThreadID],
                [PersonID],
                [Direction],
                [Sender],
                [Recipient],
                [Subject],
                [Content],
                [IsSecure],
                [Status],
                [ExternalMessageID],
                [ReceivedAt],
                [IsStarred],
                [IsImported],
                [SourceChannel]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PortalSessionID,
                @ThreadID,
                CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, NULL) END,
                ISNULL(@Direction, 'Inbound'),
                @Sender,
                @Recipient,
                CASE WHEN @Subject_Clear = 1 THEN NULL ELSE ISNULL(@Subject, NULL) END,
                @Content,
                ISNULL(@IsSecure, 1),
                ISNULL(@Status, 'New'),
                CASE WHEN @ExternalMessageID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalMessageID, NULL) END,
                ISNULL(@ReceivedAt, sysdatetimeoffset()),
                ISNULL(@IsStarred, 0),
                ISNULL(@IsImported, 0),
                CASE WHEN @SourceChannel_Clear = 1 THEN NULL ELSE ISNULL(@SourceChannel, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SecureMessage]
            (
                [PortalSessionID],
                [ThreadID],
                [PersonID],
                [Direction],
                [Sender],
                [Recipient],
                [Subject],
                [Content],
                [IsSecure],
                [Status],
                [ExternalMessageID],
                [ReceivedAt],
                [IsStarred],
                [IsImported],
                [SourceChannel]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PortalSessionID,
                @ThreadID,
                CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, NULL) END,
                ISNULL(@Direction, 'Inbound'),
                @Sender,
                @Recipient,
                CASE WHEN @Subject_Clear = 1 THEN NULL ELSE ISNULL(@Subject, NULL) END,
                @Content,
                ISNULL(@IsSecure, 1),
                ISNULL(@Status, 'New'),
                CASE WHEN @ExternalMessageID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalMessageID, NULL) END,
                ISNULL(@ReceivedAt, sysdatetimeoffset()),
                ISNULL(@IsStarred, 0),
                ISNULL(@IsImported, 0),
                CASE WHEN @SourceChannel_Clear = 1 THEN NULL ELSE ISNULL(@SourceChannel, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSecureMessages] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSecureMessage] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_SecureMessaging: Secure Messages */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSecureMessage] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_SecureMessaging: Secure Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Messages
-- Item: spUpdateSecureMessage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SecureMessage
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSecureMessage]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSecureMessage];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSecureMessage]
    @ID uniqueidentifier,
    @PortalSessionID uniqueidentifier = NULL,
    @ThreadID uniqueidentifier = NULL,
    @PersonID_Clear bit = 0,
    @PersonID uniqueidentifier = NULL,
    @Direction nvarchar(20) = NULL,
    @Sender nvarchar(255) = NULL,
    @Recipient nvarchar(255) = NULL,
    @Subject_Clear bit = 0,
    @Subject nvarchar(255) = NULL,
    @Content nvarchar(MAX) = NULL,
    @IsSecure bit = NULL,
    @Status nvarchar(20) = NULL,
    @ExternalMessageID_Clear bit = 0,
    @ExternalMessageID uniqueidentifier = NULL,
    @ReceivedAt datetimeoffset = NULL,
    @IsStarred bit = NULL,
    @IsImported bit = NULL,
    @SourceChannel_Clear bit = 0,
    @SourceChannel nvarchar(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SecureMessage]
    SET
        [PortalSessionID] = ISNULL(@PortalSessionID, [PortalSessionID]),
        [ThreadID] = ISNULL(@ThreadID, [ThreadID]),
        [PersonID] = CASE WHEN @PersonID_Clear = 1 THEN NULL ELSE ISNULL(@PersonID, [PersonID]) END,
        [Direction] = ISNULL(@Direction, [Direction]),
        [Sender] = ISNULL(@Sender, [Sender]),
        [Recipient] = ISNULL(@Recipient, [Recipient]),
        [Subject] = CASE WHEN @Subject_Clear = 1 THEN NULL ELSE ISNULL(@Subject, [Subject]) END,
        [Content] = ISNULL(@Content, [Content]),
        [IsSecure] = ISNULL(@IsSecure, [IsSecure]),
        [Status] = ISNULL(@Status, [Status]),
        [ExternalMessageID] = CASE WHEN @ExternalMessageID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalMessageID, [ExternalMessageID]) END,
        [ReceivedAt] = ISNULL(@ReceivedAt, [ReceivedAt]),
        [IsStarred] = ISNULL(@IsStarred, [IsStarred]),
        [IsImported] = ISNULL(@IsImported, [IsImported]),
        [SourceChannel] = CASE WHEN @SourceChannel_Clear = 1 THEN NULL ELSE ISNULL(@SourceChannel, [SourceChannel]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSecureMessages] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSecureMessages]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSecureMessage] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SecureMessage table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSecureMessage]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSecureMessage];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSecureMessage
ON [${flyway:defaultSchema}].[SecureMessage]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SecureMessage]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SecureMessage] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_SecureMessaging: Secure Messages */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSecureMessage] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_SecureMessaging: File Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: File Requests
-- Item: spDeleteFileRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteFileRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteFileRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteFileRequest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[FileRequest]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFileRequest] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_SecureMessaging: File Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteFileRequest] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_SecureMessaging: Message Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Message Files
-- Item: spDeleteMessageFile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MessageFile
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteMessageFile]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteMessageFile];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteMessageFile]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[MessageFile]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMessageFile] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_SecureMessaging: Message Files */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteMessageFile] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_SecureMessaging: Portal Magic Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
-- Item: spDeletePortalMagicLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PortalMagicLink
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePortalMagicLink]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePortalMagicLink];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePortalMagicLink]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PortalMagicLink]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePortalMagicLink] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_SecureMessaging: Portal Magic Links */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePortalMagicLink] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_SecureMessaging: Portal Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
-- Item: spDeletePortalSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PortalSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeletePortalSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeletePortalSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeletePortalSession]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[PortalSession]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePortalSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_SecureMessaging: Portal Sessions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeletePortalSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_SecureMessaging: Secure Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Messages
-- Item: spDeleteSecureMessage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SecureMessage
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSecureMessage]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSecureMessage];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSecureMessage]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SecureMessage]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSecureMessage] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_SecureMessaging: Secure Messages */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSecureMessage] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for SecureThread */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Threads
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ_BizApps_SecureMessaging: Secure Threads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Threads
-- Item: vwSecureThreads
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_SecureMessaging: Secure Threads
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  SecureThread
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwSecureThreads]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwSecureThreads];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwSecureThreads]
AS
SELECT
    s.*
FROM
    [${flyway:defaultSchema}].[SecureThread] AS s
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwSecureThreads] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ_BizApps_SecureMessaging: Secure Threads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Threads
-- Item: Permissions for vwSecureThreads
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwSecureThreads] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ_BizApps_SecureMessaging: Secure Threads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Threads
-- Item: spCreateSecureThread
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SecureThread
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSecureThread]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSecureThread];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSecureThread]
    @ID uniqueidentifier = NULL,
    @ContactID uniqueidentifier,
    @Subject nvarchar(500),
    @Status nvarchar(20) = NULL,
    @SourceChannel_Clear bit = 0,
    @SourceChannel nvarchar(50) = NULL,
    @CreatedByUserID_Clear bit = 0,
    @CreatedByUserID uniqueidentifier = NULL,
    @LastMessageAt_Clear bit = 0,
    @LastMessageAt datetimeoffset = NULL,
    @IsDeleted bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SecureThread]
            (
                [ID],
                [ContactID],
                [Subject],
                [Status],
                [SourceChannel],
                [CreatedByUserID],
                [LastMessageAt],
                [IsDeleted]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContactID,
                @Subject,
                ISNULL(@Status, 'Active'),
                CASE WHEN @SourceChannel_Clear = 1 THEN NULL ELSE ISNULL(@SourceChannel, NULL) END,
                CASE WHEN @CreatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@CreatedByUserID, NULL) END,
                CASE WHEN @LastMessageAt_Clear = 1 THEN NULL ELSE ISNULL(@LastMessageAt, NULL) END,
                ISNULL(@IsDeleted, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SecureThread]
            (
                [ContactID],
                [Subject],
                [Status],
                [SourceChannel],
                [CreatedByUserID],
                [LastMessageAt],
                [IsDeleted]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContactID,
                @Subject,
                ISNULL(@Status, 'Active'),
                CASE WHEN @SourceChannel_Clear = 1 THEN NULL ELSE ISNULL(@SourceChannel, NULL) END,
                CASE WHEN @CreatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@CreatedByUserID, NULL) END,
                CASE WHEN @LastMessageAt_Clear = 1 THEN NULL ELSE ISNULL(@LastMessageAt, NULL) END,
                ISNULL(@IsDeleted, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwSecureThreads] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSecureThread] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ_BizApps_SecureMessaging: Secure Threads */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSecureThread] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ_BizApps_SecureMessaging: Secure Threads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Threads
-- Item: spUpdateSecureThread
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SecureThread
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSecureThread]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSecureThread];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSecureThread]
    @ID uniqueidentifier,
    @ContactID uniqueidentifier = NULL,
    @Subject nvarchar(500) = NULL,
    @Status nvarchar(20) = NULL,
    @SourceChannel_Clear bit = 0,
    @SourceChannel nvarchar(50) = NULL,
    @CreatedByUserID_Clear bit = 0,
    @CreatedByUserID uniqueidentifier = NULL,
    @LastMessageAt_Clear bit = 0,
    @LastMessageAt datetimeoffset = NULL,
    @IsDeleted bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SecureThread]
    SET
        [ContactID] = ISNULL(@ContactID, [ContactID]),
        [Subject] = ISNULL(@Subject, [Subject]),
        [Status] = ISNULL(@Status, [Status]),
        [SourceChannel] = CASE WHEN @SourceChannel_Clear = 1 THEN NULL ELSE ISNULL(@SourceChannel, [SourceChannel]) END,
        [CreatedByUserID] = CASE WHEN @CreatedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@CreatedByUserID, [CreatedByUserID]) END,
        [LastMessageAt] = CASE WHEN @LastMessageAt_Clear = 1 THEN NULL ELSE ISNULL(@LastMessageAt, [LastMessageAt]) END,
        [IsDeleted] = ISNULL(@IsDeleted, [IsDeleted])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwSecureThreads] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwSecureThreads]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSecureThread] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SecureThread table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSecureThread]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSecureThread];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSecureThread
ON [${flyway:defaultSchema}].[SecureThread]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SecureThread]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SecureThread] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ_BizApps_SecureMessaging: Secure Threads */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSecureThread] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ_BizApps_SecureMessaging: Secure Threads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Threads
-- Item: spDeleteSecureThread
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SecureThread
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteSecureThread]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteSecureThread];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteSecureThread]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[SecureThread]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSecureThread] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ_BizApps_SecureMessaging: Secure Threads */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteSecureThread] TO [cdp_Developer], [cdp_Integration];

/* SQL text to delete unneeded entity fields (6 scoped entities) */
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon', @EntityIDs='1409049B-3E4A-4D8D-81EF-E70D9CE50A88,8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9,2B2E8762-39B4-488D-953C-BA1169E774D1,95A23EED-0C13-4D65-965C-FD40C371C870,C08C5B36-FFFD-455B-849E-9481C8E1286C,92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27';

/* SQL text to update existing entity fields from schema (6 scoped entities) */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon', @EntityIDs='1409049B-3E4A-4D8D-81EF-E70D9CE50A88,8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9,2B2E8762-39B4-488D-953C-BA1169E774D1,95A23EED-0C13-4D65-965C-FD40C371C870,C08C5B36-FFFD-455B-849E-9481C8E1286C,92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},__mj_BizAppsCommon';

