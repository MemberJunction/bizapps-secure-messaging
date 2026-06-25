-- Adds import/promotion provenance to Secure Messaging messages.
--
-- The "bridge" flows (PRD §10) promote an existing email/SMS thread into a secure thread by
-- COPYING the prior insecure messages into the new secure thread, so the contact sees the full
-- history once authenticated. Those copied messages are distinguished from messages that
-- originated natively in the secure channel, and we record which insecure channel they came from.
--
-- One-way visibility: imported messages live ONLY on the secure side; secure messages are never
-- written back to the insecure channel. These columns are about provenance, not back-publishing.
--
-- Additive + nullable / not-null-with-default, so this is a safe, non-breaking change.

ALTER TABLE [${flyway:defaultSchema}].[SecureMessage] ADD
    [IsImported] BIT NOT NULL DEFAULT 0,
    [SourceChannel] NVARCHAR(50) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this message was imported (copied) into the secure thread during a promotion/bridge from an insecure channel, rather than originating natively in the secure channel. Imported messages predate the switch to secure.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SecureMessage',
    @level2type = N'COLUMN', @level2name = N'IsImported';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'For imported messages, the insecure channel the message originated from (e.g. Email, SMS). NULL for messages that originated natively in the secure channel.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SecureMessage',
    @level2type = N'COLUMN', @level2name = N'SourceChannel';
