-- PRD v2 Phase 1: make the Thread a first-class entity (docs/PRD.md §4).
--
-- v1 flaw this fixes: "thread" was a bare NVARCHAR(255) string duplicated across four tables with
-- no owning row, and PortalSession doubled as the thread (1:1), holding archive/delete state that
-- semantically belongs to the conversation. v2 model: SecureThread owns the conversation
-- (subject, status, contact); PortalSession rescopes to the CONTACT (one session grants portal
-- access to all their threads); magic links may deep-link to a specific thread.
--
-- Steps:
--   1. Create SecureThread.
--   2. Backfill one row per distinct legacy ThreadID string (Subject from the first message,
--      Status/IsDeleted from the thread's session, provenance from imported messages).
--      NOTE: NEWID() is used ONLY for legacy non-UUID thread strings (seeded demo rows) — this is
--      environment-data transformation, not seeded metadata, so hardcoded UUIDs don't apply.
--   3. Normalize non-UUID ThreadID values in referencing tables to their new thread UUIDs.
--   4. Convert ThreadID columns to UNIQUEIDENTIFIER + real FKs -> SecureThread.
--   5. PortalMagicLink gains optional DeepLinkThreadID (FK) — the thread the link lands on.
--   6. Collapse sessions to per-contact (newest Active per contact stays; others Revoked) and
--      drop the session's thread-era columns (ThreadID, ChannelID, IsArchived, IsDeleted).
--
-- Deliberately NOT here: repointing existing MJ: Signature Requests EntityID/RecordID from
-- sessions to threads — the Secure Threads entity ID doesn't exist until CodeGen runs after this
-- migration. Going-forward linkage is thread-based in code; existing rows are dev test data.
-- ContactID / CreatedByUserID are SOFT references (no cross-schema FK) so the schema stays
-- standalone, matching PortalSession.ContactID / FileRequest.RequestedByUserID conventions.

-- ── 1. SecureThread ─────────────────────────────────────────────────────────────────────────────
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

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'A first-class secure conversation (thread) between the organization and one external contact. Owns the subject, lifecycle status, and all messages/files/requests via FKs. The unit of the contact portal inbox; magic links deep-link into a thread.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SecureThread';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Soft reference to the external contact (MJ_BizApps_Common.Person.ID). Not a hard FK so the schema stays standalone.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'ContactID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'The conversation subject line (TitanFile-channel style), set by staff at compose or derived at promotion.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'Subject';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Thread lifecycle: Active (open), Closed (contact-visible read-only), Archived (hidden from default lists). Contact-visible, unlike the old session-level archive flags.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'Status';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'NULL for threads that originated natively in the secure channel; the insecure channel name (e.g. Email, SMS) for threads created by promotion (PRD §9 bridges).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'SourceChannel';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Soft reference to the MJ user (staff) who created the thread; NULL for promoted/backfilled threads. Not a hard FK so the schema stays standalone.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'CreatedByUserID';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Timestamp of the most recent message in the thread (denormalized for inbox ordering).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'LastMessageAt';

EXEC sp_addextendedproperty @name = N'MS_Description',
    @value = N'Soft delete (staff Trash). Records are never hard-deleted — compliance/audit.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'SecureThread', @level2type = N'COLUMN', @level2name = N'IsDeleted';
GO

-- ── 2–3. Backfill + normalize legacy ThreadID strings ──────────────────────────────────────────
-- Map every distinct legacy ThreadID (from all referencing tables) to a thread UUID:
-- UUID-shaped strings keep their value as the SecureThread ID; non-UUID demo strings get NEWID().
CREATE TABLE #ThreadMap (OldThreadID NVARCHAR(255) NOT NULL PRIMARY KEY, NewID UNIQUEIDENTIFIER NOT NULL);

INSERT INTO #ThreadMap (OldThreadID, NewID)
SELECT u.ThreadID, COALESCE(TRY_CONVERT(UNIQUEIDENTIFIER, u.ThreadID), NEWID())
FROM (
    SELECT ThreadID FROM [${flyway:defaultSchema}].[SecureMessage]
    UNION SELECT ThreadID FROM [${flyway:defaultSchema}].[PortalSession]
    UNION SELECT ThreadID FROM [${flyway:defaultSchema}].[FileRequest]
    UNION SELECT ThreadID FROM [${flyway:defaultSchema}].[MessageFile]
) u;

-- One SecureThread per legacy thread. Session supplies contact + archive/delete state (1:1 in v1;
-- TOP 1 guards against any duplicates). First message supplies the subject; imported messages
-- supply promotion provenance.
INSERT INTO [${flyway:defaultSchema}].[SecureThread]
    (ID, ContactID, Subject, Status, SourceChannel, LastMessageAt, IsDeleted)
SELECT
    m.NewID,
    s.ContactID,
    COALESCE(
        NULLIF(LTRIM(RTRIM(fm.Subject)), ''),
        NULLIF(LEFT(LTRIM(RTRIM(fm.Content)), 200), ''),
        N'Secure conversation'),
    CASE WHEN s.IsArchived = 1 THEN N'Archived' ELSE N'Active' END,
    imp.SourceChannel,
    agg.LastAt,
    s.IsDeleted
FROM #ThreadMap m
CROSS APPLY (
    SELECT TOP 1 ps.ContactID, ps.IsArchived, ps.IsDeleted
    FROM [${flyway:defaultSchema}].[PortalSession] ps
    WHERE ps.ThreadID = m.OldThreadID
    ORDER BY ps.LastAccessedAt DESC
) s
OUTER APPLY (
    SELECT TOP 1 sm.Subject, sm.Content
    FROM [${flyway:defaultSchema}].[SecureMessage] sm
    WHERE sm.ThreadID = m.OldThreadID
    ORDER BY sm.ReceivedAt ASC
) fm
OUTER APPLY (
    SELECT MAX(sm.ReceivedAt) AS LastAt
    FROM [${flyway:defaultSchema}].[SecureMessage] sm
    WHERE sm.ThreadID = m.OldThreadID
) agg
OUTER APPLY (
    SELECT TOP 1 sm.SourceChannel
    FROM [${flyway:defaultSchema}].[SecureMessage] sm
    WHERE sm.ThreadID = m.OldThreadID AND sm.IsImported = 1 AND sm.SourceChannel IS NOT NULL
) imp;

-- Rewrite non-UUID legacy strings in referencing tables to their new thread UUIDs so the type
-- conversion below succeeds. (UUID-shaped values already equal their thread ID.)
UPDATE t SET ThreadID = CONVERT(NVARCHAR(255), m.NewID)
FROM [${flyway:defaultSchema}].[SecureMessage] t
JOIN #ThreadMap m ON t.ThreadID = m.OldThreadID
WHERE TRY_CONVERT(UNIQUEIDENTIFIER, t.ThreadID) IS NULL;

UPDATE t SET ThreadID = CONVERT(NVARCHAR(255), m.NewID)
FROM [${flyway:defaultSchema}].[FileRequest] t
JOIN #ThreadMap m ON t.ThreadID = m.OldThreadID
WHERE TRY_CONVERT(UNIQUEIDENTIFIER, t.ThreadID) IS NULL;

UPDATE t SET ThreadID = CONVERT(NVARCHAR(255), m.NewID)
FROM [${flyway:defaultSchema}].[MessageFile] t
JOIN #ThreadMap m ON t.ThreadID = m.OldThreadID
WHERE TRY_CONVERT(UNIQUEIDENTIFIER, t.ThreadID) IS NULL;

DROP TABLE #ThreadMap;
GO

-- ── 4. ThreadID becomes a real FK on the three content tables ──────────────────────────────────
ALTER TABLE [${flyway:defaultSchema}].[SecureMessage] ALTER COLUMN [ThreadID] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [${flyway:defaultSchema}].[FileRequest]   ALTER COLUMN [ThreadID] UNIQUEIDENTIFIER NOT NULL;
ALTER TABLE [${flyway:defaultSchema}].[MessageFile]   ALTER COLUMN [ThreadID] UNIQUEIDENTIFIER NOT NULL;

ALTER TABLE [${flyway:defaultSchema}].[SecureMessage]
    ADD CONSTRAINT [FK_SecureMessage_SecureThread] FOREIGN KEY ([ThreadID]) REFERENCES [${flyway:defaultSchema}].[SecureThread]([ID]);
ALTER TABLE [${flyway:defaultSchema}].[FileRequest]
    ADD CONSTRAINT [FK_FileRequest_SecureThread] FOREIGN KEY ([ThreadID]) REFERENCES [${flyway:defaultSchema}].[SecureThread]([ID]);
ALTER TABLE [${flyway:defaultSchema}].[MessageFile]
    ADD CONSTRAINT [FK_MessageFile_SecureThread] FOREIGN KEY ([ThreadID]) REFERENCES [${flyway:defaultSchema}].[SecureThread]([ID]);
GO

-- ── 5. Magic links may deep-link to a thread (FK column; CodeGen documents FKs) ────────────────
ALTER TABLE [${flyway:defaultSchema}].[PortalMagicLink] ADD
    [DeepLinkThreadID] UNIQUEIDENTIFIER NULL
    CONSTRAINT [FK_PortalMagicLink_SecureThread] REFERENCES [${flyway:defaultSchema}].[SecureThread]([ID]);
GO

-- ── 6. Rescope PortalSession to the contact ────────────────────────────────────────────────────
-- Collapse: keep the newest Active session per contact; retire the rest (rows are preserved —
-- messages/magic links FK them for audit).
UPDATE ps SET ps.Status = N'Revoked'
FROM [${flyway:defaultSchema}].[PortalSession] ps
WHERE ps.Status = N'Active'
  AND EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[PortalSession] newer
      WHERE newer.ContactID = ps.ContactID
        AND newer.Status = N'Active'
        AND (newer.LastAccessedAt > ps.LastAccessedAt
             OR (newer.LastAccessedAt = ps.LastAccessedAt AND newer.ID > ps.ID))
  );

