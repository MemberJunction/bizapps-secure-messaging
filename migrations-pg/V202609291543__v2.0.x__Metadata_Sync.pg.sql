-- =============================================================================================
-- MJ Secure Messaging v2.0.x -- Metadata_Sync (PostgreSQL)
-- =============================================================================================
-- The PostgreSQL counterpart of migrations/V202609291543__v2.0.x__Metadata_Sync.sql. That file's
-- header explains why this seed exists and what each record is; this one lands the same end
-- state on PostgreSQL.
--
-- HOW IT WAS WRITTEN. Not by the converter: `mj convert-migrations` cannot transform
-- `EXEC spCreate*` data calls (see migrations-pg/docs/PG_INSTALL_VERIFICATION.md, Maintenance
-- contract). Instead:
--   * Creates are direct INSERTs whose values are the rows the T-SQL seed produced on a SQL
--     Server database built from migrations only (every non-NULL column, so column defaults
--     cannot drift between the platforms).
--   * Updates set exactly the columns metadata/ declares -- not the whole row as the T-SQL
--     spUpdateEntity call does, which would write SQL Server's copy of every column over the
--     PostgreSQL baseline's own. The declared no-op columns (BaseView, IncludeInAPI,
--     AllowCreateAPI, AllowUpdateAPI, TrackRecordChanges) already match the PG baseline; the ones
--     that change are AllowUserSearchAPI, AutoUpdateAllowUserSearchAPI, AllowDeleteAPI and
--     Configuration. Descriptions are not touched: they come from the baseline.
--
-- IDEMPOTENT, with the same guards as the T-SQL seed: every INSERT is skipped when the row exists
-- by ID or by the table's natural key (ActionCategory by top-level Name, Action by Name,
-- ActionParam by (ActionID, Name), Application by Name) -- a host that ran `mj sync push` already
-- holds them. Action.CategoryID and ActionParam.ActionID are re-resolved on the host by name,
-- preferring the pinned ID. A bare ON CONFLICT DO NOTHING is not enough: Action's unique key
-- (Name, CategoryID, ParentID) includes a NULL ParentID, and PostgreSQL treats NULLs as distinct.
-- Every Entity and EntityRelationship ID updated here is pinned by the PG baseline.
--
-- No schema-name string literals appear in this file, so the physical-lowercase rule
-- (PG_INSTALL_VERIFICATION.md) does not come into play.
-- =============================================================================================

SET standard_conforming_strings = on;

-- Action category
INSERT INTO "${mjSchema}"."ActionCategory" ("ID", "Name", "Description", "Status")
SELECT '2B8D7135-626F-446E-B176-F148E25059F4', 'Secure Messaging', 'Actions for the MJ Secure Messaging app — portal session and magic-link management, file/signature workflows.', 'Active'
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionCategory" x WHERE x."ID" = '2B8D7135-626F-446E-B176-F148E25059F4' OR (x."Name" = 'Secure Messaging' AND x."ParentID" IS NULL));

