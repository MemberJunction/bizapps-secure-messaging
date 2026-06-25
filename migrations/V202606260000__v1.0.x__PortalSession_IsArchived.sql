-- Adds thread-level archive support to Secure Messaging.
--
-- Archive is a per-conversation (thread) concept: one PortalSession == one thread, so the
-- archive flag lives on PortalSession. Archived threads are hidden from the staff inbox's
-- default view and surfaced under the "Archived" category. Additive + nullable-with-default,
-- so it is a safe, non-breaking change.

ALTER TABLE [${flyway:defaultSchema}].[PortalSession] ADD
    [IsArchived] BIT NOT NULL DEFAULT 0;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this conversation (thread) is archived: hidden from the staff inbox default view and shown under the Archived category. Staff-toggled; does not affect contact access.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PortalSession',
    @level2type = N'COLUMN', @level2name = N'IsArchived';
