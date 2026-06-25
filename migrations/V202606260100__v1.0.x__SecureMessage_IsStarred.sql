-- Adds per-message star/flag support to Secure Messaging.
--
-- Starring is a per-message concept (staff flag a specific message to find later, like an
-- email star — distinct from Archive, which is per-conversation). The flag lives on
-- SecureMessage. Additive + not-null-with-default, so it is a safe, non-breaking change.

ALTER TABLE [${flyway:defaultSchema}].[SecureMessage] ADD
    [IsStarred] BIT NOT NULL DEFAULT 0;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this message is starred/flagged by staff for quick retrieval (shown under the Starred category). Per-message, staff-toggled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SecureMessage',
    @level2type = N'COLUMN', @level2name = N'IsStarred';