-- Actions (CategoryID re-resolved on the host by name)
INSERT INTO "${mjSchema}"."Action" ("ID", "CategoryID", "Name", "Description", "Type", "CodeApprovalStatus", "CodeLocked", "ForceCodeGeneration", "Status", "DriverClass")
SELECT '76A41213-2CC5-4544-956D-BD9C00319E88', COALESCE((SELECT "ID" FROM "${mjSchema}"."ActionCategory" WHERE "ID" = '2B8D7135-626F-446E-B176-F148E25059F4' OR ("Name" = 'Secure Messaging' AND "ParentID" IS NULL) ORDER BY ("ID" = '2B8D7135-626F-446E-B176-F148E25059F4') DESC LIMIT 1), '2B8D7135-626F-446E-B176-F148E25059F4'), 'Issue Portal Magic Link', 'Issues a fresh single-use portal magic link for an existing portal session (staff-initiated, server-side token generation + hashing via PortalAuthService). Returns the raw token for out-of-band delivery to the contact.', 'Custom', 'Approved', FALSE, FALSE, 'Active', '__IssuePortalMagicLink'
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Action" x WHERE x."ID" = '76A41213-2CC5-4544-956D-BD9C00319E88' OR x."Name" = 'Issue Portal Magic Link');
INSERT INTO "${mjSchema}"."Action" ("ID", "CategoryID", "Name", "Description", "Type", "CodeApprovalStatus", "CodeLocked", "ForceCodeGeneration", "Status", "DriverClass")
SELECT '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C', COALESCE((SELECT "ID" FROM "${mjSchema}"."ActionCategory" WHERE "ID" = '2B8D7135-626F-446E-B176-F148E25059F4' OR ("Name" = 'Secure Messaging' AND "ParentID" IS NULL) ORDER BY ("ID" = '2B8D7135-626F-446E-B176-F148E25059F4') DESC LIMIT 1), '2B8D7135-626F-446E-B176-F148E25059F4'), 'Promote Thread', 'Promotes an existing insecure (Email/SMS) thread into a secure thread: find-or-create the contact Person, mint thread + portal session + single-use magic link, then COPY the prior insecure messages into the secure thread (flagged IsImported, tagged with SourceChannel) so the contact sees the full history once authenticated. One-way visibility: imported messages live only on the secure side. Shared backbone of both channel bridges (Izzy action-diff ''switch to secure channel'' and the Outlook ''Secure Send'' add-in). Returns the magic-link token for out-of-band delivery (?ml=<token>).', 'Custom', 'Approved', FALSE, FALSE, 'Active', '__PromoteThread'
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Action" x WHERE x."ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR x."Name" = 'Promote Thread');
INSERT INTO "${mjSchema}"."Action" ("ID", "CategoryID", "Name", "Description", "Type", "CodeApprovalStatus", "CodeLocked", "ForceCodeGeneration", "Status", "DriverClass")
SELECT '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9', COALESCE((SELECT "ID" FROM "${mjSchema}"."ActionCategory" WHERE "ID" = '2B8D7135-626F-446E-B176-F148E25059F4' OR ("Name" = 'Secure Messaging' AND "ParentID" IS NULL) ORDER BY ("ID" = '2B8D7135-626F-446E-B176-F148E25059F4') DESC LIMIT 1), '2B8D7135-626F-446E-B176-F148E25059F4'), 'Send Secure Message', 'Sends an outbound (staff/org -> contact) secure message into a thread via the configured MessageStore. Staff-initiated and the Izzy-facing send verb. Sender is the invoking MJ user; the thread''s portal session supplies the recipient. Delivery is pull-based; a host notifier may additionally nudge the contact.', 'Custom', 'Approved', FALSE, FALSE, 'Active', '__SendSecureMessage'
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Action" x WHERE x."ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9' OR x."Name" = 'Send Secure Message');
INSERT INTO "${mjSchema}"."Action" ("ID", "CategoryID", "Name", "Description", "Type", "CodeApprovalStatus", "CodeLocked", "ForceCodeGeneration", "Status", "DriverClass")
SELECT '59C91825-70E2-4E6A-9799-A68F1516B92E', COALESCE((SELECT "ID" FROM "${mjSchema}"."ActionCategory" WHERE "ID" = '2B8D7135-626F-446E-B176-F148E25059F4' OR ("Name" = 'Secure Messaging' AND "ParentID" IS NULL) ORDER BY ("ID" = '2B8D7135-626F-446E-B176-F148E25059F4') DESC LIMIT 1), '2B8D7135-626F-446E-B176-F148E25059F4'), 'Start Secure Thread', 'Starts a brand-new secure thread with a contact (find-or-create Person by email, mint thread + portal session + single-use magic link) and seeds it with a first outbound message. Backs staff ''compose'' and Izzy''s thread-promotion / ''switch to secure channel'' flow. Returns the magic-link token for out-of-band delivery (?ml=<token>).', 'Custom', 'Approved', FALSE, FALSE, 'Active', '__StartSecureThread'
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Action" x WHERE x."ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E' OR x."Name" = 'Start Secure Thread');

