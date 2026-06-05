-- MJ Secure Messaging - Core self-contained schema (v1.1.x)
-- Adds an app-agnostic message store plus file-link, file-request, and signature-request
-- tables, all owned by the secure_messaging schema. Bytes for files live in core MJ
-- File Storage (MJ: Files) wrapped as MJ Artifacts; these tables only hold references.

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
    [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
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
    [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
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


-- =====================================================================================
-- SignatureRequest
-- A request to have a document e-signed. The actual signing integration (e.g. DocuSign)
-- is pluggable via a SignatureProvider; ExternalEnvelopeID holds the provider's envelope.
-- =====================================================================================
CREATE TABLE [${flyway:defaultSchema}].[SignatureRequest] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PortalSessionID] UNIQUEIDENTIFIER NOT NULL,
    [ThreadID] NVARCHAR(255) NOT NULL,
    [ArtifactID] UNIQUEIDENTIFIER NULL,
    [Title] NVARCHAR(255) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Draft',
    [Provider] NVARCHAR(50) NOT NULL DEFAULT 'DocuSign',
    [ExternalEnvelopeID] NVARCHAR(255) NULL,
    [SentAt] DATETIMEOFFSET NULL,
    [CompletedAt] DATETIMEOFFSET NULL,
    [__mj_CreatedAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT [PK_SignatureRequest] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_SignatureRequest_PortalSession] FOREIGN KEY ([PortalSessionID]) REFERENCES [${flyway:defaultSchema}].[PortalSession]([ID]),
    CONSTRAINT [CK_SignatureRequest_Status] CHECK ([Status] IN ('Draft', 'Sent', 'Signed', 'Declined', 'Cancelled'))
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'A request to have a document electronically signed by the external contact. The signing integration is pluggable (e.g. DocuSign); ExternalEnvelopeID holds the provider envelope ID once sent.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'SignatureRequest';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Soft reference to MJ: Artifacts.ID for the document to be signed.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'SignatureRequest',
    @level2type=N'COLUMN', @level2name=N'ArtifactID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Signature lifecycle status: Draft, Sent, Signed, Declined, or Cancelled.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'SignatureRequest',
    @level2type=N'COLUMN', @level2name=N'Status';