-- Drop the thread-era columns (default constraints have auto-generated names → drop dynamically).
DECLARE @drop NVARCHAR(MAX) = N'';
SELECT @drop += N'ALTER TABLE [${flyway:defaultSchema}].[PortalSession] DROP CONSTRAINT ' + QUOTENAME(dc.name) + N';'
FROM sys.default_constraints dc
WHERE dc.parent_object_id = OBJECT_ID('${flyway:defaultSchema}.PortalSession')
  AND COL_NAME(dc.parent_object_id, dc.parent_column_id) IN ('ThreadID','ChannelID','IsArchived','IsDeleted');
EXEC sp_executesql @drop;

ALTER TABLE [${flyway:defaultSchema}].[PortalSession]
    DROP COLUMN [ThreadID], [ChannelID], [IsArchived], [IsDeleted];
GO

-- ── 7. Prune stale EntityField metadata for the dropped PortalSession columns ───────────────────
-- The Secure_Messaging_Core migration captured CodeGen output as a committed migration, so it
-- hand-inserts Entity/EntityField rows (metadata is normally CodeGen-owned). Dropping the columns
-- above does NOT remove their EntityField rows, and the post-migration CodeGen pass does not prune
-- them — so without this, the regenerated PortalSession entity + CRUD SPs would carry phantom
-- ThreadID/ChannelID fields that no longer exist on the table. Remove them here (matched by the
-- entity name, which the Core migration sets) so the metadata matches the schema before CodeGen.
DELETE ef
FROM [${mjSchema}].[EntityField] ef
INNER JOIN [${mjSchema}].[Entity] e ON ef.[EntityID] = e.[ID]
WHERE e.[Name] = N'MJ_BizApps_SecureMessaging: Portal Sessions'
  AND ef.[Name] IN (N'ThreadID', N'ChannelID', N'IsArchived', N'IsDeleted');
GO