-- Action params (ActionID re-resolved on the host by name)
-- Start Secure Thread.ContactEmail
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT 'A220CBAD-5BE1-42AB-9AA5-B8D1772B6381', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E' OR ("Name" = 'Start Secure Thread') ORDER BY ("ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E') DESC LIMIT 1), '59C91825-70E2-4E6A-9799-A68F1516B92E'), 'ContactEmail', 'Input', 'Scalar', FALSE, 'The external contact''s email. A matching Person is used, else one is created.', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = 'A220CBAD-5BE1-42AB-9AA5-B8D1772B6381' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E' OR ("Name" = 'Start Secure Thread') ORDER BY ("ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E') DESC LIMIT 1), '59C91825-70E2-4E6A-9799-A68F1516B92E') AND x."Name" = 'ContactEmail'));
-- Start Secure Thread.ContactName
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT 'ACE50709-129C-4F6C-B69F-7138215482D3', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E' OR ("Name" = 'Start Secure Thread') ORDER BY ("ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E') DESC LIMIT 1), '59C91825-70E2-4E6A-9799-A68F1516B92E'), 'ContactName', 'Input', 'Scalar', FALSE, 'Display name, used only when creating a new Person.', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = 'ACE50709-129C-4F6C-B69F-7138215482D3' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E' OR ("Name" = 'Start Secure Thread') ORDER BY ("ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E') DESC LIMIT 1), '59C91825-70E2-4E6A-9799-A68F1516B92E') AND x."Name" = 'ContactName'));
-- Start Secure Thread.FirstMessage
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT 'CA57EAA1-CD55-4873-8E5F-7D9EB8E1731C', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E' OR ("Name" = 'Start Secure Thread') ORDER BY ("ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E') DESC LIMIT 1), '59C91825-70E2-4E6A-9799-A68F1516B92E'), 'FirstMessage', 'Input', 'Scalar', FALSE, 'The first outbound message body to seed the thread with.', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = 'CA57EAA1-CD55-4873-8E5F-7D9EB8E1731C' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E' OR ("Name" = 'Start Secure Thread') ORDER BY ("ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E') DESC LIMIT 1), '59C91825-70E2-4E6A-9799-A68F1516B92E') AND x."Name" = 'FirstMessage'));
-- Start Secure Thread.MagicLinkToken
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT 'B27C2758-A4B8-4B2B-99C5-06643DC64751', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E' OR ("Name" = 'Start Secure Thread') ORDER BY ("ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E') DESC LIMIT 1), '59C91825-70E2-4E6A-9799-A68F1516B92E'), 'MagicLinkToken', 'Output', 'Scalar', FALSE, 'Single-use magic-link token; deliver to the contact as ?ml=<token>.', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = 'B27C2758-A4B8-4B2B-99C5-06643DC64751' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E' OR ("Name" = 'Start Secure Thread') ORDER BY ("ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E') DESC LIMIT 1), '59C91825-70E2-4E6A-9799-A68F1516B92E') AND x."Name" = 'MagicLinkToken'));
-- Start Secure Thread.MessageID
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT '15CF826D-E13E-4A28-9F0F-F19C4B7460C7', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E' OR ("Name" = 'Start Secure Thread') ORDER BY ("ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E') DESC LIMIT 1), '59C91825-70E2-4E6A-9799-A68F1516B92E'), 'MessageID', 'Output', 'Scalar', FALSE, 'The first message''s id.', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = '15CF826D-E13E-4A28-9F0F-F19C4B7460C7' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E' OR ("Name" = 'Start Secure Thread') ORDER BY ("ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E') DESC LIMIT 1), '59C91825-70E2-4E6A-9799-A68F1516B92E') AND x."Name" = 'MessageID'));
-- Start Secure Thread.ThreadID
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT '6CDA63B6-643F-44C9-83F7-E830BDBDB58B', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E' OR ("Name" = 'Start Secure Thread') ORDER BY ("ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E') DESC LIMIT 1), '59C91825-70E2-4E6A-9799-A68F1516B92E'), 'ThreadID', 'Output', 'Scalar', FALSE, 'The new secure thread id.', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = '6CDA63B6-643F-44C9-83F7-E830BDBDB58B' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E' OR ("Name" = 'Start Secure Thread') ORDER BY ("ID" = '59C91825-70E2-4E6A-9799-A68F1516B92E') DESC LIMIT 1), '59C91825-70E2-4E6A-9799-A68F1516B92E') AND x."Name" = 'ThreadID'));
-- Send Secure Message.Content
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT '96853775-4C6B-4815-99CB-CA73B17332EF', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9' OR ("Name" = 'Send Secure Message') ORDER BY ("ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9') DESC LIMIT 1), '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9'), 'Content', 'Input', 'Scalar', FALSE, 'The message body.', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = '96853775-4C6B-4815-99CB-CA73B17332EF' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9' OR ("Name" = 'Send Secure Message') ORDER BY ("ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9') DESC LIMIT 1), '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9') AND x."Name" = 'Content'));
-- Send Secure Message.MessageID
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT '791CD45C-85D5-4187-9701-FF3940D6F120', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9' OR ("Name" = 'Send Secure Message') ORDER BY ("ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9') DESC LIMIT 1), '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9'), 'MessageID', 'Output', 'Scalar', FALSE, 'The created SecureMessage row''s ID.', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = '791CD45C-85D5-4187-9701-FF3940D6F120' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9' OR ("Name" = 'Send Secure Message') ORDER BY ("ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9') DESC LIMIT 1), '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9') AND x."Name" = 'MessageID'));
-- Send Secure Message.Subject
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT 'B75C7BB7-4AB4-42ED-AEB8-78CEC828CA1D', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9' OR ("Name" = 'Send Secure Message') ORDER BY ("ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9') DESC LIMIT 1), '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9'), 'Subject', 'Input', 'Scalar', FALSE, 'Optional message subject.', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = 'B75C7BB7-4AB4-42ED-AEB8-78CEC828CA1D' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9' OR ("Name" = 'Send Secure Message') ORDER BY ("ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9') DESC LIMIT 1), '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9') AND x."Name" = 'Subject'));
-- Send Secure Message.ThreadID
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT '7272FD0F-76C0-4615-94E1-07BE2E2059DB', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9' OR ("Name" = 'Send Secure Message') ORDER BY ("ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9') DESC LIMIT 1), '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9'), 'ThreadID', 'Input', 'Scalar', FALSE, 'The secure thread (ThreadID) to post the outbound message into.', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = '7272FD0F-76C0-4615-94E1-07BE2E2059DB' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9' OR ("Name" = 'Send Secure Message') ORDER BY ("ID" = '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9') DESC LIMIT 1), '7EFCB953-08C3-43D6-9A22-B25FAC63DFA9') AND x."Name" = 'ThreadID'));
-- Issue Portal Magic Link.MagicLinkToken
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT '1109B7BF-E173-41C9-9DEE-A3BA73189977', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '76A41213-2CC5-4544-956D-BD9C00319E88' OR ("Name" = 'Issue Portal Magic Link') ORDER BY ("ID" = '76A41213-2CC5-4544-956D-BD9C00319E88') DESC LIMIT 1), '76A41213-2CC5-4544-956D-BD9C00319E88'), 'MagicLinkToken', 'Output', 'Scalar', FALSE, 'The raw single-use magic link token. Delivered out-of-band (e.g. emailed); never stored raw.', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = '1109B7BF-E173-41C9-9DEE-A3BA73189977' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '76A41213-2CC5-4544-956D-BD9C00319E88' OR ("Name" = 'Issue Portal Magic Link') ORDER BY ("ID" = '76A41213-2CC5-4544-956D-BD9C00319E88') DESC LIMIT 1), '76A41213-2CC5-4544-956D-BD9C00319E88') AND x."Name" = 'MagicLinkToken'));
-- Issue Portal Magic Link.SessionID
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT '6761E4F1-B460-4754-9AA5-F25AADCCFA0A', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '76A41213-2CC5-4544-956D-BD9C00319E88' OR ("Name" = 'Issue Portal Magic Link') ORDER BY ("ID" = '76A41213-2CC5-4544-956D-BD9C00319E88') DESC LIMIT 1), '76A41213-2CC5-4544-956D-BD9C00319E88'), 'SessionID', 'Input', 'Scalar', FALSE, 'The Portal Session (MJ_BizApps_SecureMessaging: Portal Sessions.ID) to issue the magic link for.', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = '6761E4F1-B460-4754-9AA5-F25AADCCFA0A' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '76A41213-2CC5-4544-956D-BD9C00319E88' OR ("Name" = 'Issue Portal Magic Link') ORDER BY ("ID" = '76A41213-2CC5-4544-956D-BD9C00319E88') DESC LIMIT 1), '76A41213-2CC5-4544-956D-BD9C00319E88') AND x."Name" = 'SessionID'));
-- Promote Thread.ContactEmail
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT 'A13A2014-5A9F-4BB2-AC5F-8CCA31B6B390', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C'), 'ContactEmail', 'Input', 'Scalar', FALSE, 'The external contact''s email. A matching Person is used, else one is created.', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = 'A13A2014-5A9F-4BB2-AC5F-8CCA31B6B390' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') AND x."Name" = 'ContactEmail'));
-- Promote Thread.ContactName
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT '095D63BF-BCDB-42E0-85A1-84A66C8CD155', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C'), 'ContactName', 'Input', 'Scalar', FALSE, 'Display name, used only when creating a new Person.', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = '095D63BF-BCDB-42E0-85A1-84A66C8CD155' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') AND x."Name" = 'ContactName'));
-- Promote Thread.ImportedCount
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT 'B4D2E25D-263F-4FAD-82BD-4B3ED8FDAB40', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C'), 'ImportedCount', 'Output', 'Scalar', FALSE, 'How many prior messages were imported into the secure thread.', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = 'B4D2E25D-263F-4FAD-82BD-4B3ED8FDAB40' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') AND x."Name" = 'ImportedCount'));
-- Promote Thread.MagicLinkToken
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT '685DD5C8-49E2-462A-8DEE-39BDFFF9382C', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C'), 'MagicLinkToken', 'Output', 'Scalar', FALSE, 'Single-use magic-link token; deliver to the contact as ?ml=<token>.', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = '685DD5C8-49E2-462A-8DEE-39BDFFF9382C' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') AND x."Name" = 'MagicLinkToken'));
-- Promote Thread.MessagesJSON
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT '3DE0F7CF-3320-432B-A64C-9D166B130594', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C'), 'MessagesJSON', 'Input', 'Scalar', FALSE, 'JSON array of the prior messages to import, oldest-first. Each item: { direction: ''Inbound''|''Outbound'', sender: string, recipient?: string, content: string, subject?: string, receivedAt?: string }.', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = '3DE0F7CF-3320-432B-A64C-9D166B130594' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') AND x."Name" = 'MessagesJSON'));
-- Promote Thread.SourceChannel
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT 'C2475E5C-9A0E-4543-A791-D29843AA8FAD', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C'), 'SourceChannel', 'Input', 'Scalar', FALSE, 'The insecure channel the thread is being promoted from (e.g. ''Email'', ''SMS''). Stored on each imported message as SourceChannel.', TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = 'C2475E5C-9A0E-4543-A791-D29843AA8FAD' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') AND x."Name" = 'SourceChannel'));
-- Promote Thread.ThreadID
INSERT INTO "${mjSchema}"."ActionParam" ("ID", "ActionID", "Name", "Type", "ValueType", "IsArray", "Description", "IsRequired", "LogValue")
SELECT 'E43F878F-B77D-4A6B-ABB4-B2B1F9DC0CED', COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C'), 'ThreadID', 'Output', 'Scalar', FALSE, 'The new secure thread id.', FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."ActionParam" x WHERE x."ID" = 'E43F878F-B77D-4A6B-ABB4-B2B1F9DC0CED' OR (x."ActionID" = COALESCE((SELECT "ID" FROM "${mjSchema}"."Action" WHERE "ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C' OR ("Name" = 'Promote Thread') ORDER BY ("ID" = '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') DESC LIMIT 1), '7FDA4426-08ED-4E06-806D-D1BDDEEB3B9C') AND x."Name" = 'ThreadID'));

