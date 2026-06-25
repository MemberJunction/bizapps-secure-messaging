-- Adds soft-delete (Trash) support to Secure Messaging.
--
-- Delete is per-conversation (thread) like Archive, so the flag lives on PortalSession.
-- It is a SOFT delete: secure messaging is a compliance/audit context (every action is
-- timestamped and exportable for regulators), so conversations are hidden + recoverable from
-- Trash, never destroyed. Additive + not-null-with-default = safe, non-breaking change.

ALTER TABLE [${flyway:defaultSchema}].[PortalSession] ADD
    [IsDeleted] BIT NOT NULL DEFAULT 0;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this conversation (thread) is soft-deleted: hidden from the inbox and all categories except Trash, from which it can be restored. Records are never hard-deleted (compliance/audit). Staff-toggled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'PortalSession',
    @level2type = N'COLUMN', @level2name = N'IsDeleted';
