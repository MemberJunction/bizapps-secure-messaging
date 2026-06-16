-- MJ Secure Messaging - Initial Schema
-- Creates the __mj_BizAppsSecureMessaging schema with PortalSession and PortalMagicLink tables

CREATE TABLE [${flyway:defaultSchema}].[PortalSession] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [ChannelID] UNIQUEIDENTIFIER NOT NULL,
    [ContactID] UNIQUEIDENTIFIER NOT NULL,
    [ThreadID] NVARCHAR(255) NOT NULL,
    [TokenHash] NVARCHAR(128) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Active',
    [ExpiresAt] DATETIMEOFFSET NOT NULL,
    [LastAccessedAt] DATETIMEOFFSET NOT NULL DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT [PK_PortalSession] PRIMARY KEY ([ID]),
    CONSTRAINT [CK_PortalSession_Status] CHECK ([Status] IN ('Active', 'Expired', 'Revoked'))
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Tracks active secure messaging sessions for external contacts. Each session maps a contact to a channel thread and is authenticated via a hashed opaque token.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'PortalSession';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Groups messages into a conversation thread',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'PortalSession',
    @level2type=N'COLUMN', @level2name=N'ThreadID';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'SHA-256 hash of the opaque session token (sm_ prefix). Raw token is never stored.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'PortalSession',
    @level2type=N'COLUMN', @level2name=N'TokenHash';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Session lifecycle status: Active, Expired, or Revoked',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'PortalSession',
    @level2type=N'COLUMN', @level2name=N'Status';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the session token expires. Default TTL is 7 days, extended on each access.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'PortalSession',
    @level2type=N'COLUMN', @level2name=N'ExpiresAt';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Last time the session was accessed. Used for session extension and cleanup.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'PortalSession',
    @level2type=N'COLUMN', @level2name=N'LastAccessedAt';


CREATE TABLE [${flyway:defaultSchema}].[PortalMagicLink] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [PortalSessionID] UNIQUEIDENTIFIER NOT NULL,
    [TokenHash] NVARCHAR(128) NOT NULL,
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    [ExpiresAt] DATETIMEOFFSET NOT NULL,
    [UsedAt] DATETIMEOFFSET NULL,
    CONSTRAINT [PK_PortalMagicLink] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_PortalMagicLink_PortalSession] FOREIGN KEY ([PortalSessionID]) REFERENCES [${flyway:defaultSchema}].[PortalSession]([ID]),
    CONSTRAINT [CK_PortalMagicLink_Status] CHECK ([Status] IN ('Pending', 'Used', 'Expired'))
);

EXEC sp_addextendedproperty @name=N'MS_Description',
    @value=N'Single-use magic links for re-authenticating expired portal sessions. Short-lived (15 min default), redeems into a fresh session token.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'PortalMagicLink';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'SHA-256 hash of the magic link token (sm_ml_ prefix). Raw token is never stored.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'PortalMagicLink',
    @level2type=N'COLUMN', @level2name=N'TokenHash';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Magic link lifecycle status: Pending, Used, or Expired',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'PortalMagicLink',
    @level2type=N'COLUMN', @level2name=N'Status';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the magic link expires. Default is 15 minutes from creation.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'PortalMagicLink',
    @level2type=N'COLUMN', @level2name=N'ExpiresAt';

EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Timestamp when the magic link was redeemed. NULL if not yet used.',
    @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}',
    @level1type=N'TABLE', @level1name=N'PortalMagicLink',
    @level2type=N'COLUMN', @level2name=N'UsedAt';