-- Application
INSERT INTO "${mjSchema}"."Application" ("ID", "Name", "Description", "Icon", "DefaultForNewUser", "Color", "DefaultNavItems", "ClassName", "DefaultSequence", "Status", "NavigationStyle", "HideNavBarIconWhenActive", "Path", "AutoUpdatePath")
SELECT '1D153638-D221-4BED-B1DD-942F40EDAC83', 'Secure Messages', 'Secure web messaging portal for managing encrypted contact conversations', 'fa-solid fa-shield-halved', FALSE, '#1a73e8', '[
  {
    "Label": "Inbox",
    "Icon": "fa-solid fa-inbox",
    "ResourceType": "Custom",
    "DriverClass": "SecureMessagingResource",
    "isDefault": true
  }
]', 'SecureMessagingApplication', 500, 'Active', 'App Switcher', FALSE, 'secure-messages', TRUE
WHERE NOT EXISTS (SELECT 1 FROM "${mjSchema}"."Application" x WHERE x."ID" = '1D153638-D221-4BED-B1DD-942F40EDAC83' OR x."Name" = 'Secure Messages');

-- Entity overrides (every Entity ID here is pinned by the PG baseline)
-- MJ_BizApps_SecureMessaging: Portal Sessions
UPDATE "${mjSchema}"."Entity" SET
    "BaseView" = 'vwPortalSessions',
    "IncludeInAPI" = TRUE,
    "AllowCreateAPI" = TRUE,
    "AllowUpdateAPI" = TRUE,
    "AllowDeleteAPI" = FALSE,
    "TrackRecordChanges" = TRUE,
    "AllowUserSearchAPI" = FALSE,
    "AutoUpdateAllowUserSearchAPI" = FALSE
