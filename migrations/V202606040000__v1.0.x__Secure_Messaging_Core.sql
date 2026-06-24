-- MJ Secure Messaging - Core self-contained schema (v1.1.x)
-- Adds an app-agnostic message store plus file-link and file-request tables, all owned by
-- the __mj_BizAppsSecureMessaging schema. Bytes for files live in core MJ File Storage (MJ: Files)
-- wrapped as MJ Artifacts; these tables only hold references.
--
-- E-signature is handled by the core MJ eSignature subsystem (@memberjunction/esignature and
-- its provider drivers), which owns its own MJ: Signature* entities, accounts, and credentials.
-- A signature request is linked back to a portal session via its polymorphic EntityID/RecordID,
-- so this schema no longer defines a SignatureRequest table.

-- =====================================================================================
-- SecureMessage
-- The self-contained message store. The app no longer requires Izzy's Channel Messages
-- entity to function. When the optional Channel Messages adapter is enabled, the mirrored
-- Channel Message ID is recorded in ExternalMessageID.
-- =====================================================================================
CREATE TABLE [${flyway:defaultSchema}].[SecureMessage] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PortalSessionID] UNIQUEIDENTIFIER NOT NULL,
    [ThreadID] NVARCHAR(255) NOT NULL,
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
    CONSTRAINT [PK_SecureMessage] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_SecureMessage_PortalSession] FOREIGN KEY ([PortalSessionID]) REFERENCES [${flyway:defaultSchema}].[PortalSession]([ID]),
    CONSTRAINT [CK_SecureMessage_Direction] CHECK ([Direction] IN ('Inbound', 'Outbound')),
    CONSTRAINT [CK_SecureMessage_Status] CHECK ([Status] IN ('New', 'Read', 'Replied', 'Sent', 'Failed'))
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Self-contained secure message store. Each row is one inbound or outbound message in a thread. App-agnostic: does not require an external Channel Messages entity.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'SecureMessage';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference to the person (e.g. MJ_BizApps_Common.People.ID). Not a hard FK so the schema stays standalone.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'SecureMessage',
    @level2type=N'COLUMN', @level2name=N'PersonID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Direction of the message relative to the organization: Inbound (from contact) or Outbound (reply to contact).',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'SecureMessage',
    @level2type=N'COLUMN', @level2name=N'Direction';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the Channel Messages adapter is active, holds the mirrored Channel Message ID so the AI pipeline can process the message. NULL in the self-contained path.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'SecureMessage',
    @level2type=N'COLUMN', @level2name=N'ExternalMessageID';


-- =====================================================================================
-- MessageFile
-- Links an uploaded file to a secure message. Bytes live in MJ: Files (via a storage
-- provider) and are wrapped as an MJ Artifact; this table holds only references plus
-- denormalized display metadata.
-- =====================================================================================
CREATE TABLE [${flyway:defaultSchema}].[MessageFile] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [SecureMessageID] UNIQUEIDENTIFIER NULL,
    [ExternalMessageID] UNIQUEIDENTIFIER NULL,
    [ThreadID] NVARCHAR(255) NOT NULL,
    [ArtifactID] UNIQUEIDENTIFIER NULL,
    [FileID] UNIQUEIDENTIFIER NULL,
    [Filename] NVARCHAR(500) NOT NULL,
    [ContentType] NVARCHAR(255) NULL,
    [Size] BIGINT NULL,
    CONSTRAINT [PK_MessageFile] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_MessageFile_SecureMessage] FOREIGN KEY ([SecureMessageID]) REFERENCES [${flyway:defaultSchema}].[SecureMessage]([ID])
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Links an uploaded file to a secure message. Bytes are stored in core MJ File Storage (MJ: Files) and wrapped as an MJ Artifact; this table holds references and display metadata only.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'MessageFile';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference to MJ: Artifacts.ID wrapping the uploaded file.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'MessageFile',
    @level2type=N'COLUMN', @level2name=N'ArtifactID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference to MJ: Files.ID holding the bytes in the configured storage provider.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'MessageFile',
    @level2type=N'COLUMN', @level2name=N'FileID';


-- =====================================================================================
-- FileRequest
-- A request from staff for the external contact to upload one or more files.
-- =====================================================================================
CREATE TABLE [${flyway:defaultSchema}].[FileRequest] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PortalSessionID] UNIQUEIDENTIFIER NOT NULL,
    [ThreadID] NVARCHAR(255) NOT NULL,
    [Title] NVARCHAR(255) NOT NULL,
    [Instructions] NVARCHAR(MAX) NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [RequestedByUserID] UNIQUEIDENTIFIER NULL,
    [DueAt] DATETIMEOFFSET NULL,
    [FulfilledAt] DATETIMEOFFSET NULL,
    CONSTRAINT [PK_FileRequest] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_FileRequest_PortalSession] FOREIGN KEY ([PortalSessionID]) REFERENCES [${flyway:defaultSchema}].[PortalSession]([ID]),
    CONSTRAINT [CK_FileRequest_Status] CHECK ([Status] IN ('Pending', 'Fulfilled', 'Cancelled'))
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'A request from staff for the external contact to securely upload one or more files. Fulfilled by uploading files (stored as MessageFile rows) and setting Status to Fulfilled.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'FileRequest';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Request lifecycle status: Pending, Fulfilled, or Cancelled.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'FileRequest',
    @level2type=N'COLUMN', @level2name=N'Status';















































