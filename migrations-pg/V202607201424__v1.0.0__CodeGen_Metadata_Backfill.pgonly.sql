-- ============================================================================
-- CodeGen metadata backfill (PostgreSQL only — no T-SQL counterpart)
-- ============================================================================
-- Brings __mj metadata for this app to MJ CodeGen's fixed-point state so a
-- fresh PG install is complete without running codegen, and a subsequent
-- codegen run makes no metadata changes. Mirrors the bizapps-common v5.32
-- backfill (commit 1bfe93c), the bizapps-tasks v1.2 backfill, and the
-- bizapps-issues v1.1 backfill (commit 5cd9357).
--
-- Two groups of statements, all data (no DDL):
--
-- 1. SchemaInfo (MemberJunction/MJ#2992). The baseline never creates a
--    SchemaInfo row — it only calls spUpdateSchemaInfoFromDatabase, which
--    discovers the PHYSICAL schema. On PostgreSQL the physical schema is
--    folded to lowercase (__mj_bizappssecuremessaging) while the Entity rows
--    the baseline seeds carry the authored, canonical-cased SchemaName
--    (__mj_BizAppsSecureMessaging). With CanonicalSchemaName NULL, CodeGen
--    cannot map physical -> canonical, so on its first run it treats the
--    lowercase schema as a SECOND, unknown schema and creates a duplicate set
--    of everything: 6 extra Entity rows named
--    'MJ_BizApps_SecureMessaging: Secure Threads____mj_bizappssecuremessaging'
--    and, from those, a duplicate object set in the app schema
--    (spCreateSecureThread____mj_bizappssecuremessaging,
--    vwSecureThreads____mj_bizappssecuremessaging, and matching triggers) —
--    48 functions / 12 views / 12 triggers instead of 24 / 6 / 6. The
--    installer's own PersistCanonicalSchemaName UPDATE cannot prevent this:
--    it fires BEFORE migrations, when no SchemaInfo row exists yet, so it
--    always misses. Without the canonical name, generated class names and
--    runtime GraphQL type names also come out lowercase
--    (mjbizappssecuremessaging* instead of mjBizAppsSecureMessaging*) and no
--    longer match the imports in packages/Server and packages/Angular.
--    Pinned IDs for determinism. Two rows, as in the sibling backfills: the
--    lowercase physical-schema row, and the canonical-cased row CodeGen
--    otherwise auto-creates on its first run (its newEntityDefaults config
--    references the schema by canonical name).
--
-- 2. EntityField normalization. The SS->PG migration converter translated
--    metadata literals into PG-flavored values (nvarchar->TEXT,
--    uniqueidentifier->UUID, sequences offset by 100000) that CodeGen
--    normalizes back on its first run. These UPDATEs ship the normalized
--    values directly. Values extracted verbatim from a post-codegen v5.44
--    database (CodeGen's fixed point on PostgreSQL).
--
-- This file is .pgonly.sql: on SQL Server none of this is needed (the schema
-- name is stored as authored and the converter never touched the metadata).
-- ============================================================================
SET standard_conforming_strings = on;

-- 1. SchemaInfo — create (fresh install) or repair (row already auto-created by CodeGen)
-- Guarded on SchemaName, not ID: __mj."SchemaInfo" carries UNIQUE IX_SchemaInfo(SchemaName), so an
-- environment where CodeGen already auto-created this row (with its own random ID) would fail an
-- ON CONFLICT ("ID") insert on the SchemaName index instead. The repair UPDATE below covers that case.
-- EntityNamePrefix is deliberately left NULL on both rows — that is CodeGen's own fixed point here
-- (verified against a post-codegen v5.44 database), and this app's prefix could not be stored anyway:
-- 'MJ_BizApps_SecureMessaging: ' is 28 characters and __mj."SchemaInfo"."EntityNamePrefix" is
-- varchar(25). The prefix is not needed — the baseline seeds every Entity."Name" with it already.
INSERT INTO __mj."SchemaInfo" ("ID", "SchemaName", "EntityIDMin", "EntityIDMax", "Comments", "CanonicalSchemaName")
SELECT '3DE6D1DC-8E89-443A-A7A8-447DB163761B', '__mj_bizappssecuremessaging', 1, 999999999, 'Auto-created by CodeGen. Please update EntityIDMin and EntityIDMax to appropriate values for this schema.', '__mj_BizAppsSecureMessaging'
WHERE NOT EXISTS (SELECT 1 FROM __mj."SchemaInfo" WHERE "SchemaName" = '__mj_bizappssecuremessaging');

UPDATE __mj."SchemaInfo"
SET "CanonicalSchemaName" = '__mj_BizAppsSecureMessaging'
WHERE "SchemaName" = '__mj_bizappssecuremessaging' AND "CanonicalSchemaName" IS NULL;

-- Pre-create the canonical-cased row CodeGen otherwise auto-creates (guarded by
-- SchemaName so an install where codegen already made it is left untouched)
INSERT INTO __mj."SchemaInfo" ("ID", "SchemaName", "EntityIDMin", "EntityIDMax", "Comments", "CanonicalSchemaName")
SELECT '7A3A0AEB-F234-4EFC-8787-2731F453DB2C', '__mj_BizAppsSecureMessaging', 1, 999999999, 'Auto-created by CodeGen. Please update EntityIDMin and EntityIDMax to appropriate values for this schema.', '__mj_BizAppsSecureMessaging'
WHERE NOT EXISTS (SELECT 1 FROM __mj."SchemaInfo" WHERE "SchemaName" = '__mj_BizAppsSecureMessaging');

-- 2. EntityField normalization (CodeGen fixed-point values)
-- >>> BEGIN baked CodeGen EntityField normalization (scripts/pg-bake-codegen.mjs) <<<
UPDATE __mj."EntityField" SET "Sequence" = 1, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = 'd84af2eb-ea4e-41de-8b37-ce60aaccaceb';  -- MJ_BizApps_SecureMessaging: File Requests.ID
UPDATE __mj."EntityField" SET "Sequence" = 2, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '038cd3c8-da08-4afb-aadd-94d9b504eec8';  -- MJ_BizApps_SecureMessaging: File Requests.PortalSessionID
UPDATE __mj."EntityField" SET "Sequence" = 3, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '2c50079f-76d5-4dac-b9f3-42e4bedef662';  -- MJ_BizApps_SecureMessaging: File Requests.ThreadID
UPDATE __mj."EntityField" SET "Sequence" = 4, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = '7b6d1385-4061-45ed-b0c3-a4e442f9ff0c';  -- MJ_BizApps_SecureMessaging: File Requests.Title
UPDATE __mj."EntityField" SET "Sequence" = 5, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = 'c9bac686-4990-4a3b-9e7e-f46a651ad2e9';  -- MJ_BizApps_SecureMessaging: File Requests.Instructions
UPDATE __mj."EntityField" SET "Sequence" = 6, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = '2680a27e-5bbf-46bc-a9f9-46ef4ecc815e';  -- MJ_BizApps_SecureMessaging: File Requests.Status
UPDATE __mj."EntityField" SET "Sequence" = 7, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = 'fc0658e7-f0b2-43c4-a314-480cbf5a5e0a';  -- MJ_BizApps_SecureMessaging: File Requests.RequestedByUserID
UPDATE __mj."EntityField" SET "Sequence" = 8, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = '3cd18e90-f0e5-4ee0-a9a4-eab158588dbd';  -- MJ_BizApps_SecureMessaging: File Requests.DueAt
UPDATE __mj."EntityField" SET "Sequence" = 9, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = 'd9a6184f-5072-41eb-9410-dfa5111252dc';  -- MJ_BizApps_SecureMessaging: File Requests.FulfilledAt
UPDATE __mj."EntityField" SET "Sequence" = 10, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = '84812652-6bd1-4de7-b871-602c036cec42';  -- MJ_BizApps_SecureMessaging: File Requests.__mj_CreatedAt
UPDATE __mj."EntityField" SET "Sequence" = 11, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = '20430bfb-17d5-411c-85a9-4307316dca80';  -- MJ_BizApps_SecureMessaging: File Requests.__mj_UpdatedAt
UPDATE __mj."EntityField" SET "Sequence" = 1, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '0dbd9aab-b892-4a5f-a870-0d9a4b75b04a';  -- MJ_BizApps_SecureMessaging: Message Files.ID
UPDATE __mj."EntityField" SET "Sequence" = 2, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = 'fe794373-413d-4016-8877-10905ef9bfef';  -- MJ_BizApps_SecureMessaging: Message Files.SecureMessageID
UPDATE __mj."EntityField" SET "Sequence" = 3, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '35fe759e-89b1-4e32-83a4-c44627916e40';  -- MJ_BizApps_SecureMessaging: Message Files.ExternalMessageID
UPDATE __mj."EntityField" SET "Sequence" = 4, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '23302f51-b78b-4895-bb47-c72de4ea3e21';  -- MJ_BizApps_SecureMessaging: Message Files.ThreadID
UPDATE __mj."EntityField" SET "Sequence" = 5, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '65ad537f-fe26-45c4-af60-308976df9075';  -- MJ_BizApps_SecureMessaging: Message Files.ArtifactID
UPDATE __mj."EntityField" SET "Sequence" = 6, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '5de45282-d290-4891-be51-8089a1431b51';  -- MJ_BizApps_SecureMessaging: Message Files.FileID
UPDATE __mj."EntityField" SET "Sequence" = 7, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = '49972105-de2f-4b46-abed-4bdcc526cb7b';  -- MJ_BizApps_SecureMessaging: Message Files.Filename
UPDATE __mj."EntityField" SET "Sequence" = 8, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = '31c0011e-79b2-49c6-a57d-df86d54c327c';  -- MJ_BizApps_SecureMessaging: Message Files.ContentType
UPDATE __mj."EntityField" SET "Sequence" = 9, "Type" = 'bigint', "DefaultColumnWidth" = 150 WHERE "ID" = '0caaa67e-afd2-4341-ab92-635c550cdb77';  -- MJ_BizApps_SecureMessaging: Message Files.Size
UPDATE __mj."EntityField" SET "Sequence" = 10, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = 'd97c178f-6dab-4464-a6b1-b961cb77b32d';  -- MJ_BizApps_SecureMessaging: Message Files.__mj_CreatedAt
UPDATE __mj."EntityField" SET "Sequence" = 11, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = 'f2ee3fc9-cc73-4ed8-bad7-2da240a84cba';  -- MJ_BizApps_SecureMessaging: Message Files.__mj_UpdatedAt
UPDATE __mj."EntityField" SET "Sequence" = 1, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '90549dab-9b9b-4609-b718-e5bb7ac2b62b';  -- MJ_BizApps_SecureMessaging: Portal Magic Links.ID
UPDATE __mj."EntityField" SET "Sequence" = 2, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '03803e37-f1d3-4856-bb18-ea70f545479a';  -- MJ_BizApps_SecureMessaging: Portal Magic Links.PortalSessionID
UPDATE __mj."EntityField" SET "Sequence" = 3, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = '337dab0a-ff7f-4c7b-9a6d-7c3b521f2340';  -- MJ_BizApps_SecureMessaging: Portal Magic Links.TokenHash
UPDATE __mj."EntityField" SET "Sequence" = 4, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = '42885a4a-1b1f-4984-819d-b6a17a9992e3';  -- MJ_BizApps_SecureMessaging: Portal Magic Links.Status
UPDATE __mj."EntityField" SET "Sequence" = 5, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = 'd88e34ba-df5a-480d-b74e-267dda1354bc';  -- MJ_BizApps_SecureMessaging: Portal Magic Links.ExpiresAt
UPDATE __mj."EntityField" SET "Sequence" = 6, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = '970b7879-9daa-4b3d-8abd-7eea89810262';  -- MJ_BizApps_SecureMessaging: Portal Magic Links.UsedAt
UPDATE __mj."EntityField" SET "Sequence" = 7, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '9b5a4416-2692-4a3d-b574-d045fb97892f';  -- MJ_BizApps_SecureMessaging: Portal Magic Links.DeepLinkThreadID
UPDATE __mj."EntityField" SET "Sequence" = 8, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = 'b438f8e9-4399-4215-9f93-fba4a00fc56a';  -- MJ_BizApps_SecureMessaging: Portal Magic Links.__mj_CreatedAt
UPDATE __mj."EntityField" SET "Sequence" = 9, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = 'b9f9976c-3b78-490d-8560-227025ff25d5';  -- MJ_BizApps_SecureMessaging: Portal Magic Links.__mj_UpdatedAt
UPDATE __mj."EntityField" SET "Sequence" = 1, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '03964bfd-d587-404f-971a-831f08f76aa1';  -- MJ_BizApps_SecureMessaging: Portal Sessions.ID
UPDATE __mj."EntityField" SET "Sequence" = 2, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '633aa7f0-dc5b-4f83-90fa-e0cccda592cc';  -- MJ_BizApps_SecureMessaging: Portal Sessions.ContactID
UPDATE __mj."EntityField" SET "Sequence" = 3, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = '87293581-d7db-4493-bf50-f102ebe300d7';  -- MJ_BizApps_SecureMessaging: Portal Sessions.TokenHash
UPDATE __mj."EntityField" SET "Sequence" = 4, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = '14bf5536-3c24-4264-912b-bce7b6d83901';  -- MJ_BizApps_SecureMessaging: Portal Sessions.Status
UPDATE __mj."EntityField" SET "Sequence" = 5, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = '45ff9a5b-71c5-4748-8e0b-8fb44ef9cad5';  -- MJ_BizApps_SecureMessaging: Portal Sessions.ExpiresAt
UPDATE __mj."EntityField" SET "Sequence" = 6, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = '44c890b9-386a-45e2-87b9-7ee69e4cbedb';  -- MJ_BizApps_SecureMessaging: Portal Sessions.LastAccessedAt
UPDATE __mj."EntityField" SET "Sequence" = 7, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = '18c5c4d8-a3c7-49c2-b570-7a79257ca1b0';  -- MJ_BizApps_SecureMessaging: Portal Sessions.__mj_CreatedAt
UPDATE __mj."EntityField" SET "Sequence" = 8, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = 'a057ba3c-e00e-497c-b5e9-91ba28f71077';  -- MJ_BizApps_SecureMessaging: Portal Sessions.__mj_UpdatedAt
UPDATE __mj."EntityField" SET "Sequence" = 1, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '513651e9-54aa-4f8c-988b-9b6ad6798f3a';  -- MJ_BizApps_SecureMessaging: Secure Messages.ID
UPDATE __mj."EntityField" SET "Sequence" = 2, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '2b977d39-66a2-4f97-b918-1465195f43cf';  -- MJ_BizApps_SecureMessaging: Secure Messages.PortalSessionID
UPDATE __mj."EntityField" SET "Sequence" = 3, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '592ddffb-9926-47b5-85bd-bab4cfc39a1c';  -- MJ_BizApps_SecureMessaging: Secure Messages.ThreadID
UPDATE __mj."EntityField" SET "Sequence" = 4, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '56e6c5c0-48b3-43fb-aa30-ec657a4cb7e5';  -- MJ_BizApps_SecureMessaging: Secure Messages.PersonID
UPDATE __mj."EntityField" SET "Sequence" = 5, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = 'c47729be-ed8f-4bd6-bde0-9ee08ee65c4e';  -- MJ_BizApps_SecureMessaging: Secure Messages.Direction
UPDATE __mj."EntityField" SET "Sequence" = 6, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = '4f4dd79e-b9f6-4e22-9155-c7abe8c1b18d';  -- MJ_BizApps_SecureMessaging: Secure Messages.Sender
UPDATE __mj."EntityField" SET "Sequence" = 7, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = '09bc3f32-9b8e-4498-a689-b8593b67066d';  -- MJ_BizApps_SecureMessaging: Secure Messages.Recipient
UPDATE __mj."EntityField" SET "Sequence" = 8, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = '02614f66-f942-45bd-964f-13f31eda3577';  -- MJ_BizApps_SecureMessaging: Secure Messages.Subject
UPDATE __mj."EntityField" SET "Sequence" = 9, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = 'bb897f01-29e0-45a3-8d04-98718e809dea';  -- MJ_BizApps_SecureMessaging: Secure Messages.Content
UPDATE __mj."EntityField" SET "Sequence" = 10, "Type" = 'bit', "DefaultColumnWidth" = 150 WHERE "ID" = 'd101fb7c-780a-4cc0-986e-5656c650333b';  -- MJ_BizApps_SecureMessaging: Secure Messages.IsSecure
UPDATE __mj."EntityField" SET "Sequence" = 11, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = 'b26c0dfc-3cc7-46fb-bfdd-842e0929b978';  -- MJ_BizApps_SecureMessaging: Secure Messages.Status
UPDATE __mj."EntityField" SET "Sequence" = 12, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '1ecc4378-5d0a-4da3-98fa-9daeea12204b';  -- MJ_BizApps_SecureMessaging: Secure Messages.ExternalMessageID
UPDATE __mj."EntityField" SET "Sequence" = 13, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = '91aafabe-9a87-4b90-ac41-ddb26fd49b79';  -- MJ_BizApps_SecureMessaging: Secure Messages.ReceivedAt
UPDATE __mj."EntityField" SET "Sequence" = 14, "Type" = 'bit', "DefaultColumnWidth" = 150 WHERE "ID" = '8c53d93b-0775-4c15-9e72-226e07d06e2c';  -- MJ_BizApps_SecureMessaging: Secure Messages.IsStarred
UPDATE __mj."EntityField" SET "Sequence" = 15, "Type" = 'bit', "DefaultColumnWidth" = 150 WHERE "ID" = '060aeccd-baa3-4bc8-829e-cb28eab6e954';  -- MJ_BizApps_SecureMessaging: Secure Messages.IsImported
UPDATE __mj."EntityField" SET "Sequence" = 16, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = 'a537df35-8388-4fde-ad19-f429a07c2436';  -- MJ_BizApps_SecureMessaging: Secure Messages.SourceChannel
UPDATE __mj."EntityField" SET "Sequence" = 17, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = 'e3d22297-0531-4289-a88e-31a792e5ba86';  -- MJ_BizApps_SecureMessaging: Secure Messages.__mj_CreatedAt
UPDATE __mj."EntityField" SET "Sequence" = 18, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = '384ac274-3cfc-4d13-908e-b63674385e68';  -- MJ_BizApps_SecureMessaging: Secure Messages.__mj_UpdatedAt
UPDATE __mj."EntityField" SET "Sequence" = 1, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = 'a9a304d9-668c-476e-bc03-1d4b4ccf5784';  -- MJ_BizApps_SecureMessaging: Secure Threads.ID
UPDATE __mj."EntityField" SET "Sequence" = 2, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '8049b248-c54e-447b-a087-7477035e0fbc';  -- MJ_BizApps_SecureMessaging: Secure Threads.ContactID
UPDATE __mj."EntityField" SET "Sequence" = 3, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = 'eef2d72a-e9bb-4a93-b7c7-55495ca0b786';  -- MJ_BizApps_SecureMessaging: Secure Threads.Subject
UPDATE __mj."EntityField" SET "Sequence" = 4, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = '8b8422a2-c239-478f-8f6a-baa36c756e48';  -- MJ_BizApps_SecureMessaging: Secure Threads.Status
UPDATE __mj."EntityField" SET "Sequence" = 5, "Type" = 'nvarchar', "DefaultColumnWidth" = 150 WHERE "ID" = 'dcc13fd2-8193-4ab7-8acb-df6145afa307';  -- MJ_BizApps_SecureMessaging: Secure Threads.SourceChannel
UPDATE __mj."EntityField" SET "Sequence" = 6, "Type" = 'uniqueidentifier', "DefaultColumnWidth" = 150 WHERE "ID" = '111d2164-5b9b-4e57-9fd9-2f4c2cc9c997';  -- MJ_BizApps_SecureMessaging: Secure Threads.CreatedByUserID
UPDATE __mj."EntityField" SET "Sequence" = 7, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = '7bdf1478-bff1-4e6d-b0bf-b859b9db3f0b';  -- MJ_BizApps_SecureMessaging: Secure Threads.LastMessageAt
UPDATE __mj."EntityField" SET "Sequence" = 8, "Type" = 'bit', "DefaultColumnWidth" = 150 WHERE "ID" = '6d103051-5a1d-4203-b6a1-021cd4bff60f';  -- MJ_BizApps_SecureMessaging: Secure Threads.IsDeleted
UPDATE __mj."EntityField" SET "Sequence" = 9, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = 'ace2d094-77c9-4ce1-833d-cc88c1179fcd';  -- MJ_BizApps_SecureMessaging: Secure Threads.__mj_CreatedAt
UPDATE __mj."EntityField" SET "Sequence" = 10, "Type" = 'datetimeoffset', "DefaultColumnWidth" = 100 WHERE "ID" = 'f6b95a05-922a-4581-8588-cbc14bbf1481';  -- MJ_BizApps_SecureMessaging: Secure Threads.__mj_UpdatedAt
-- >>> END baked CodeGen EntityField normalization <<<