WHERE "ID" = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9';
-- MJ_BizApps_SecureMessaging: Portal Magic Links
UPDATE "${mjSchema}"."Entity" SET
    "BaseView" = 'vwPortalMagicLinks',
    "IncludeInAPI" = TRUE,
    "AllowCreateAPI" = TRUE,
    "AllowUpdateAPI" = TRUE,
    "AllowDeleteAPI" = FALSE,
    "TrackRecordChanges" = TRUE,
    "AllowUserSearchAPI" = FALSE,
    "AutoUpdateAllowUserSearchAPI" = FALSE
WHERE "ID" = '2B2E8762-39B4-488D-953C-BA1169E774D1';
-- MJ_BizApps_SecureMessaging: Secure Messages
UPDATE "${mjSchema}"."Entity" SET
    "BaseView" = 'vwSecureMessages',
    "IncludeInAPI" = TRUE,
    "AllowCreateAPI" = TRUE,
    "AllowUpdateAPI" = TRUE,
    "AllowDeleteAPI" = FALSE,
    "TrackRecordChanges" = TRUE,
    "AllowUserSearchAPI" = FALSE,
    "AutoUpdateAllowUserSearchAPI" = FALSE
WHERE "ID" = '95A23EED-0C13-4D65-965C-FD40C371C870';
-- MJ_BizApps_SecureMessaging: Message Files
UPDATE "${mjSchema}"."Entity" SET
    "BaseView" = 'vwMessageFiles',
    "IncludeInAPI" = TRUE,
    "AllowCreateAPI" = TRUE,
    "AllowUpdateAPI" = TRUE,
    "AllowDeleteAPI" = TRUE,
    "TrackRecordChanges" = TRUE,
    "AllowUserSearchAPI" = FALSE,
    "AutoUpdateAllowUserSearchAPI" = FALSE