/*----------------------------------------CODEGEN------------------------------------------*/
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
         '70466df4-eae8-4863-8cc9-da7a1e3014c2',
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

/* SQL generated to create new application ${flyway:defaultSchema} */
INSERT INTO [${mjSchema}].[Application] (ID, Name, Description, SchemaAutoAddNewEntities, Path, AutoUpdatePath)
                       VALUES ('933e5384-b47b-449c-bb84-ae4441d2049a', '${flyway:defaultSchema}', 'Generated for schema', '${flyway:defaultSchema}', 'mjbizappssecuremessaging', 1);

/* Adding role UI to application ${flyway:defaultSchema} */
INSERT INTO [${mjSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('933e5384-b47b-449c-bb84-ae4441d2049a', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0);

/* Adding role Developer to application ${flyway:defaultSchema} */
INSERT INTO [${mjSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('933e5384-b47b-449c-bb84-ae4441d2049a', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1);

/* Adding role Integration to application ${flyway:defaultSchema} */
INSERT INTO [${mjSchema}].[ApplicationRole]
                                 ([ApplicationID], [RoleID], [CanAccess], [CanAdmin]) VALUES
                                 ('933e5384-b47b-449c-bb84-ae4441d2049a', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0);

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Secure Messages to application ID: '933e5384-b47b-449c-bb84-ae4441d2049a' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('933e5384-b47b-449c-bb84-ae4441d2049a', '70466df4-eae8-4863-8cc9-da7a1e3014c2', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = '933e5384-b47b-449c-bb84-ae4441d2049a'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Messages for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('70466df4-eae8-4863-8cc9-da7a1e3014c2', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Messages for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('70466df4-eae8-4863-8cc9-da7a1e3014c2', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Messages for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('70466df4-eae8-4863-8cc9-da7a1e3014c2', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '4941d1b0-d035-48f7-a0c8-ed7de5ed86fb',
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

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Message Files to application ID: '933E5384-B47B-449C-BB84-AE4441D2049A' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('933E5384-B47B-449C-BB84-AE4441D2049A', '4941d1b0-d035-48f7-a0c8-ed7de5ed86fb', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = '933E5384-B47B-449C-BB84-AE4441D2049A'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Message Files for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4941d1b0-d035-48f7-a0c8-ed7de5ed86fb', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Message Files for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4941d1b0-d035-48f7-a0c8-ed7de5ed86fb', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Message Files for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4941d1b0-d035-48f7-a0c8-ed7de5ed86fb', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '68555b34-312e-476c-bf8f-4062864fe5b9',
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

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: File Requests to application ID: '933E5384-B47B-449C-BB84-AE4441D2049A' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('933E5384-B47B-449C-BB84-AE4441D2049A', '68555b34-312e-476c-bf8f-4062864fe5b9', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = '933E5384-B47B-449C-BB84-AE4441D2049A'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: File Requests for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('68555b34-312e-476c-bf8f-4062864fe5b9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: File Requests for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('68555b34-312e-476c-bf8f-4062864fe5b9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: File Requests for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('68555b34-312e-476c-bf8f-4062864fe5b9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         '6d813f0b-0217-4789-a69b-5d1a966e4293',
         'MJ_BizApps_SecureMessaging: Portal Sessions',
         'Portal Sessions',
         'Tracks active secure messaging sessions for external contacts. Each session maps a contact to a channel thread and is authenticated via a hashed opaque token.',
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

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Portal Sessions to application ID: '933E5384-B47B-449C-BB84-AE4441D2049A' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('933E5384-B47B-449C-BB84-AE4441D2049A', '6d813f0b-0217-4789-a69b-5d1a966e4293', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = '933E5384-B47B-449C-BB84-AE4441D2049A'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Sessions for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6d813f0b-0217-4789-a69b-5d1a966e4293', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Sessions for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6d813f0b-0217-4789-a69b-5d1a966e4293', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Sessions for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('6d813f0b-0217-4789-a69b-5d1a966e4293', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

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
         'd5e0a5ca-a44b-4544-9d4e-e46ba33fdb68',
         'MJ_BizApps_SecureMessaging: Portal Magic Links',
         'Portal Magic Links',
         'Single-use magic links for re-authenticating expired portal sessions. Short-lived (15 min default), redeems into a fresh session token.',
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

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Portal Magic Links to application ID: '933E5384-B47B-449C-BB84-AE4441D2049A' */
INSERT INTO [${mjSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('933E5384-B47B-449C-BB84-AE4441D2049A', 'd5e0a5ca-a44b-4544-9d4e-e46ba33fdb68', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${mjSchema}].[ApplicationEntity] WHERE [ApplicationID] = '933E5384-B47B-449C-BB84-AE4441D2049A'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Magic Links for role UI */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d5e0a5ca-a44b-4544-9d4e-e46ba33fdb68', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Magic Links for role Developer */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d5e0a5ca-a44b-4544-9d4e-e46ba33fdb68', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Magic Links for role Integration */
INSERT INTO [${mjSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('d5e0a5ca-a44b-4544-9d4e-e46ba33fdb68', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to update existing entities from schema */
EXEC [${mjSchema}].[spUpdateExistingEntitiesFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon';

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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '214345c7-824f-4b3d-826e-c19aea22aeae' OR (EntityID = '68555B34-312E-476C-BF8F-4062864FE5B9' AND Name = 'ID')) BEGIN
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
            '214345c7-824f-4b3d-826e-c19aea22aeae',
            '68555B34-312E-476C-BF8F-4062864FE5B9', -- Entity: MJ_BizApps_SecureMessaging: File Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b0023805-50c5-437f-908d-f019ef359d26' OR (EntityID = '68555B34-312E-476C-BF8F-4062864FE5B9' AND Name = 'PortalSessionID')) BEGIN
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
            'b0023805-50c5-437f-908d-f019ef359d26',
            '68555B34-312E-476C-BF8F-4062864FE5B9', -- Entity: MJ_BizApps_SecureMessaging: File Requests
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
            '6D813F0B-0217-4789-A69B-5D1A966E4293',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'f31f5789-71d4-4439-8d30-39d907979149' OR (EntityID = '68555B34-312E-476C-BF8F-4062864FE5B9' AND Name = 'ThreadID')) BEGIN
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
            'f31f5789-71d4-4439-8d30-39d907979149',
            '68555B34-312E-476C-BF8F-4062864FE5B9', -- Entity: MJ_BizApps_SecureMessaging: File Requests
            100003,
            'ThreadID',
            'Thread ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '475646cb-e1ca-438a-a367-65a6a18f491b' OR (EntityID = '68555B34-312E-476C-BF8F-4062864FE5B9' AND Name = 'Title')) BEGIN
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
            '475646cb-e1ca-438a-a367-65a6a18f491b',
            '68555B34-312E-476C-BF8F-4062864FE5B9', -- Entity: MJ_BizApps_SecureMessaging: File Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8402a227-cf29-4a4e-ad5f-ced311639e2f' OR (EntityID = '68555B34-312E-476C-BF8F-4062864FE5B9' AND Name = 'Instructions')) BEGIN
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
            '8402a227-cf29-4a4e-ad5f-ced311639e2f',
            '68555B34-312E-476C-BF8F-4062864FE5B9', -- Entity: MJ_BizApps_SecureMessaging: File Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ded4e7b4-07ed-4f89-9a43-1f130640df13' OR (EntityID = '68555B34-312E-476C-BF8F-4062864FE5B9' AND Name = 'Status')) BEGIN
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
            'ded4e7b4-07ed-4f89-9a43-1f130640df13',
            '68555B34-312E-476C-BF8F-4062864FE5B9', -- Entity: MJ_BizApps_SecureMessaging: File Requests
            100006,
            'Status',
            'Status',
            'Request lifecycle status: Pending, Fulfilled, or Cancelled.',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '14bbf4be-01f7-44b9-924f-7dda387f51c5' OR (EntityID = '68555B34-312E-476C-BF8F-4062864FE5B9' AND Name = 'RequestedByUserID')) BEGIN
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
            '14bbf4be-01f7-44b9-924f-7dda387f51c5',
            '68555B34-312E-476C-BF8F-4062864FE5B9', -- Entity: MJ_BizApps_SecureMessaging: File Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '8dfc7a40-3181-4264-aff2-cee7bf6e9386' OR (EntityID = '68555B34-312E-476C-BF8F-4062864FE5B9' AND Name = 'DueAt')) BEGIN
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
            '8dfc7a40-3181-4264-aff2-cee7bf6e9386',
            '68555B34-312E-476C-BF8F-4062864FE5B9', -- Entity: MJ_BizApps_SecureMessaging: File Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a8c8daf3-83dd-40b3-bef7-aa2bea3ec96e' OR (EntityID = '68555B34-312E-476C-BF8F-4062864FE5B9' AND Name = 'FulfilledAt')) BEGIN
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
            'a8c8daf3-83dd-40b3-bef7-aa2bea3ec96e',
            '68555B34-312E-476C-BF8F-4062864FE5B9', -- Entity: MJ_BizApps_SecureMessaging: File Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b21bb51f-d1c3-4bb4-b3ee-847466c96b01' OR (EntityID = '68555B34-312E-476C-BF8F-4062864FE5B9' AND Name = '__mj_CreatedAt')) BEGIN
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
            'b21bb51f-d1c3-4bb4-b3ee-847466c96b01',
            '68555B34-312E-476C-BF8F-4062864FE5B9', -- Entity: MJ_BizApps_SecureMessaging: File Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '215cdf79-bdc3-4385-aef2-97ebc5d8b57e' OR (EntityID = '68555B34-312E-476C-BF8F-4062864FE5B9' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '215cdf79-bdc3-4385-aef2-97ebc5d8b57e',
            '68555B34-312E-476C-BF8F-4062864FE5B9', -- Entity: MJ_BizApps_SecureMessaging: File Requests
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '04fe2642-5b10-40e9-86f1-f77bd4d37c7f' OR (EntityID = '6D813F0B-0217-4789-A69B-5D1A966E4293' AND Name = 'ID')) BEGIN
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
            '04fe2642-5b10-40e9-86f1-f77bd4d37c7f',
            '6D813F0B-0217-4789-A69B-5D1A966E4293', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '91bdbd8b-529d-4b36-ac81-2fa5c262e80f' OR (EntityID = '6D813F0B-0217-4789-A69B-5D1A966E4293' AND Name = 'ChannelID')) BEGIN
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
            '91bdbd8b-529d-4b36-ac81-2fa5c262e80f',
            '6D813F0B-0217-4789-A69B-5D1A966E4293', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100002,
            'ChannelID',
            'Channel ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bda5b183-1cb6-4777-b6e0-0ef3e9bb1ed6' OR (EntityID = '6D813F0B-0217-4789-A69B-5D1A966E4293' AND Name = 'ContactID')) BEGIN
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
            'bda5b183-1cb6-4777-b6e0-0ef3e9bb1ed6',
            '6D813F0B-0217-4789-A69B-5D1A966E4293', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100003,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'fe9f875a-e2c7-4e5a-8a4f-def05ef09d3e' OR (EntityID = '6D813F0B-0217-4789-A69B-5D1A966E4293' AND Name = 'ThreadID')) BEGIN
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
            'fe9f875a-e2c7-4e5a-8a4f-def05ef09d3e',
            '6D813F0B-0217-4789-A69B-5D1A966E4293', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100004,
            'ThreadID',
            'Thread ID',
            'Groups messages into a conversation thread',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a42f2181-d5d5-4f0e-904d-52dbaf71eca7' OR (EntityID = '6D813F0B-0217-4789-A69B-5D1A966E4293' AND Name = 'TokenHash')) BEGIN
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
            'a42f2181-d5d5-4f0e-904d-52dbaf71eca7',
            '6D813F0B-0217-4789-A69B-5D1A966E4293', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100005,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'd222eed6-7410-45f6-a493-030a6acd1063' OR (EntityID = '6D813F0B-0217-4789-A69B-5D1A966E4293' AND Name = 'Status')) BEGIN
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
            'd222eed6-7410-45f6-a493-030a6acd1063',
            '6D813F0B-0217-4789-A69B-5D1A966E4293', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100006,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6fdd93a9-46d3-4f15-bb87-c5bc7d280e63' OR (EntityID = '6D813F0B-0217-4789-A69B-5D1A966E4293' AND Name = 'ExpiresAt')) BEGIN
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
            '6fdd93a9-46d3-4f15-bb87-c5bc7d280e63',
            '6D813F0B-0217-4789-A69B-5D1A966E4293', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100007,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3e9084dc-9efe-4c3c-950e-d893d66471fb' OR (EntityID = '6D813F0B-0217-4789-A69B-5D1A966E4293' AND Name = 'LastAccessedAt')) BEGIN
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
            '3e9084dc-9efe-4c3c-950e-d893d66471fb',
            '6D813F0B-0217-4789-A69B-5D1A966E4293', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
            100008,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b7dd0228-0090-4786-90f3-344ab7276597' OR (EntityID = '6D813F0B-0217-4789-A69B-5D1A966E4293' AND Name = '__mj_CreatedAt')) BEGIN
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
            'b7dd0228-0090-4786-90f3-344ab7276597',
            '6D813F0B-0217-4789-A69B-5D1A966E4293', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3efce8be-e96b-4325-b100-121b9e94aebb' OR (EntityID = '6D813F0B-0217-4789-A69B-5D1A966E4293' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '3efce8be-e96b-4325-b100-121b9e94aebb',
            '6D813F0B-0217-4789-A69B-5D1A966E4293', -- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '880fdf46-f9bc-4523-8b22-f10b5110a7a1' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = 'ID')) BEGIN
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
            '880fdf46-f9bc-4523-8b22-f10b5110a7a1',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cc3830b0-32df-4f89-a588-fa83b87f6a42' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = 'PortalSessionID')) BEGIN
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
            'cc3830b0-32df-4f89-a588-fa83b87f6a42',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
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
            '6D813F0B-0217-4789-A69B-5D1A966E4293',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e0b0be78-5f63-4c27-b260-a9d6ccc0be06' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = 'ThreadID')) BEGIN
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
            'e0b0be78-5f63-4c27-b260-a9d6ccc0be06',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100003,
            'ThreadID',
            'Thread ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'aab0c970-051a-477b-8d13-631be947f03c' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = 'PersonID')) BEGIN
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
            'aab0c970-051a-477b-8d13-631be947f03c',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '3f4d0dce-9fc7-42eb-8c40-fd848eb60627' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = 'Direction')) BEGIN
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
            '3f4d0dce-9fc7-42eb-8c40-fd848eb60627',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'c689178a-8447-472f-b559-a3b277d73207' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = 'Sender')) BEGIN
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
            'c689178a-8447-472f-b559-a3b277d73207',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'cfa870e3-0a53-4f10-a89d-d77699ec8705' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = 'Recipient')) BEGIN
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
            'cfa870e3-0a53-4f10-a89d-d77699ec8705',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5708eea7-45a2-4314-a60c-dccbdc14f923' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = 'Subject')) BEGIN
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
            '5708eea7-45a2-4314-a60c-dccbdc14f923',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'b39504c5-8abd-43ad-9edc-da95ed9c668f' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = 'Content')) BEGIN
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
            'b39504c5-8abd-43ad-9edc-da95ed9c668f',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '68172ece-8323-4876-ad85-0374906689c6' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = 'IsSecure')) BEGIN
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
            '68172ece-8323-4876-ad85-0374906689c6',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'ca3363d7-1497-46c3-97fb-65732fe06fd2' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = 'Status')) BEGIN
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
            'ca3363d7-1497-46c3-97fb-65732fe06fd2',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'daafcac8-0d4a-4aaf-b494-3bd88925a450' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = 'ExternalMessageID')) BEGIN
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
            'daafcac8-0d4a-4aaf-b494-3bd88925a450',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '976d7f86-dc74-4fda-9d0e-ddd5bca71b69' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = 'ReceivedAt')) BEGIN
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
            '976d7f86-dc74-4fda-9d0e-ddd5bca71b69',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9781b461-cfb5-4f08-bd77-4c9462056378' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = '__mj_CreatedAt')) BEGIN
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
            '9781b461-cfb5-4f08-bd77-4c9462056378',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100014,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a12a3e48-ec06-4385-859b-748dce683659' OR (EntityID = '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2' AND Name = '__mj_UpdatedAt')) BEGIN
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
            'a12a3e48-ec06-4385-859b-748dce683659',
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', -- Entity: MJ_BizApps_SecureMessaging: Secure Messages
            100015,
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bf8a1281-6720-498d-80e8-1128e8d3f828' OR (EntityID = 'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68' AND Name = 'ID')) BEGIN
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
            'bf8a1281-6720-498d-80e8-1128e8d3f828',
            'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'efbc93ad-899b-48b5-a80b-6a102a5d2a25' OR (EntityID = 'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68' AND Name = 'PortalSessionID')) BEGIN
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
            'efbc93ad-899b-48b5-a80b-6a102a5d2a25',
            'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
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
            '6D813F0B-0217-4789-A69B-5D1A966E4293',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '168bcbf9-c681-4ca6-88b4-5113e605cd5a' OR (EntityID = 'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68' AND Name = 'TokenHash')) BEGIN
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
            '168bcbf9-c681-4ca6-88b4-5113e605cd5a',
            'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'e63c186d-d75d-4182-ad28-49e5ade86fa5' OR (EntityID = 'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68' AND Name = 'Status')) BEGIN
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
            'e63c186d-d75d-4182-ad28-49e5ade86fa5',
            'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '898db2fa-450a-4de6-a25d-213ab5d27ca2' OR (EntityID = 'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68' AND Name = 'ExpiresAt')) BEGIN
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
            '898db2fa-450a-4de6-a25d-213ab5d27ca2',
            'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '7b8c7771-8354-4852-84b4-cadaa3a16ac6' OR (EntityID = 'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68' AND Name = 'UsedAt')) BEGIN
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
            '7b8c7771-8354-4852-84b4-cadaa3a16ac6',
            'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '82d4ceee-3f63-4272-9c31-2c877c8fc31a' OR (EntityID = 'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68' AND Name = '__mj_CreatedAt')) BEGIN
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
            '82d4ceee-3f63-4272-9c31-2c877c8fc31a',
            'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5a16ceb6-400d-42c8-950a-8f2d1d5cb219' OR (EntityID = 'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '5a16ceb6-400d-42c8-950a-8f2d1d5cb219',
            'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68', -- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '58deb828-263a-491f-b792-2d243ab88069' OR (EntityID = '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB' AND Name = 'ID')) BEGIN
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
            '58deb828-263a-491f-b792-2d243ab88069',
            '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB', -- Entity: MJ_BizApps_SecureMessaging: Message Files
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '1000245c-966e-4f62-a617-578b6ed81b7f' OR (EntityID = '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB' AND Name = 'SecureMessageID')) BEGIN
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
            '1000245c-966e-4f62-a617-578b6ed81b7f',
            '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB', -- Entity: MJ_BizApps_SecureMessaging: Message Files
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
            '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '9d2fcdb6-d2d1-4f07-9d1f-45cb17b2b464' OR (EntityID = '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB' AND Name = 'ExternalMessageID')) BEGIN
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
            '9d2fcdb6-d2d1-4f07-9d1f-45cb17b2b464',
            '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB', -- Entity: MJ_BizApps_SecureMessaging: Message Files
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'a10b3950-44ce-4461-9dea-05030b3522c7' OR (EntityID = '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB' AND Name = 'ThreadID')) BEGIN
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
            'a10b3950-44ce-4461-9dea-05030b3522c7',
            '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB', -- Entity: MJ_BizApps_SecureMessaging: Message Files
            100004,
            'ThreadID',
            'Thread ID',
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'bd99a423-5230-44ac-906b-33f8cb3ec320' OR (EntityID = '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB' AND Name = 'ArtifactID')) BEGIN
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
            'bd99a423-5230-44ac-906b-33f8cb3ec320',
            '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB', -- Entity: MJ_BizApps_SecureMessaging: Message Files
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '19850f4d-2de1-4aed-821c-7c5d31923c4f' OR (EntityID = '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB' AND Name = 'FileID')) BEGIN
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
            '19850f4d-2de1-4aed-821c-7c5d31923c4f',
            '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB', -- Entity: MJ_BizApps_SecureMessaging: Message Files
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = 'dd25a1bb-4452-45ed-a4d0-a46b24c2c4ce' OR (EntityID = '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB' AND Name = 'Filename')) BEGIN
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
            'dd25a1bb-4452-45ed-a4d0-a46b24c2c4ce',
            '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB', -- Entity: MJ_BizApps_SecureMessaging: Message Files
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '5d357349-77d1-4148-bab3-e480fcb1eceb' OR (EntityID = '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB' AND Name = 'ContentType')) BEGIN
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
            '5d357349-77d1-4148-bab3-e480fcb1eceb',
            '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB', -- Entity: MJ_BizApps_SecureMessaging: Message Files
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '6da701c1-a21e-4dc5-b97e-89867942bcca' OR (EntityID = '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB' AND Name = 'Size')) BEGIN
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
            '6da701c1-a21e-4dc5-b97e-89867942bcca',
            '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB', -- Entity: MJ_BizApps_SecureMessaging: Message Files
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '2987b26e-e09a-42b6-a0a1-06108196c54f' OR (EntityID = '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB' AND Name = '__mj_CreatedAt')) BEGIN
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
            '2987b26e-e09a-42b6-a0a1-06108196c54f',
            '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB', -- Entity: MJ_BizApps_SecureMessaging: Message Files
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

      IF NOT EXISTS (SELECT 1 FROM [${mjSchema}].[EntityField] WHERE ID = '0cff9e86-1c34-4f41-b6e6-da5a0e84df5d' OR (EntityID = '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '0cff9e86-1c34-4f41-b6e6-da5a0e84df5d',
            '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB', -- Entity: MJ_BizApps_SecureMessaging: Message Files
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

/* SQL text to update existing entity fields from schema */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon';

/* SQL text to insert entity field value with ID 29f0b441-e742-4e5e-a593-3d6bd9730b36 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('29f0b441-e742-4e5e-a593-3d6bd9730b36', 'E63C186D-D75D-4182-AD28-49E5ADE86FA5', 1, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 1d6c168d-2892-4c1d-8234-2136847d960f */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('1d6c168d-2892-4c1d-8234-2136847d960f', 'E63C186D-D75D-4182-AD28-49E5ADE86FA5', 2, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 68e71ab7-8741-4b31-9056-42cf94a66cde */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('68e71ab7-8741-4b31-9056-42cf94a66cde', 'E63C186D-D75D-4182-AD28-49E5ADE86FA5', 3, 'Used', 'Used', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID E63C186D-D75D-4182-AD28-49E5ADE86FA5 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='E63C186D-D75D-4182-AD28-49E5ADE86FA5';

/* SQL text to insert entity field value with ID c227dc91-053c-4e9a-bd09-5dd7df9df354 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c227dc91-053c-4e9a-bd09-5dd7df9df354', '3F4D0DCE-9FC7-42EB-8C40-FD848EB60627', 1, 'Inbound', 'Inbound', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID f2bc6562-94e7-494e-a89e-b7cc23285014 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('f2bc6562-94e7-494e-a89e-b7cc23285014', '3F4D0DCE-9FC7-42EB-8C40-FD848EB60627', 2, 'Outbound', 'Outbound', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 3F4D0DCE-9FC7-42EB-8C40-FD848EB60627 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='3F4D0DCE-9FC7-42EB-8C40-FD848EB60627';

/* SQL text to insert entity field value with ID 8677780a-9324-444a-b4c2-fc216690d54d */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8677780a-9324-444a-b4c2-fc216690d54d', 'CA3363D7-1497-46C3-97FB-65732FE06FD2', 1, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ecb9d85f-7fd5-4251-894e-3074e39baf6f */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ecb9d85f-7fd5-4251-894e-3074e39baf6f', 'CA3363D7-1497-46C3-97FB-65732FE06FD2', 2, 'New', 'New', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 809bd470-a748-4be6-b47b-e2376e645361 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('809bd470-a748-4be6-b47b-e2376e645361', 'CA3363D7-1497-46C3-97FB-65732FE06FD2', 3, 'Read', 'Read', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 8f419a16-3e0f-45a2-bc79-ed4f0332b109 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('8f419a16-3e0f-45a2-bc79-ed4f0332b109', 'CA3363D7-1497-46C3-97FB-65732FE06FD2', 4, 'Replied', 'Replied', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 54d91542-2579-47c3-8cd9-df12815c0bd6 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('54d91542-2579-47c3-8cd9-df12815c0bd6', 'CA3363D7-1497-46C3-97FB-65732FE06FD2', 5, 'Sent', 'Sent', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID CA3363D7-1497-46C3-97FB-65732FE06FD2 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='CA3363D7-1497-46C3-97FB-65732FE06FD2';

/* SQL text to insert entity field value with ID d4a7a4f7-ece2-4c1b-99c4-9fe49e2dbfa5 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d4a7a4f7-ece2-4c1b-99c4-9fe49e2dbfa5', 'DED4E7B4-07ED-4F89-9A43-1F130640DF13', 1, 'Cancelled', 'Cancelled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID fae65e3a-ab5b-4829-ac61-2f032a537f47 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('fae65e3a-ab5b-4829-ac61-2f032a537f47', 'DED4E7B4-07ED-4F89-9A43-1F130640DF13', 2, 'Fulfilled', 'Fulfilled', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 010a909f-9419-42df-b13f-20cabd51eef2 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('010a909f-9419-42df-b13f-20cabd51eef2', 'DED4E7B4-07ED-4F89-9A43-1F130640DF13', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID DED4E7B4-07ED-4F89-9A43-1F130640DF13 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='DED4E7B4-07ED-4F89-9A43-1F130640DF13';

/* SQL text to insert entity field value with ID d015b63d-30cb-4e1c-a341-7c382546e8ef */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d015b63d-30cb-4e1c-a341-7c382546e8ef', 'D222EED6-7410-45F6-A493-030A6ACD1063', 1, 'Active', 'Active', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 013de1b6-2b79-4353-8c0b-4a1ffbb06128 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('013de1b6-2b79-4353-8c0b-4a1ffbb06128', 'D222EED6-7410-45F6-A493-030A6ACD1063', 2, 'Expired', 'Expired', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID bc319ede-5981-4b51-b0d0-0d49481b3ff9 */
INSERT INTO [${mjSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('bc319ede-5981-4b51-b0d0-0d49481b3ff9', 'D222EED6-7410-45F6-A493-030A6ACD1063', 3, 'Revoked', 'Revoked', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID D222EED6-7410-45F6-A493-030A6ACD1063 */
UPDATE [${mjSchema}].[EntityField] SET ValueListType='List' WHERE ID='D222EED6-7410-45F6-A493-030A6ACD1063';


/* Create Entity Relationship: MJ_BizApps_SecureMessaging: Portal Sessions -> MJ_BizApps_SecureMessaging: Portal Magic Links (One To Many via PortalSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'c7456ea8-0282-4118-b856-d6caa92bf1f3'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('c7456ea8-0282-4118-b856-d6caa92bf1f3', '6D813F0B-0217-4789-A69B-5D1A966E4293', 'D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68', 'PortalSessionID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_SecureMessaging: Portal Sessions -> MJ_BizApps_SecureMessaging: File Requests (One To Many via PortalSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = 'ef124176-7d72-4d8e-9410-6e8d9b805761'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('ef124176-7d72-4d8e-9410-6e8d9b805761', '6D813F0B-0217-4789-A69B-5D1A966E4293', '68555B34-312E-476C-BF8F-4062864FE5B9', 'PortalSessionID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_SecureMessaging: Portal Sessions -> MJ_BizApps_SecureMessaging: Secure Messages (One To Many via PortalSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '54c6c068-333d-41e3-a2db-3b280a6577e7'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('54c6c068-333d-41e3-a2db-3b280a6577e7', '6D813F0B-0217-4789-A69B-5D1A966E4293', '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', 'PortalSessionID', 'One To Many', 1, 1, 3, GETUTCDATE(), GETUTCDATE())
   END;
                    
/* Create Entity Relationship: MJ_BizApps_SecureMessaging: Secure Messages -> MJ_BizApps_SecureMessaging: Message Files (One To Many via SecureMessageID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${mjSchema}].[EntityRelationship] WHERE [ID] = '4ecdc5db-c85b-4713-857c-9b98c7e29169'
   )
   BEGIN
      INSERT INTO [${mjSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('4ecdc5db-c85b-4713-857c-9b98c7e29169', '70466DF4-EAE8-4863-8CC9-DA7A1E3014C2', '4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB', 'SecureMessageID', 'One To Many', 1, 1, 1, GETUTCDATE(), GETUTCDATE())
   END;

/* SQL text to sync schema info from database schemas */
EXEC [${mjSchema}].[spUpdateSchemaInfoFromDatabase] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon';

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
    @ThreadID nvarchar(255),
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
    @ThreadID nvarchar(255) = NULL,
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
    @ThreadID nvarchar(255),
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
    @ThreadID nvarchar(255) = NULL,
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
    @UsedAt datetimeoffset = NULL
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
                [UsedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PortalSessionID,
                @TokenHash,
                ISNULL(@Status, 'Pending'),
                @ExpiresAt,
                CASE WHEN @UsedAt_Clear = 1 THEN NULL ELSE ISNULL(@UsedAt, NULL) END
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
                [UsedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PortalSessionID,
                @TokenHash,
                ISNULL(@Status, 'Pending'),
                @ExpiresAt,
                CASE WHEN @UsedAt_Clear = 1 THEN NULL ELSE ISNULL(@UsedAt, NULL) END
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
    @UsedAt datetimeoffset = NULL
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
        [UsedAt] = CASE WHEN @UsedAt_Clear = 1 THEN NULL ELSE ISNULL(@UsedAt, [UsedAt]) END
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
    @ChannelID uniqueidentifier,
    @ContactID uniqueidentifier,
    @ThreadID nvarchar(255),
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
                [ChannelID],
                [ContactID],
                [ThreadID],
                [TokenHash],
                [Status],
                [ExpiresAt],
                [LastAccessedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ChannelID,
                @ContactID,
                @ThreadID,
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
                [ChannelID],
                [ContactID],
                [ThreadID],
                [TokenHash],
                [Status],
                [ExpiresAt],
                [LastAccessedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ChannelID,
                @ContactID,
                @ThreadID,
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
    @ChannelID uniqueidentifier = NULL,
    @ContactID uniqueidentifier = NULL,
    @ThreadID nvarchar(255) = NULL,
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
        [ChannelID] = ISNULL(@ChannelID, [ChannelID]),
        [ContactID] = ISNULL(@ContactID, [ContactID]),
        [ThreadID] = ISNULL(@ThreadID, [ThreadID]),
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
    @ThreadID nvarchar(255),
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
    @ReceivedAt datetimeoffset = NULL
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
                [ReceivedAt]
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
                ISNULL(@ReceivedAt, sysdatetimeoffset())
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
                [ReceivedAt]
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
                ISNULL(@ReceivedAt, sysdatetimeoffset())
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
    @ThreadID nvarchar(255) = NULL,
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
    @ReceivedAt datetimeoffset = NULL
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
        [ReceivedAt] = ISNULL(@ReceivedAt, [ReceivedAt])
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

/* SQL text to delete unneeded entity fields (5 scoped entities) */
EXEC [${mjSchema}].[spDeleteUnneededEntityFields] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon', @EntityIDs='70466DF4-EAE8-4863-8CC9-DA7A1E3014C2,4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB,68555B34-312E-476C-BF8F-4062864FE5B9,6D813F0B-0217-4789-A69B-5D1A966E4293,D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68';

/* SQL text to update existing entity fields from schema (5 scoped entities) */
EXEC [${mjSchema}].[spUpdateExistingEntityFieldsFromSchema] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon', @EntityIDs='70466DF4-EAE8-4863-8CC9-DA7A1E3014C2,4941D1B0-D035-48F7-A0C8-ED7DE5ED86FB,68555B34-312E-476C-BF8F-4062864FE5B9,6D813F0B-0217-4789-A69B-5D1A966E4293,D5E0A5CA-A44B-4544-9D4E-E46BA33FDB68';

/* SQL text to set default column width where needed */
EXEC [${mjSchema}].[spSetDefaultColumnWidthWhereNeeded] @ExcludedSchemaNames='sys,staging,dbo,${mjSchema},${mjSchema}_BizAppsCommon';

