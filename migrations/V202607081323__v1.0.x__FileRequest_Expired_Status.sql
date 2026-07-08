-- PRD v2 §7: give the File Request lifecycle a terminal 'Expired' state.
--
-- v1 had Status IN ('Pending','Fulfilled','Cancelled') and stored DueAt but never enforced it.
-- v2 adds 'Expired' — set lazily by the portal API when a Pending request's DueAt has passed —
-- so overdue requests drop out of the contact's action strip and collapse into thread history,
-- alongside 'Cancelled' (staff close-out) and 'Fulfilled'. Widening the CHECK lets CodeGen
-- regenerate the Status union type to include 'Expired'.

ALTER TABLE [${flyway:defaultSchema}].[FileRequest] DROP CONSTRAINT [CK_FileRequest_Status];
GO

ALTER TABLE [${flyway:defaultSchema}].[FileRequest] ADD CONSTRAINT [CK_FileRequest_Status]
    CHECK ([Status] IN ('Pending', 'Fulfilled', 'Cancelled', 'Expired'));
GO

-- Refresh the Status column description to document the full lifecycle.
IF EXISTS (SELECT 1 FROM sys.extended_properties
           WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.FileRequest')
             AND minor_id = (SELECT column_id FROM sys.columns
                             WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.FileRequest') AND name = 'Status')
             AND name = 'MS_Description')
BEGIN
    EXEC sp_dropextendedproperty @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'FileRequest',
        @level2type = N'COLUMN', @level2name = N'Status';
END
GO

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Request lifecycle status: Pending (awaiting the contact), Fulfilled (files uploaded and the contact marked it complete), Cancelled (staff closed it out), or Expired (the DueAt deadline passed while still Pending). Only Pending requests appear as action callouts in the portal; terminal states collapse into thread history.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'FileRequest',
    @level2type = N'COLUMN', @level2name = N'Status';
GO