WHERE "ID" = 'C08C5B36-FFFD-455B-849E-9481C8E1286C';
-- MJ_BizApps_SecureMessaging: File Requests
UPDATE "${mjSchema}"."Entity" SET
    "BaseView" = 'vwFileRequests',
    "IncludeInAPI" = TRUE,
    "AllowCreateAPI" = TRUE,
    "AllowUpdateAPI" = TRUE,
    "AllowDeleteAPI" = FALSE,
    "TrackRecordChanges" = TRUE,
    "AllowUserSearchAPI" = FALSE,
    "AutoUpdateAllowUserSearchAPI" = FALSE
WHERE "ID" = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27';
-- MJ_BizApps_SecureMessaging: Secure Threads
UPDATE "${mjSchema}"."Entity" SET
    "BaseView" = 'vwSecureThreads',
    "IncludeInAPI" = TRUE,
    "AllowCreateAPI" = TRUE,
    "AllowUpdateAPI" = TRUE,
    "AllowDeleteAPI" = TRUE,
    "TrackRecordChanges" = TRUE,
    "AllowUserSearchAPI" = FALSE,
    "AutoUpdateAllowUserSearchAPI" = FALSE
WHERE "ID" = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88';
-- MJ_BizApps_SecureMessaging: Secure Threads
UPDATE "${mjSchema}"."Entity" SET
    "Configuration" = '{
  "UI": {
    "Form": {
      "Layout": "left-nav",
      "RelatedRolePolicy": "smart",
      "PrimaryRelatedBudget": 6
    }
  }
}'
WHERE "ID" = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88';

-- Entity relationship overrides (every ID here is pinned by the PG baseline)
-- MJ_BizApps_SecureMessaging: Secure Threads -> MJ_BizApps_SecureMessaging: File Requests
UPDATE "${mjSchema}"."EntityRelationship" SET "Configuration" = '{
  "UI": {
    "inclusion": "More"
  }
}'
WHERE "ID" = 'A2E039A5-D192-433D-B9BD-CED54D36A8D4';
-- MJ_BizApps_SecureMessaging: Secure Threads -> MJ_BizApps_SecureMessaging: Message Files
UPDATE "${mjSchema}"."EntityRelationship" SET "Configuration" = '{
  "UI": {
    "inclusion": "More"
  }
}'
WHERE "ID" = '55B78EAD-60F4-454A-93C4-927A683D09B7';
-- MJ_BizApps_SecureMessaging: Secure Threads -> MJ_BizApps_SecureMessaging: Portal Magic Links
UPDATE "${mjSchema}"."EntityRelationship" SET "Configuration" = '{
  "UI": {
    "inclusion": "None"
  }
}'
WHERE "ID" = '2A57F3CE-237E-48BF-A7CD-44671634AF1F';
-- MJ_BizApps_SecureMessaging: Secure Threads -> MJ_BizApps_SecureMessaging: Secure Messages
UPDATE "${mjSchema}"."EntityRelationship" SET "Configuration" = '{
  "UI": {
    "inclusion": "Primary"
  }
}'
WHERE "ID" = 'E64E58E2-81CA-4A75-B04F-AF9C32B41F3F';
