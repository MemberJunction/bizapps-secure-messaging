-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj_BizAppsSecureMessaging;
SET search_path TO __mj_BizAppsSecureMessaging, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== DDL: Tables, PKs, Indexes =====================

-- =====================================================================================
-- MJ Secure Messaging — v1.0 baseline schema
--
-- The complete __mj_BizAppsSecureMessaging schema in one pass (squashed from the
-- pre-release migration chain; the app first ships at v1.0, so there is no upgrade
-- path to preserve). Model (docs/PRD.md):
--
-- SecureThread — a first-class conversation between the org and ONE contact.
-- Subject line, lifecycle (Active/Closed/Archived), soft delete.
-- Everything else FKs to it; magic links deep-link into it.
-- PortalSession — authenticates the CONTACT (not a thread): one active session
-- grants portal access to all of that contact's threads.
-- Opaque token, SHA-256 hashed, sliding TTL, revocable.
-- PortalMagicLink — single-use, short-lived links that redeem into a fresh session
-- token; optionally deep-link to a specific thread.
-- SecureMessage — the self-contained message store (no external Channel Messages
-- dependency); provenance flags mark messages imported by the
-- promote bridge.
-- MessageFile — links an uploaded file to a thread/message. Bytes live in core
-- MJ File Storage (MJ: Files) wrapped as MJ Artifacts; this table
-- holds references only.
-- FileRequest — staff ask the contact for documents; full lifecycle
-- (Pending → Fulfilled | Cancelled | Expired).
--
-- E-signature is handled by the core MJ eSignature subsystem (@memberjunction/esignature);
-- a signature request links back to its SecureThread via the engine's polymorphic
-- EntityID/RecordID, so this schema defines no signature table.
--
-- ContactID / CreatedByUserID / PersonID are SOFT references (no cross-schema FK) so the
-- schema stays standalone; contacts resolve against MJ_BizApps_Common.Person by default.
-- Per MJ convention, CodeGen owns __mj timestamp columns, FK indexes, views, and SPs —
-- none of those appear here.
-- =====================================================================================

-- ── SecureThread ─────────────────────────────────────────────────────────────────────
CREATE TABLE __mj_BizAppsSecureMessaging."SecureThread" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ContactID" UUID NOT NULL,
 "Subject" VARCHAR(500) NOT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 "SourceChannel" VARCHAR(50) NULL,
 "CreatedByUserID" UUID NULL,
 "LastMessageAt" TIMESTAMPTZ NULL,
 "IsDeleted" BOOLEAN NOT NULL DEFAULT FALSE,
 CONSTRAINT "PK_SecureThread" PRIMARY KEY ("ID"),
 CONSTRAINT "CK_SecureThread_Status" CHECK ("Status" IN ('Active','Closed','Archived'))
);

-- ── PortalSession ────────────────────────────────────────────────────────────────────
CREATE TABLE __mj_BizAppsSecureMessaging."PortalSession" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "ContactID" UUID NOT NULL,
 "TokenHash" VARCHAR(128) NOT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 "ExpiresAt" TIMESTAMPTZ NOT NULL,
 "LastAccessedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CONSTRAINT "PK_PortalSession" PRIMARY KEY ("ID"),
 CONSTRAINT "CK_PortalSession_Status" CHECK ("Status" IN ('Active', 'Expired', 'Revoked'))
);

-- ── PortalMagicLink ──────────────────────────────────────────────────────────────────
CREATE TABLE __mj_BizAppsSecureMessaging."PortalMagicLink" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PortalSessionID" UUID NOT NULL,
 "TokenHash" VARCHAR(128) NOT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
 "ExpiresAt" TIMESTAMPTZ NOT NULL,
 "UsedAt" TIMESTAMPTZ NULL,
 "DeepLinkThreadID" UUID NULL,
 CONSTRAINT "PK_PortalMagicLink" PRIMARY KEY ("ID"),
 CONSTRAINT "CK_PortalMagicLink_Status" CHECK ("Status" IN ('Pending', 'Used', 'Expired')),
 CONSTRAINT "FK_PortalMagicLink_PortalSession" FOREIGN KEY ("PortalSessionID") REFERENCES __mj_BizAppsSecureMessaging."PortalSession"("ID"),
 CONSTRAINT "FK_PortalMagicLink_SecureThread" FOREIGN KEY ("DeepLinkThreadID") REFERENCES __mj_BizAppsSecureMessaging."SecureThread"("ID")
);

-- ── SecureMessage ────────────────────────────────────────────────────────────────────
CREATE TABLE __mj_BizAppsSecureMessaging."SecureMessage" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PortalSessionID" UUID NOT NULL,
 "ThreadID" UUID NOT NULL,
 "PersonID" UUID NULL,
 "Direction" VARCHAR(20) NOT NULL DEFAULT 'Inbound',
 "Sender" VARCHAR(255) NOT NULL,
 "Recipient" VARCHAR(255) NOT NULL DEFAULT '',
 "Subject" VARCHAR(255) NULL,
 "Content" TEXT NOT NULL,
 "IsSecure" BOOLEAN NOT NULL DEFAULT TRUE,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'New',
 "ExternalMessageID" UUID NULL,
 "ReceivedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 "IsStarred" BOOLEAN NOT NULL DEFAULT FALSE,
 "IsImported" BOOLEAN NOT NULL DEFAULT FALSE,
 "SourceChannel" VARCHAR(50) NULL,
 CONSTRAINT "PK_SecureMessage" PRIMARY KEY ("ID"),
 CONSTRAINT "CK_SecureMessage_Direction" CHECK ("Direction" IN ('Inbound', 'Outbound')),
 CONSTRAINT "CK_SecureMessage_Status" CHECK ("Status" IN ('New', 'Read', 'Replied', 'Sent', 'Failed')),
 CONSTRAINT "FK_SecureMessage_PortalSession" FOREIGN KEY ("PortalSessionID") REFERENCES __mj_BizAppsSecureMessaging."PortalSession"("ID"),
 CONSTRAINT "FK_SecureMessage_SecureThread" FOREIGN KEY ("ThreadID") REFERENCES __mj_BizAppsSecureMessaging."SecureThread"("ID")
);

-- ── MessageFile ──────────────────────────────────────────────────────────────────────
CREATE TABLE __mj_BizAppsSecureMessaging."MessageFile" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "SecureMessageID" UUID NULL,
 "ExternalMessageID" UUID NULL,
 "ThreadID" UUID NOT NULL,
 "ArtifactID" UUID NULL,
 "FileID" UUID NULL,
 "Filename" VARCHAR(500) NOT NULL,
 "ContentType" VARCHAR(255) NULL,
 "Size" BIGINT NULL,
 CONSTRAINT "PK_MessageFile" PRIMARY KEY ("ID"),
 CONSTRAINT "FK_MessageFile_SecureMessage" FOREIGN KEY ("SecureMessageID") REFERENCES __mj_BizAppsSecureMessaging."SecureMessage"("ID"),
 CONSTRAINT "FK_MessageFile_SecureThread" FOREIGN KEY ("ThreadID") REFERENCES __mj_BizAppsSecureMessaging."SecureThread"("ID")
);

-- ── FileRequest ──────────────────────────────────────────────────────────────────────
CREATE TABLE __mj_BizAppsSecureMessaging."FileRequest" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "PortalSessionID" UUID NOT NULL,
 "ThreadID" UUID NOT NULL,
 "Title" VARCHAR(255) NOT NULL,
 "Instructions" TEXT NULL,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Pending',
 "RequestedByUserID" UUID NULL,
 "DueAt" TIMESTAMPTZ NULL,
 "FulfilledAt" TIMESTAMPTZ NULL,
 CONSTRAINT "PK_FileRequest" PRIMARY KEY ("ID"),
 CONSTRAINT "CK_FileRequest_Status" CHECK ("Status" IN ('Pending', 'Fulfilled', 'Cancelled', 'Expired')),
 CONSTRAINT "FK_FileRequest_PortalSession" FOREIGN KEY ("PortalSessionID") REFERENCES __mj_BizAppsSecureMessaging."PortalSession"("ID"),
 CONSTRAINT "FK_FileRequest_SecureThread" FOREIGN KEY ("ThreadID") REFERENCES __mj_BizAppsSecureMessaging."SecureThread"("ID")
);

ALTER TABLE __mj_BizAppsSecureMessaging."FileRequest"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging.FileRequest */
ALTER TABLE __mj_BizAppsSecureMessaging."FileRequest"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging.MessageFile */
ALTER TABLE __mj_BizAppsSecureMessaging."MessageFile"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging.MessageFile */
ALTER TABLE __mj_BizAppsSecureMessaging."MessageFile"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging.PortalMagicLink */
ALTER TABLE __mj_BizAppsSecureMessaging."PortalMagicLink"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging.PortalMagicLink */
ALTER TABLE __mj_BizAppsSecureMessaging."PortalMagicLink"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging.SecureThread */
ALTER TABLE __mj_BizAppsSecureMessaging."SecureThread"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging.SecureThread */
ALTER TABLE __mj_BizAppsSecureMessaging."SecureThread"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging.PortalSession */
ALTER TABLE __mj_BizAppsSecureMessaging."PortalSession"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging.PortalSession */
ALTER TABLE __mj_BizAppsSecureMessaging."PortalSession"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging.SecureMessage */
ALTER TABLE __mj_BizAppsSecureMessaging."SecureMessage"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging.SecureMessage */
ALTER TABLE __mj_BizAppsSecureMessaging."SecureMessage"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_FileRequest_PortalSessionID" ON __mj_BizAppsSecureMessaging."FileRequest" ("PortalSessionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_FileRequest_ThreadID" ON __mj_BizAppsSecureMessaging."FileRequest" ("ThreadID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MessageFile_SecureMessageID" ON __mj_BizAppsSecureMessaging."MessageFile" ("SecureMessageID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_MessageFile_ThreadID" ON __mj_BizAppsSecureMessaging."MessageFile" ("ThreadID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_PortalMagicLink_PortalSessionID" ON __mj_BizAppsSecureMessaging."PortalMagicLink" ("PortalSessionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_PortalMagicLink_DeepLinkThreadID" ON __mj_BizAppsSecureMessaging."PortalMagicLink" ("DeepLinkThreadID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SecureMessage_PortalSessionID" ON __mj_BizAppsSecureMessaging."SecureMessage" ("PortalSessionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_SecureMessage_ThreadID" ON __mj_BizAppsSecureMessaging."SecureMessage" ("ThreadID");


-- ===================== Views =====================

DROP VIEW IF EXISTS __mj_BizAppsSecureMessaging."vwFileRequests" CASCADE;
DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_bizappssecuremessaging';
  v_target_name CONSTANT TEXT := 'vwFileRequests';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsSecureMessaging."vwFileRequests"
AS SELECT
    f.*
FROM
    __mj_BizAppsSecureMessaging."FileRequest" AS f$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DROP VIEW IF EXISTS __mj_BizAppsSecureMessaging."vwMessageFiles" CASCADE;
DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_bizappssecuremessaging';
  v_target_name CONSTANT TEXT := 'vwMessageFiles';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsSecureMessaging."vwMessageFiles"
AS SELECT
    m.*
FROM
    __mj_BizAppsSecureMessaging."MessageFile" AS m$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DROP VIEW IF EXISTS __mj_BizAppsSecureMessaging."vwPortalMagicLinks" CASCADE;
DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_bizappssecuremessaging';
  v_target_name CONSTANT TEXT := 'vwPortalMagicLinks';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsSecureMessaging."vwPortalMagicLinks"
AS SELECT
    p.*
FROM
    __mj_BizAppsSecureMessaging."PortalMagicLink" AS p$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DROP VIEW IF EXISTS __mj_BizAppsSecureMessaging."vwPortalSessions" CASCADE;
DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_bizappssecuremessaging';
  v_target_name CONSTANT TEXT := 'vwPortalSessions';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsSecureMessaging."vwPortalSessions"
AS SELECT
    p.*
FROM
    __mj_BizAppsSecureMessaging."PortalSession" AS p$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DROP VIEW IF EXISTS __mj_BizAppsSecureMessaging."vwSecureMessages" CASCADE;
DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_bizappssecuremessaging';
  v_target_name CONSTANT TEXT := 'vwSecureMessages';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsSecureMessaging."vwSecureMessages"
AS SELECT
    s.*
FROM
    __mj_BizAppsSecureMessaging."SecureMessage" AS s$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DROP VIEW IF EXISTS __mj_BizAppsSecureMessaging."vwSecureThreads" CASCADE;
DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj_bizappssecuremessaging';
  v_target_name CONSTANT TEXT := 'vwSecureThreads';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj_BizAppsSecureMessaging."vwSecureThreads"
AS SELECT
    s.*
FROM
    __mj_BizAppsSecureMessaging."SecureThread" AS s$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spCreateFileRequest).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spCreateFileRequest"(p_id uuid DEFAULT NULL::uuid, p_portalsessionid uuid DEFAULT NULL::uuid, p_threadid uuid DEFAULT NULL::uuid, p_title character varying DEFAULT NULL::character varying, p_instructions_clear boolean DEFAULT false, p_instructions text DEFAULT NULL::text, p_status character varying DEFAULT NULL::character varying, p_requestedbyuserid_clear boolean DEFAULT false, p_requestedbyuserid uuid DEFAULT NULL::uuid, p_dueat_clear boolean DEFAULT false, p_dueat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fulfilledat_clear boolean DEFAULT false, p_fulfilledat timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS SETOF __mj_bizappssecuremessaging."vwFileRequests"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj_bizappssecuremessaging."FileRequest"
        (
            "ID",
            "PortalSessionID",
                "ThreadID",
                "Title",
                "Instructions",
                "Status",
                "RequestedByUserID",
                "DueAt",
                "FulfilledAt"
        )
    VALUES
        (
            v_new_id,
            p_portalsessionid,
                p_threadid,
                p_title,
                CASE WHEN p_instructions_clear = true THEN NULL ELSE COALESCE(p_instructions, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_requestedbyuserid_clear = true THEN NULL ELSE COALESCE(p_requestedbyuserid, NULL) END,
                CASE WHEN p_dueat_clear = true THEN NULL ELSE COALESCE(p_dueat, NULL) END,
                CASE WHEN p_fulfilledat_clear = true THEN NULL ELSE COALESCE(p_fulfilledat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj_bizappssecuremessaging."vwFileRequests"
    WHERE "ID" = v_new_id;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spUpdateFileRequest).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spUpdateFileRequest"(p_id uuid, p_portalsessionid uuid DEFAULT NULL::uuid, p_threadid uuid DEFAULT NULL::uuid, p_title character varying DEFAULT NULL::character varying, p_instructions_clear boolean DEFAULT false, p_instructions text DEFAULT NULL::text, p_status character varying DEFAULT NULL::character varying, p_requestedbyuserid_clear boolean DEFAULT false, p_requestedbyuserid uuid DEFAULT NULL::uuid, p_dueat_clear boolean DEFAULT false, p_dueat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_fulfilledat_clear boolean DEFAULT false, p_fulfilledat timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS SETOF __mj_bizappssecuremessaging."vwFileRequests"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj_bizappssecuremessaging."FileRequest"
    SET
        "PortalSessionID" = COALESCE(p_portalsessionid, "PortalSessionID"),
        "ThreadID" = COALESCE(p_threadid, "ThreadID"),
        "Title" = COALESCE(p_title, "Title"),
        "Instructions" = CASE WHEN p_instructions_clear = true THEN NULL ELSE COALESCE(p_instructions, "Instructions") END,
        "Status" = COALESCE(p_status, "Status"),
        "RequestedByUserID" = CASE WHEN p_requestedbyuserid_clear = true THEN NULL ELSE COALESCE(p_requestedbyuserid, "RequestedByUserID") END,
        "DueAt" = CASE WHEN p_dueat_clear = true THEN NULL ELSE COALESCE(p_dueat, "DueAt") END,
        "FulfilledAt" = CASE WHEN p_fulfilledat_clear = true THEN NULL ELSE COALESCE(p_fulfilledat, "FulfilledAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj_bizappssecuremessaging."vwFileRequests"
    WHERE "ID" = p_id;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spCreateMessageFile).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spCreateMessageFile"(p_id uuid DEFAULT NULL::uuid, p_securemessageid_clear boolean DEFAULT false, p_securemessageid uuid DEFAULT NULL::uuid, p_externalmessageid_clear boolean DEFAULT false, p_externalmessageid uuid DEFAULT NULL::uuid, p_threadid uuid DEFAULT NULL::uuid, p_artifactid_clear boolean DEFAULT false, p_artifactid uuid DEFAULT NULL::uuid, p_fileid_clear boolean DEFAULT false, p_fileid uuid DEFAULT NULL::uuid, p_filename character varying DEFAULT NULL::character varying, p_contenttype_clear boolean DEFAULT false, p_contenttype character varying DEFAULT NULL::character varying, p_size_clear boolean DEFAULT false, p_size bigint DEFAULT NULL::bigint)
 RETURNS SETOF __mj_bizappssecuremessaging."vwMessageFiles"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj_bizappssecuremessaging."MessageFile"
        (
            "ID",
            "SecureMessageID",
                "ExternalMessageID",
                "ThreadID",
                "ArtifactID",
                "FileID",
                "Filename",
                "ContentType",
                "Size"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_securemessageid_clear = true THEN NULL ELSE COALESCE(p_securemessageid, NULL) END,
                CASE WHEN p_externalmessageid_clear = true THEN NULL ELSE COALESCE(p_externalmessageid, NULL) END,
                p_threadid,
                CASE WHEN p_artifactid_clear = true THEN NULL ELSE COALESCE(p_artifactid, NULL) END,
                CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, NULL) END,
                p_filename,
                CASE WHEN p_contenttype_clear = true THEN NULL ELSE COALESCE(p_contenttype, NULL) END,
                CASE WHEN p_size_clear = true THEN NULL ELSE COALESCE(p_size, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj_bizappssecuremessaging."vwMessageFiles"
    WHERE "ID" = v_new_id;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spUpdateMessageFile).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spUpdateMessageFile"(p_id uuid, p_securemessageid_clear boolean DEFAULT false, p_securemessageid uuid DEFAULT NULL::uuid, p_externalmessageid_clear boolean DEFAULT false, p_externalmessageid uuid DEFAULT NULL::uuid, p_threadid uuid DEFAULT NULL::uuid, p_artifactid_clear boolean DEFAULT false, p_artifactid uuid DEFAULT NULL::uuid, p_fileid_clear boolean DEFAULT false, p_fileid uuid DEFAULT NULL::uuid, p_filename character varying DEFAULT NULL::character varying, p_contenttype_clear boolean DEFAULT false, p_contenttype character varying DEFAULT NULL::character varying, p_size_clear boolean DEFAULT false, p_size bigint DEFAULT NULL::bigint)
 RETURNS SETOF __mj_bizappssecuremessaging."vwMessageFiles"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj_bizappssecuremessaging."MessageFile"
    SET
        "SecureMessageID" = CASE WHEN p_securemessageid_clear = true THEN NULL ELSE COALESCE(p_securemessageid, "SecureMessageID") END,
        "ExternalMessageID" = CASE WHEN p_externalmessageid_clear = true THEN NULL ELSE COALESCE(p_externalmessageid, "ExternalMessageID") END,
        "ThreadID" = COALESCE(p_threadid, "ThreadID"),
        "ArtifactID" = CASE WHEN p_artifactid_clear = true THEN NULL ELSE COALESCE(p_artifactid, "ArtifactID") END,
        "FileID" = CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, "FileID") END,
        "Filename" = COALESCE(p_filename, "Filename"),
        "ContentType" = CASE WHEN p_contenttype_clear = true THEN NULL ELSE COALESCE(p_contenttype, "ContentType") END,
        "Size" = CASE WHEN p_size_clear = true THEN NULL ELSE COALESCE(p_size, "Size") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj_bizappssecuremessaging."vwMessageFiles"
    WHERE "ID" = p_id;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spCreatePortalMagicLink).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spCreatePortalMagicLink"(p_id uuid DEFAULT NULL::uuid, p_portalsessionid uuid DEFAULT NULL::uuid, p_tokenhash character varying DEFAULT NULL::character varying, p_status character varying DEFAULT NULL::character varying, p_expiresat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_usedat_clear boolean DEFAULT false, p_usedat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_deeplinkthreadid_clear boolean DEFAULT false, p_deeplinkthreadid uuid DEFAULT NULL::uuid)
 RETURNS SETOF __mj_bizappssecuremessaging."vwPortalMagicLinks"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj_bizappssecuremessaging."PortalMagicLink"
        (
            "ID",
            "PortalSessionID",
                "TokenHash",
                "Status",
                "ExpiresAt",
                "UsedAt",
                "DeepLinkThreadID"
        )
    VALUES
        (
            v_new_id,
            p_portalsessionid,
                p_tokenhash,
                COALESCE(p_status, 'Pending'),
                p_expiresat,
                CASE WHEN p_usedat_clear = true THEN NULL ELSE COALESCE(p_usedat, NULL) END,
                CASE WHEN p_deeplinkthreadid_clear = true THEN NULL ELSE COALESCE(p_deeplinkthreadid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj_bizappssecuremessaging."vwPortalMagicLinks"
    WHERE "ID" = v_new_id;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spUpdatePortalMagicLink).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spUpdatePortalMagicLink"(p_id uuid, p_portalsessionid uuid DEFAULT NULL::uuid, p_tokenhash character varying DEFAULT NULL::character varying, p_status character varying DEFAULT NULL::character varying, p_expiresat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_usedat_clear boolean DEFAULT false, p_usedat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_deeplinkthreadid_clear boolean DEFAULT false, p_deeplinkthreadid uuid DEFAULT NULL::uuid)
 RETURNS SETOF __mj_bizappssecuremessaging."vwPortalMagicLinks"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj_bizappssecuremessaging."PortalMagicLink"
    SET
        "PortalSessionID" = COALESCE(p_portalsessionid, "PortalSessionID"),
        "TokenHash" = COALESCE(p_tokenhash, "TokenHash"),
        "Status" = COALESCE(p_status, "Status"),
        "ExpiresAt" = COALESCE(p_expiresat, "ExpiresAt"),
        "UsedAt" = CASE WHEN p_usedat_clear = true THEN NULL ELSE COALESCE(p_usedat, "UsedAt") END,
        "DeepLinkThreadID" = CASE WHEN p_deeplinkthreadid_clear = true THEN NULL ELSE COALESCE(p_deeplinkthreadid, "DeepLinkThreadID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj_bizappssecuremessaging."vwPortalMagicLinks"
    WHERE "ID" = p_id;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spCreatePortalSession).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spCreatePortalSession"(p_id uuid DEFAULT NULL::uuid, p_contactid uuid DEFAULT NULL::uuid, p_tokenhash character varying DEFAULT NULL::character varying, p_status character varying DEFAULT NULL::character varying, p_expiresat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_lastaccessedat timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS SETOF __mj_bizappssecuremessaging."vwPortalSessions"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj_bizappssecuremessaging."PortalSession"
        (
            "ID",
            "ContactID",
                "TokenHash",
                "Status",
                "ExpiresAt",
                "LastAccessedAt"
        )
    VALUES
        (
            v_new_id,
            p_contactid,
                p_tokenhash,
                COALESCE(p_status, 'Active'),
                p_expiresat,
                COALESCE(p_lastaccessedat, NOW())
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj_bizappssecuremessaging."vwPortalSessions"
    WHERE "ID" = v_new_id;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spUpdatePortalSession).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spUpdatePortalSession"(p_id uuid, p_contactid uuid DEFAULT NULL::uuid, p_tokenhash character varying DEFAULT NULL::character varying, p_status character varying DEFAULT NULL::character varying, p_expiresat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_lastaccessedat timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS SETOF __mj_bizappssecuremessaging."vwPortalSessions"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj_bizappssecuremessaging."PortalSession"
    SET
        "ContactID" = COALESCE(p_contactid, "ContactID"),
        "TokenHash" = COALESCE(p_tokenhash, "TokenHash"),
        "Status" = COALESCE(p_status, "Status"),
        "ExpiresAt" = COALESCE(p_expiresat, "ExpiresAt"),
        "LastAccessedAt" = COALESCE(p_lastaccessedat, "LastAccessedAt")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj_bizappssecuremessaging."vwPortalSessions"
    WHERE "ID" = p_id;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spCreateSecureMessage).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spCreateSecureMessage"(p_id uuid DEFAULT NULL::uuid, p_portalsessionid uuid DEFAULT NULL::uuid, p_threadid uuid DEFAULT NULL::uuid, p_personid_clear boolean DEFAULT false, p_personid uuid DEFAULT NULL::uuid, p_direction character varying DEFAULT NULL::character varying, p_sender character varying DEFAULT NULL::character varying, p_recipient character varying DEFAULT NULL::character varying, p_subject_clear boolean DEFAULT false, p_subject character varying DEFAULT NULL::character varying, p_content text DEFAULT NULL::text, p_issecure boolean DEFAULT NULL::boolean, p_status character varying DEFAULT NULL::character varying, p_externalmessageid_clear boolean DEFAULT false, p_externalmessageid uuid DEFAULT NULL::uuid, p_receivedat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_isstarred boolean DEFAULT NULL::boolean, p_isimported boolean DEFAULT NULL::boolean, p_sourcechannel_clear boolean DEFAULT false, p_sourcechannel character varying DEFAULT NULL::character varying)
 RETURNS SETOF __mj_bizappssecuremessaging."vwSecureMessages"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj_bizappssecuremessaging."SecureMessage"
        (
            "ID",
            "PortalSessionID",
                "ThreadID",
                "PersonID",
                "Direction",
                "Sender",
                "Recipient",
                "Subject",
                "Content",
                "IsSecure",
                "Status",
                "ExternalMessageID",
                "ReceivedAt",
                "IsStarred",
                "IsImported",
                "SourceChannel"
        )
    VALUES
        (
            v_new_id,
            p_portalsessionid,
                p_threadid,
                CASE WHEN p_personid_clear = true THEN NULL ELSE COALESCE(p_personid, NULL) END,
                COALESCE(p_direction, 'Inbound'),
                p_sender,
                p_recipient,
                CASE WHEN p_subject_clear = true THEN NULL ELSE COALESCE(p_subject, NULL) END,
                p_content,
                COALESCE(p_issecure, TRUE),
                COALESCE(p_status, 'New'),
                CASE WHEN p_externalmessageid_clear = true THEN NULL ELSE COALESCE(p_externalmessageid, NULL) END,
                COALESCE(p_receivedat, NOW()),
                COALESCE(p_isstarred, FALSE),
                COALESCE(p_isimported, FALSE),
                CASE WHEN p_sourcechannel_clear = true THEN NULL ELSE COALESCE(p_sourcechannel, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj_bizappssecuremessaging."vwSecureMessages"
    WHERE "ID" = v_new_id;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spUpdateSecureMessage).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spUpdateSecureMessage"(p_id uuid, p_portalsessionid uuid DEFAULT NULL::uuid, p_threadid uuid DEFAULT NULL::uuid, p_personid_clear boolean DEFAULT false, p_personid uuid DEFAULT NULL::uuid, p_direction character varying DEFAULT NULL::character varying, p_sender character varying DEFAULT NULL::character varying, p_recipient character varying DEFAULT NULL::character varying, p_subject_clear boolean DEFAULT false, p_subject character varying DEFAULT NULL::character varying, p_content text DEFAULT NULL::text, p_issecure boolean DEFAULT NULL::boolean, p_status character varying DEFAULT NULL::character varying, p_externalmessageid_clear boolean DEFAULT false, p_externalmessageid uuid DEFAULT NULL::uuid, p_receivedat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_isstarred boolean DEFAULT NULL::boolean, p_isimported boolean DEFAULT NULL::boolean, p_sourcechannel_clear boolean DEFAULT false, p_sourcechannel character varying DEFAULT NULL::character varying)
 RETURNS SETOF __mj_bizappssecuremessaging."vwSecureMessages"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj_bizappssecuremessaging."SecureMessage"
    SET
        "PortalSessionID" = COALESCE(p_portalsessionid, "PortalSessionID"),
        "ThreadID" = COALESCE(p_threadid, "ThreadID"),
        "PersonID" = CASE WHEN p_personid_clear = true THEN NULL ELSE COALESCE(p_personid, "PersonID") END,
        "Direction" = COALESCE(p_direction, "Direction"),
        "Sender" = COALESCE(p_sender, "Sender"),
        "Recipient" = COALESCE(p_recipient, "Recipient"),
        "Subject" = CASE WHEN p_subject_clear = true THEN NULL ELSE COALESCE(p_subject, "Subject") END,
        "Content" = COALESCE(p_content, "Content"),
        "IsSecure" = COALESCE(p_issecure, "IsSecure"),
        "Status" = COALESCE(p_status, "Status"),
        "ExternalMessageID" = CASE WHEN p_externalmessageid_clear = true THEN NULL ELSE COALESCE(p_externalmessageid, "ExternalMessageID") END,
        "ReceivedAt" = COALESCE(p_receivedat, "ReceivedAt"),
        "IsStarred" = COALESCE(p_isstarred, "IsStarred"),
        "IsImported" = COALESCE(p_isimported, "IsImported"),
        "SourceChannel" = CASE WHEN p_sourcechannel_clear = true THEN NULL ELSE COALESCE(p_sourcechannel, "SourceChannel") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj_bizappssecuremessaging."vwSecureMessages"
    WHERE "ID" = p_id;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spDeleteFileRequest).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spDeleteFileRequest"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj_bizappssecuremessaging."FileRequest"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spDeleteMessageFile).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spDeleteMessageFile"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj_bizappssecuremessaging."MessageFile"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spDeletePortalMagicLink).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spDeletePortalMagicLink"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj_bizappssecuremessaging."PortalMagicLink"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spDeletePortalSession).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spDeletePortalSession"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj_bizappssecuremessaging."PortalSession"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spDeleteSecureMessage).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spDeleteSecureMessage"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj_bizappssecuremessaging."SecureMessage"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spCreateSecureThread).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spCreateSecureThread"(p_id uuid DEFAULT NULL::uuid, p_contactid uuid DEFAULT NULL::uuid, p_subject character varying DEFAULT NULL::character varying, p_status character varying DEFAULT NULL::character varying, p_sourcechannel_clear boolean DEFAULT false, p_sourcechannel character varying DEFAULT NULL::character varying, p_createdbyuserid_clear boolean DEFAULT false, p_createdbyuserid uuid DEFAULT NULL::uuid, p_lastmessageat_clear boolean DEFAULT false, p_lastmessageat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_isdeleted boolean DEFAULT NULL::boolean)
 RETURNS SETOF __mj_bizappssecuremessaging."vwSecureThreads"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj_bizappssecuremessaging."SecureThread"
        (
            "ID",
            "ContactID",
                "Subject",
                "Status",
                "SourceChannel",
                "CreatedByUserID",
                "LastMessageAt",
                "IsDeleted"
        )
    VALUES
        (
            v_new_id,
            p_contactid,
                p_subject,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_sourcechannel_clear = true THEN NULL ELSE COALESCE(p_sourcechannel, NULL) END,
                CASE WHEN p_createdbyuserid_clear = true THEN NULL ELSE COALESCE(p_createdbyuserid, NULL) END,
                CASE WHEN p_lastmessageat_clear = true THEN NULL ELSE COALESCE(p_lastmessageat, NULL) END,
                COALESCE(p_isdeleted, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj_bizappssecuremessaging."vwSecureThreads"
    WHERE "ID" = v_new_id;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spUpdateSecureThread).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spUpdateSecureThread"(p_id uuid, p_contactid uuid DEFAULT NULL::uuid, p_subject character varying DEFAULT NULL::character varying, p_status character varying DEFAULT NULL::character varying, p_sourcechannel_clear boolean DEFAULT false, p_sourcechannel character varying DEFAULT NULL::character varying, p_createdbyuserid_clear boolean DEFAULT false, p_createdbyuserid uuid DEFAULT NULL::uuid, p_lastmessageat_clear boolean DEFAULT false, p_lastmessageat timestamp with time zone DEFAULT NULL::timestamp with time zone, p_isdeleted boolean DEFAULT NULL::boolean)
 RETURNS SETOF __mj_bizappssecuremessaging."vwSecureThreads"
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj_bizappssecuremessaging."SecureThread"
    SET
        "ContactID" = COALESCE(p_contactid, "ContactID"),
        "Subject" = COALESCE(p_subject, "Subject"),
        "Status" = COALESCE(p_status, "Status"),
        "SourceChannel" = CASE WHEN p_sourcechannel_clear = true THEN NULL ELSE COALESCE(p_sourcechannel, "SourceChannel") END,
        "CreatedByUserID" = CASE WHEN p_createdbyuserid_clear = true THEN NULL ELSE COALESCE(p_createdbyuserid, "CreatedByUserID") END,
        "LastMessageAt" = CASE WHEN p_lastmessageat_clear = true THEN NULL ELSE COALESCE(p_lastmessageat, "LastMessageAt") END,
        "IsDeleted" = COALESCE(p_isdeleted, "IsDeleted")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj_bizappssecuremessaging."vwSecureThreads"
    WHERE "ID" = p_id;
END;
$function$
;

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: procedure' marker for spDeleteSecureThread).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging."spDeleteSecureThread"(p_id uuid)
 RETURNS TABLE("ID" uuid)
 LANGUAGE plpgsql
AS $function$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj_bizappssecuremessaging."SecureThread"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$function$
;


-- ===================== Triggers =====================

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: trigger' marker for FileRequest).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging.fn_trg_update_file_request()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;
DROP TRIGGER IF EXISTS "trg_update_file_request" ON __mj_bizappssecuremessaging."FileRequest";
CREATE TRIGGER trg_update_file_request BEFORE UPDATE ON __mj_bizappssecuremessaging."FileRequest" FOR EACH ROW EXECUTE FUNCTION __mj_bizappssecuremessaging.fn_trg_update_file_request();

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: trigger' marker for MessageFile).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging.fn_trg_update_message_file()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;
DROP TRIGGER IF EXISTS "trg_update_message_file" ON __mj_bizappssecuremessaging."MessageFile";
CREATE TRIGGER trg_update_message_file BEFORE UPDATE ON __mj_bizappssecuremessaging."MessageFile" FOR EACH ROW EXECUTE FUNCTION __mj_bizappssecuremessaging.fn_trg_update_message_file();

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: trigger' marker for PortalMagicLink).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging.fn_trg_update_portal_magic_link()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;
DROP TRIGGER IF EXISTS "trg_update_portal_magic_link" ON __mj_bizappssecuremessaging."PortalMagicLink";
CREATE TRIGGER trg_update_portal_magic_link BEFORE UPDATE ON __mj_bizappssecuremessaging."PortalMagicLink" FOR EACH ROW EXECUTE FUNCTION __mj_bizappssecuremessaging.fn_trg_update_portal_magic_link();

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: trigger' marker for PortalSession).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging.fn_trg_update_portal_session()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;
DROP TRIGGER IF EXISTS "trg_update_portal_session" ON __mj_bizappssecuremessaging."PortalSession";
CREATE TRIGGER trg_update_portal_session BEFORE UPDATE ON __mj_bizappssecuremessaging."PortalSession" FOR EACH ROW EXECUTE FUNCTION __mj_bizappssecuremessaging.fn_trg_update_portal_session();

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: trigger' marker for SecureMessage).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging.fn_trg_update_secure_message()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;
DROP TRIGGER IF EXISTS "trg_update_secure_message" ON __mj_bizappssecuremessaging."SecureMessage";
CREATE TRIGGER trg_update_secure_message BEFORE UPDATE ON __mj_bizappssecuremessaging."SecureMessage" FOR EACH ROW EXECUTE FUNCTION __mj_bizappssecuremessaging.fn_trg_update_secure_message();

-- CodeGen PostgreSQL output baked in by scripts/pg-bake-codegen.mjs (replaces the
-- converter's '-- SKIPPED: trigger' marker for SecureThread).
CREATE OR REPLACE FUNCTION __mj_bizappssecuremessaging.fn_trg_update_secure_thread()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$function$
;
DROP TRIGGER IF EXISTS "trg_update_secure_thread" ON __mj_bizappssecuremessaging."SecureThread";
CREATE TRIGGER trg_update_secure_thread BEFORE UPDATE ON __mj_bizappssecuremessaging."SecureThread" FOR EACH ROW EXECUTE FUNCTION __mj_bizappssecuremessaging.fn_trg_update_secure_thread();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

INSERT INTO "${mjSchema}"."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI",
         "AllowCaching"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '1409049b-3e4a-4d8d-81ef-e70d9ce50a88',
         'MJ_BizApps_SecureMessaging: Secure Threads',
         'Secure Threads',
         'A first-class secure conversation (thread) between the organization and one external contact. Owns the subject, lifecycle status, and all messages/files/requests via FKs. The unit of the contact portal inbox; magic links deep-link into a thread.',
         NULL,
         'SecureThread',
         'vwSecureThreads',
         '__mj_bizappssecuremessaging',
         TRUE,
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );

/* SQL generated to create new application __mj_BizAppsSecureMessaging */

INSERT INTO "${mjSchema}"."Application" ("ID", "Name", "Description", "SchemaAutoAddNewEntities", "Path", "AutoUpdatePath")
                       VALUES ('bbdffcbb-996c-4e99-9edc-e95983088738', '__mj_bizappssecuremessaging', 'Generated for schema', '__mj_bizappssecuremessaging', 'mjbizappssecuremessaging', TRUE);

/* Adding role UI to application __mj_BizAppsSecureMessaging */

INSERT INTO "${mjSchema}"."ApplicationRole"
                                 ("ApplicationID", "RoleID", "CanAccess", "CanAdmin") VALUES
                                 ('bbdffcbb-996c-4e99-9edc-e95983088738', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE);

/* Adding role Developer to application __mj_BizAppsSecureMessaging */

INSERT INTO "${mjSchema}"."ApplicationRole"
                                 ("ApplicationID", "RoleID", "CanAccess", "CanAdmin") VALUES
                                 ('bbdffcbb-996c-4e99-9edc-e95983088738', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE);

/* Adding role Integration to application __mj_BizAppsSecureMessaging */

INSERT INTO "${mjSchema}"."ApplicationRole"
                                 ("ApplicationID", "RoleID", "CanAccess", "CanAdmin") VALUES
                                 ('bbdffcbb-996c-4e99-9edc-e95983088738', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE);

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Secure Threads to application ID: 'bbdffcbb-996c-4e99-9edc-e95983088738' */

INSERT INTO "${mjSchema}"."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('bbdffcbb-996c-4e99-9edc-e95983088738', '1409049b-3e4a-4d8d-81ef-e70d9ce50a88', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM "${mjSchema}"."ApplicationEntity" WHERE "ApplicationID" = 'bbdffcbb-996c-4e99-9edc-e95983088738'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Threads for role UI */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('1409049b-3e4a-4d8d-81ef-e70d9ce50a88', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Threads for role Developer */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('1409049b-3e4a-4d8d-81ef-e70d9ce50a88', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Threads for role Integration */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('1409049b-3e4a-4d8d-81ef-e70d9ce50a88', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ_BizApps_SecureMessaging: Portal Sessions */

INSERT INTO "${mjSchema}"."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI",
         "AllowCaching"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '8a83c1e4-f2cb-4daa-87b5-fa9573a2c1f9',
         'MJ_BizApps_SecureMessaging: Portal Sessions',
         'Portal Sessions',
         'A contact''s authenticated portal session. Sessions are per-contact: one active session grants access to all of that contact''s secure threads. Authenticated via a hashed opaque token with a sliding TTL; revocable by staff.',
         NULL,
         'PortalSession',
         'vwPortalSessions',
         '__mj_bizappssecuremessaging',
         TRUE,
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Portal Sessions to application ID: 'BBDFFCBB-996C-4E99-9EDC-E95983088738' */

INSERT INTO "${mjSchema}"."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('BBDFFCBB-996C-4E99-9EDC-E95983088738', '8a83c1e4-f2cb-4daa-87b5-fa9573a2c1f9', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM "${mjSchema}"."ApplicationEntity" WHERE "ApplicationID" = 'BBDFFCBB-996C-4E99-9EDC-E95983088738'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Sessions for role UI */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('8a83c1e4-f2cb-4daa-87b5-fa9573a2c1f9', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Sessions for role Developer */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('8a83c1e4-f2cb-4daa-87b5-fa9573a2c1f9', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Sessions for role Integration */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('8a83c1e4-f2cb-4daa-87b5-fa9573a2c1f9', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ_BizApps_SecureMessaging: Portal Magic Links */

INSERT INTO "${mjSchema}"."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI",
         "AllowCaching"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '2b2e8762-39b4-488d-953c-ba1169e774d1',
         'MJ_BizApps_SecureMessaging: Portal Magic Links',
         'Portal Magic Links',
         'Single-use magic links — the passwordless entry path. Short-lived (15 min default), redeems into a fresh session token, and may deep-link to a specific thread.',
         NULL,
         'PortalMagicLink',
         'vwPortalMagicLinks',
         '__mj_bizappssecuremessaging',
         TRUE,
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Portal Magic Links to application ID: 'BBDFFCBB-996C-4E99-9EDC-E95983088738' */

INSERT INTO "${mjSchema}"."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('BBDFFCBB-996C-4E99-9EDC-E95983088738', '2b2e8762-39b4-488d-953c-ba1169e774d1', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM "${mjSchema}"."ApplicationEntity" WHERE "ApplicationID" = 'BBDFFCBB-996C-4E99-9EDC-E95983088738'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Magic Links for role UI */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('2b2e8762-39b4-488d-953c-ba1169e774d1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Magic Links for role Developer */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('2b2e8762-39b4-488d-953c-ba1169e774d1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Portal Magic Links for role Integration */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('2b2e8762-39b4-488d-953c-ba1169e774d1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ_BizApps_SecureMessaging: Secure Messages */

INSERT INTO "${mjSchema}"."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI",
         "AllowCaching"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '95a23eed-0c13-4d65-965c-fd40c371c870',
         'MJ_BizApps_SecureMessaging: Secure Messages',
         'Secure Messages',
         'Self-contained secure message store. Each row is one inbound or outbound message in a thread. App-agnostic: does not require an external Channel Messages entity.',
         NULL,
         'SecureMessage',
         'vwSecureMessages',
         '__mj_bizappssecuremessaging',
         TRUE,
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Secure Messages to application ID: 'BBDFFCBB-996C-4E99-9EDC-E95983088738' */

INSERT INTO "${mjSchema}"."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('BBDFFCBB-996C-4E99-9EDC-E95983088738', '95a23eed-0c13-4d65-965c-fd40c371c870', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM "${mjSchema}"."ApplicationEntity" WHERE "ApplicationID" = 'BBDFFCBB-996C-4E99-9EDC-E95983088738'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Messages for role UI */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('95a23eed-0c13-4d65-965c-fd40c371c870', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Messages for role Developer */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('95a23eed-0c13-4d65-965c-fd40c371c870', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Secure Messages for role Integration */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('95a23eed-0c13-4d65-965c-fd40c371c870', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ_BizApps_SecureMessaging: Message Files */

INSERT INTO "${mjSchema}"."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI",
         "AllowCaching"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         'c08c5b36-fffd-455b-849e-9481c8e1286c',
         'MJ_BizApps_SecureMessaging: Message Files',
         'Message Files',
         'Links an uploaded file to a secure message. Bytes are stored in core MJ File Storage (MJ: Files) and wrapped as an MJ Artifact; this table holds references and display metadata only.',
         NULL,
         'MessageFile',
         'vwMessageFiles',
         '__mj_bizappssecuremessaging',
         TRUE,
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: Message Files to application ID: 'BBDFFCBB-996C-4E99-9EDC-E95983088738' */

INSERT INTO "${mjSchema}"."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('BBDFFCBB-996C-4E99-9EDC-E95983088738', 'c08c5b36-fffd-455b-849e-9481c8e1286c', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM "${mjSchema}"."ApplicationEntity" WHERE "ApplicationID" = 'BBDFFCBB-996C-4E99-9EDC-E95983088738'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Message Files for role UI */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c08c5b36-fffd-455b-849e-9481c8e1286c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Message Files for role Developer */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c08c5b36-fffd-455b-849e-9481c8e1286c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: Message Files for role Integration */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('c08c5b36-fffd-455b-849e-9481c8e1286c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to create new entity MJ_BizApps_SecureMessaging: File Requests */

INSERT INTO "${mjSchema}"."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI",
         "AllowCaching"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         '92b5fc8b-0f4c-47dc-b57d-5a56ff77fc27',
         'MJ_BizApps_SecureMessaging: File Requests',
         'File Requests',
         'A request from staff for the external contact to securely upload one or more files. Fulfilled by uploading files (stored as MessageFile rows) and setting Status to Fulfilled.',
         NULL,
         'FileRequest',
         'vwFileRequests',
         '__mj_bizappssecuremessaging',
         TRUE,
         TRUE,
         FALSE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );

/* SQL generated to add new entity MJ_BizApps_SecureMessaging: File Requests to application ID: 'BBDFFCBB-996C-4E99-9EDC-E95983088738' */

INSERT INTO "${mjSchema}"."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('BBDFFCBB-996C-4E99-9EDC-E95983088738', '92b5fc8b-0f4c-47dc-b57d-5a56ff77fc27', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM "${mjSchema}"."ApplicationEntity" WHERE "ApplicationID" = 'BBDFFCBB-996C-4E99-9EDC-E95983088738'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: File Requests for role UI */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('92b5fc8b-0f4c-47dc-b57d-5a56ff77fc27', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: File Requests for role Developer */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('92b5fc8b-0f4c-47dc-b57d-5a56ff77fc27', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ_BizApps_SecureMessaging: File Requests for role Integration */

INSERT INTO "${mjSchema}"."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('92b5fc8b-0f4c-47dc-b57d-5a56ff77fc27', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL text to update existing entities from schema */

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging."FileRequest" */
UPDATE __mj_BizAppsSecureMessaging."FileRequest" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging.FileRequest */
ALTER TABLE __mj_BizAppsSecureMessaging."FileRequest" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsSecureMessaging."FileRequest"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging."FileRequest" */
UPDATE __mj_BizAppsSecureMessaging."FileRequest" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging.FileRequest */
ALTER TABLE __mj_BizAppsSecureMessaging."FileRequest" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsSecureMessaging."FileRequest"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging."MessageFile" */
UPDATE __mj_BizAppsSecureMessaging."MessageFile" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging.MessageFile */
ALTER TABLE __mj_BizAppsSecureMessaging."MessageFile" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsSecureMessaging."MessageFile"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging."MessageFile" */
UPDATE __mj_BizAppsSecureMessaging."MessageFile" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging.MessageFile */
ALTER TABLE __mj_BizAppsSecureMessaging."MessageFile" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsSecureMessaging."MessageFile"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging."PortalMagicLink" */
UPDATE __mj_BizAppsSecureMessaging."PortalMagicLink" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging.PortalMagicLink */
ALTER TABLE __mj_BizAppsSecureMessaging."PortalMagicLink" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsSecureMessaging."PortalMagicLink"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging."PortalMagicLink" */
UPDATE __mj_BizAppsSecureMessaging."PortalMagicLink" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging.PortalMagicLink */
ALTER TABLE __mj_BizAppsSecureMessaging."PortalMagicLink" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsSecureMessaging."PortalMagicLink"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging."SecureThread" */
UPDATE __mj_BizAppsSecureMessaging."SecureThread" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging.SecureThread */
ALTER TABLE __mj_BizAppsSecureMessaging."SecureThread" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsSecureMessaging."SecureThread"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging."SecureThread" */
UPDATE __mj_BizAppsSecureMessaging."SecureThread" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging.SecureThread */
ALTER TABLE __mj_BizAppsSecureMessaging."SecureThread" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsSecureMessaging."SecureThread"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging."PortalSession" */
UPDATE __mj_BizAppsSecureMessaging."PortalSession" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging.PortalSession */
ALTER TABLE __mj_BizAppsSecureMessaging."PortalSession" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsSecureMessaging."PortalSession"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging."PortalSession" */
UPDATE __mj_BizAppsSecureMessaging."PortalSession" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging.PortalSession */
ALTER TABLE __mj_BizAppsSecureMessaging."PortalSession" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsSecureMessaging."PortalSession"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging."SecureMessage" */
UPDATE __mj_BizAppsSecureMessaging."SecureMessage" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj_BizAppsSecureMessaging.SecureMessage */
ALTER TABLE __mj_BizAppsSecureMessaging."SecureMessage" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsSecureMessaging."SecureMessage"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging."SecureMessage" */
UPDATE __mj_BizAppsSecureMessaging."SecureMessage" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj_BizAppsSecureMessaging.SecureMessage */
ALTER TABLE __mj_BizAppsSecureMessaging."SecureMessage" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj_BizAppsSecureMessaging."SecureMessage"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd84af2eb-ea4e-41de-8b37-ce60aaccaceb' OR ("EntityID" = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND "Name" = 'ID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd84af2eb-ea4e-41de-8b37-ce60aaccaceb',
        '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- "Entity": "MJ_BizApps_SecureMessaging": "File" "Requests"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '038cd3c8-da08-4afb-aadd-94d9b504eec8' OR ("EntityID" = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND "Name" = 'PortalSessionID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '038cd3c8-da08-4afb-aadd-94d9b504eec8',
        '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- "Entity": "MJ_BizApps_SecureMessaging": "File" "Requests"
        100002,
        'PortalSessionID',
        'Portal Session ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '2c50079f-76d5-4dac-b9f3-42e4bedef662' OR ("EntityID" = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND "Name" = 'ThreadID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '2c50079f-76d5-4dac-b9f3-42e4bedef662',
        '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- "Entity": "MJ_BizApps_SecureMessaging": "File" "Requests"
        100003,
        'ThreadID',
        'Thread ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '7b6d1385-4061-45ed-b0c3-a4e442f9ff0c' OR ("EntityID" = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND "Name" = 'Title')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '7b6d1385-4061-45ed-b0c3-a4e442f9ff0c',
        '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- "Entity": "MJ_BizApps_SecureMessaging": "File" "Requests"
        100004,
        'Title',
        'Title',
        NULL,
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'c9bac686-4990-4a3b-9e7e-f46a651ad2e9' OR ("EntityID" = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND "Name" = 'Instructions')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'c9bac686-4990-4a3b-9e7e-f46a651ad2e9',
        '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- "Entity": "MJ_BizApps_SecureMessaging": "File" "Requests"
        100005,
        'Instructions',
        'Instructions',
        NULL,
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '2680a27e-5bbf-46bc-a9f9-46ef4ecc815e' OR ("EntityID" = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND "Name" = 'Status')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '2680a27e-5bbf-46bc-a9f9-46ef4ecc815e',
        '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- "Entity": "MJ_BizApps_SecureMessaging": "File" "Requests"
        100006,
        'Status',
        'Status',
        'Request lifecycle status: Pending (awaiting the contact), Fulfilled (files uploaded and the contact marked it complete), Cancelled (staff closed it out), or Expired (the DueAt deadline passed while still Pending). Only Pending requests appear as action callouts in the portal; terminal states collapse into thread history.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Pending',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'fc0658e7-f0b2-43c4-a314-480cbf5a5e0a' OR ("EntityID" = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND "Name" = 'RequestedByUserID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'fc0658e7-f0b2-43c4-a314-480cbf5a5e0a',
        '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- "Entity": "MJ_BizApps_SecureMessaging": "File" "Requests"
        100007,
        'RequestedByUserID',
        'Requested By User ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '3cd18e90-f0e5-4ee0-a9a4-eab158588dbd' OR ("EntityID" = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND "Name" = 'DueAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '3cd18e90-f0e5-4ee0-a9a4-eab158588dbd',
        '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- "Entity": "MJ_BizApps_SecureMessaging": "File" "Requests"
        100008,
        'DueAt',
        'Due At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd9a6184f-5072-41eb-9410-dfa5111252dc' OR ("EntityID" = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND "Name" = 'FulfilledAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd9a6184f-5072-41eb-9410-dfa5111252dc',
        '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- "Entity": "MJ_BizApps_SecureMessaging": "File" "Requests"
        100009,
        'FulfilledAt',
        'Fulfilled At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '84812652-6bd1-4de7-b871-602c036cec42' OR ("EntityID" = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '84812652-6bd1-4de7-b871-602c036cec42',
        '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- "Entity": "MJ_BizApps_SecureMessaging": "File" "Requests"
        100010,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '20430bfb-17d5-411c-85a9-4307316dca80' OR ("EntityID" = '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '20430bfb-17d5-411c-85a9-4307316dca80',
        '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', -- "Entity": "MJ_BizApps_SecureMessaging": "File" "Requests"
        100011,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '0dbd9aab-b892-4a5f-a870-0d9a4b75b04a' OR ("EntityID" = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND "Name" = 'ID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '0dbd9aab-b892-4a5f-a870-0d9a4b75b04a',
        'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- "Entity": "MJ_BizApps_SecureMessaging": "Message" "Files"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'fe794373-413d-4016-8877-10905ef9bfef' OR ("EntityID" = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND "Name" = 'SecureMessageID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'fe794373-413d-4016-8877-10905ef9bfef',
        'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- "Entity": "MJ_BizApps_SecureMessaging": "Message" "Files"
        100002,
        'SecureMessageID',
        'Secure Message ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '95A23EED-0C13-4D65-965C-FD40C371C870',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '35fe759e-89b1-4e32-83a4-c44627916e40' OR ("EntityID" = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND "Name" = 'ExternalMessageID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '35fe759e-89b1-4e32-83a4-c44627916e40',
        'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- "Entity": "MJ_BizApps_SecureMessaging": "Message" "Files"
        100003,
        'ExternalMessageID',
        'External Message ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '23302f51-b78b-4895-bb47-c72de4ea3e21' OR ("EntityID" = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND "Name" = 'ThreadID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '23302f51-b78b-4895-bb47-c72de4ea3e21',
        'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- "Entity": "MJ_BizApps_SecureMessaging": "Message" "Files"
        100004,
        'ThreadID',
        'Thread ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '65ad537f-fe26-45c4-af60-308976df9075' OR ("EntityID" = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND "Name" = 'ArtifactID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '65ad537f-fe26-45c4-af60-308976df9075',
        'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- "Entity": "MJ_BizApps_SecureMessaging": "Message" "Files"
        100005,
        'ArtifactID',
        'Artifact ID',
        'Soft reference to MJ: Artifacts.ID wrapping the uploaded file.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '5de45282-d290-4891-be51-8089a1431b51' OR ("EntityID" = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND "Name" = 'FileID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '5de45282-d290-4891-be51-8089a1431b51',
        'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- "Entity": "MJ_BizApps_SecureMessaging": "Message" "Files"
        100006,
        'FileID',
        'File ID',
        'Soft reference to MJ: Files.ID holding the bytes in the configured storage provider.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '49972105-de2f-4b46-abed-4bdcc526cb7b' OR ("EntityID" = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND "Name" = 'Filename')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '49972105-de2f-4b46-abed-4bdcc526cb7b',
        'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- "Entity": "MJ_BizApps_SecureMessaging": "Message" "Files"
        100007,
        'Filename',
        'Filename',
        NULL,
        'TEXT',
        1000,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '31c0011e-79b2-49c6-a57d-df86d54c327c' OR ("EntityID" = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND "Name" = 'ContentType')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '31c0011e-79b2-49c6-a57d-df86d54c327c',
        'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- "Entity": "MJ_BizApps_SecureMessaging": "Message" "Files"
        100008,
        'ContentType',
        'Content Type',
        NULL,
        'TEXT',
        510,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '0caaa67e-afd2-4341-ab92-635c550cdb77' OR ("EntityID" = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND "Name" = 'Size')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '0caaa67e-afd2-4341-ab92-635c550cdb77',
        'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- "Entity": "MJ_BizApps_SecureMessaging": "Message" "Files"
        100009,
        'Size',
        'Size',
        NULL,
        'bigint',
        8,
        19,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd97c178f-6dab-4464-a6b1-b961cb77b32d' OR ("EntityID" = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd97c178f-6dab-4464-a6b1-b961cb77b32d',
        'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- "Entity": "MJ_BizApps_SecureMessaging": "Message" "Files"
        100010,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'f2ee3fc9-cc73-4ed8-bad7-2da240a84cba' OR ("EntityID" = 'C08C5B36-FFFD-455B-849E-9481C8E1286C' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'f2ee3fc9-cc73-4ed8-bad7-2da240a84cba',
        'C08C5B36-FFFD-455B-849E-9481C8E1286C', -- "Entity": "MJ_BizApps_SecureMessaging": "Message" "Files"
        100011,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '90549dab-9b9b-4609-b718-e5bb7ac2b62b' OR ("EntityID" = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND "Name" = 'ID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '90549dab-9b9b-4609-b718-e5bb7ac2b62b',
        '2B2E8762-39B4-488D-953C-BA1169E774D1', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Magic" "Links"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '03803e37-f1d3-4856-bb18-ea70f545479a' OR ("EntityID" = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND "Name" = 'PortalSessionID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '03803e37-f1d3-4856-bb18-ea70f545479a',
        '2B2E8762-39B4-488D-953C-BA1169E774D1', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Magic" "Links"
        100002,
        'PortalSessionID',
        'Portal Session ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '337dab0a-ff7f-4c7b-9a6d-7c3b521f2340' OR ("EntityID" = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND "Name" = 'TokenHash')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '337dab0a-ff7f-4c7b-9a6d-7c3b521f2340',
        '2B2E8762-39B4-488D-953C-BA1169E774D1', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Magic" "Links"
        100003,
        'TokenHash',
        'Token Hash',
        'SHA-256 hash of the magic link token (sm_ml_ prefix). Raw token is never stored.',
        'TEXT',
        256,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '42885a4a-1b1f-4984-819d-b6a17a9992e3' OR ("EntityID" = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND "Name" = 'Status')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '42885a4a-1b1f-4984-819d-b6a17a9992e3',
        '2B2E8762-39B4-488D-953C-BA1169E774D1', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Magic" "Links"
        100004,
        'Status',
        'Status',
        'Magic link lifecycle status: Pending, Used, or Expired',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Pending',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd88e34ba-df5a-480d-b74e-267dda1354bc' OR ("EntityID" = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND "Name" = 'ExpiresAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd88e34ba-df5a-480d-b74e-267dda1354bc',
        '2B2E8762-39B4-488D-953C-BA1169E774D1', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Magic" "Links"
        100005,
        'ExpiresAt',
        'Expires At',
        'When the magic link expires. Default is 15 minutes from creation.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '970b7879-9daa-4b3d-8abd-7eea89810262' OR ("EntityID" = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND "Name" = 'UsedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '970b7879-9daa-4b3d-8abd-7eea89810262',
        '2B2E8762-39B4-488D-953C-BA1169E774D1', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Magic" "Links"
        100006,
        'UsedAt',
        'Used At',
        'Timestamp when the magic link was redeemed. NULL if not yet used.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '9b5a4416-2692-4a3d-b574-d045fb97892f' OR ("EntityID" = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND "Name" = 'DeepLinkThreadID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '9b5a4416-2692-4a3d-b574-d045fb97892f',
        '2B2E8762-39B4-488D-953C-BA1169E774D1', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Magic" "Links"
        100007,
        'DeepLinkThreadID',
        'Deep Link Thread ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'b438f8e9-4399-4215-9f93-fba4a00fc56a' OR ("EntityID" = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'b438f8e9-4399-4215-9f93-fba4a00fc56a',
        '2B2E8762-39B4-488D-953C-BA1169E774D1', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Magic" "Links"
        100008,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'b9f9976c-3b78-490d-8560-227025ff25d5' OR ("EntityID" = '2B2E8762-39B4-488D-953C-BA1169E774D1' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'b9f9976c-3b78-490d-8560-227025ff25d5',
        '2B2E8762-39B4-488D-953C-BA1169E774D1', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Magic" "Links"
        100009,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'a9a304d9-668c-476e-bc03-1d4b4ccf5784' OR ("EntityID" = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND "Name" = 'ID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'a9a304d9-668c-476e-bc03-1d4b4ccf5784',
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Threads"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '8049b248-c54e-447b-a087-7477035e0fbc' OR ("EntityID" = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND "Name" = 'ContactID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '8049b248-c54e-447b-a087-7477035e0fbc',
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Threads"
        100002,
        'ContactID',
        'Contact ID',
        'Soft reference to the external contact (MJ_BizApps_Common.Person.ID). Not a hard FK so the schema stays standalone.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'eef2d72a-e9bb-4a93-b7c7-55495ca0b786' OR ("EntityID" = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND "Name" = 'Subject')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'eef2d72a-e9bb-4a93-b7c7-55495ca0b786',
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Threads"
        100003,
        'Subject',
        'Subject',
        'The conversation subject line (TitanFile-channel style), set by staff at compose or derived at promotion.',
        'TEXT',
        1000,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '8b8422a2-c239-478f-8f6a-baa36c756e48' OR ("EntityID" = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND "Name" = 'Status')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '8b8422a2-c239-478f-8f6a-baa36c756e48',
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Threads"
        100004,
        'Status',
        'Status',
        'Thread lifecycle: Active (open), Closed (contact-visible read-only), Archived (hidden from default lists). Contact-visible, unlike the old session-level archive flags.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Active',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'dcc13fd2-8193-4ab7-8acb-df6145afa307' OR ("EntityID" = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND "Name" = 'SourceChannel')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'dcc13fd2-8193-4ab7-8acb-df6145afa307',
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Threads"
        100005,
        'SourceChannel',
        'Source Channel',
        'NULL for threads that originated natively in the secure channel; the insecure channel name (e.g. Email, SMS) for threads created by promotion (PRD §9 bridges).',
        'TEXT',
        100,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '111d2164-5b9b-4e57-9fd9-2f4c2cc9c997' OR ("EntityID" = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND "Name" = 'CreatedByUserID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '111d2164-5b9b-4e57-9fd9-2f4c2cc9c997',
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Threads"
        100006,
        'CreatedByUserID',
        'Created By User ID',
        'Soft reference to the MJ user (staff) who created the thread; NULL for promoted/backfilled threads. Not a hard FK so the schema stays standalone.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '7bdf1478-bff1-4e6d-b0bf-b859b9db3f0b' OR ("EntityID" = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND "Name" = 'LastMessageAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '7bdf1478-bff1-4e6d-b0bf-b859b9db3f0b',
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Threads"
        100007,
        'LastMessageAt',
        'Last Message At',
        'Timestamp of the most recent message in the thread (denormalized for inbox ordering).',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '6d103051-5a1d-4203-b6a1-021cd4bff60f' OR ("EntityID" = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND "Name" = 'IsDeleted')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '6d103051-5a1d-4203-b6a1-021cd4bff60f',
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Threads"
        100008,
        'IsDeleted',
        'Is Deleted',
        'Soft delete (staff Trash). Records are never hard-deleted — compliance/audit.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'ace2d094-77c9-4ce1-833d-cc88c1179fcd' OR ("EntityID" = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'ace2d094-77c9-4ce1-833d-cc88c1179fcd',
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Threads"
        100009,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'f6b95a05-922a-4581-8588-cbc14bbf1481' OR ("EntityID" = '1409049B-3E4A-4D8D-81EF-E70D9CE50A88' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'f6b95a05-922a-4581-8588-cbc14bbf1481',
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Threads"
        100010,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '03964bfd-d587-404f-971a-831f08f76aa1' OR ("EntityID" = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND "Name" = 'ID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '03964bfd-d587-404f-971a-831f08f76aa1',
        '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Sessions"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '633aa7f0-dc5b-4f83-90fa-e0cccda592cc' OR ("EntityID" = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND "Name" = 'ContactID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '633aa7f0-dc5b-4f83-90fa-e0cccda592cc',
        '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Sessions"
        100002,
        'ContactID',
        'Contact ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '87293581-d7db-4493-bf50-f102ebe300d7' OR ("EntityID" = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND "Name" = 'TokenHash')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '87293581-d7db-4493-bf50-f102ebe300d7',
        '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Sessions"
        100003,
        'TokenHash',
        'Token Hash',
        'SHA-256 hash of the opaque session token (sm_ prefix). Raw token is never stored.',
        'TEXT',
        256,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '14bf5536-3c24-4264-912b-bce7b6d83901' OR ("EntityID" = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND "Name" = 'Status')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '14bf5536-3c24-4264-912b-bce7b6d83901',
        '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Sessions"
        100004,
        'Status',
        'Status',
        'Session lifecycle status: Active, Expired, or Revoked',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Active',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '45ff9a5b-71c5-4748-8e0b-8fb44ef9cad5' OR ("EntityID" = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND "Name" = 'ExpiresAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '45ff9a5b-71c5-4748-8e0b-8fb44ef9cad5',
        '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Sessions"
        100005,
        'ExpiresAt',
        'Expires At',
        'When the session token expires. Default TTL is 7 days, extended on each access.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '44c890b9-386a-45e2-87b9-7ee69e4cbedb' OR ("EntityID" = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND "Name" = 'LastAccessedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '44c890b9-386a-45e2-87b9-7ee69e4cbedb',
        '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Sessions"
        100006,
        'LastAccessedAt',
        'Last Accessed At',
        'Last time the session was accessed. Used for session extension and cleanup.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '18c5c4d8-a3c7-49c2-b570-7a79257ca1b0' OR ("EntityID" = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '18c5c4d8-a3c7-49c2-b570-7a79257ca1b0',
        '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Sessions"
        100007,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'a057ba3c-e00e-497c-b5e9-91ba28f71077' OR ("EntityID" = '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'a057ba3c-e00e-497c-b5e9-91ba28f71077',
        '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', -- "Entity": "MJ_BizApps_SecureMessaging": "Portal" "Sessions"
        100008,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '513651e9-54aa-4f8c-988b-9b6ad6798f3a' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'ID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '513651e9-54aa-4f8c-988b-9b6ad6798f3a',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '2b977d39-66a2-4f97-b918-1465195f43cf' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'PortalSessionID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '2b977d39-66a2-4f97-b918-1465195f43cf',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100002,
        'PortalSessionID',
        'Portal Session ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '592ddffb-9926-47b5-85bd-bab4cfc39a1c' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'ThreadID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '592ddffb-9926-47b5-85bd-bab4cfc39a1c',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100003,
        'ThreadID',
        'Thread ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '1409049B-3E4A-4D8D-81EF-E70D9CE50A88',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '56e6c5c0-48b3-43fb-aa30-ec657a4cb7e5' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'PersonID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '56e6c5c0-48b3-43fb-aa30-ec657a4cb7e5',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100004,
        'PersonID',
        'Person ID',
        'Soft reference to the person (e.g. MJ_BizApps_Common.People.ID). Not a hard FK so the schema stays standalone.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'c47729be-ed8f-4bd6-bde0-9ee08ee65c4e' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'Direction')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'c47729be-ed8f-4bd6-bde0-9ee08ee65c4e',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100005,
        'Direction',
        'Direction',
        'Direction of the message relative to the organization: Inbound (from contact) or Outbound (reply to contact).',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Inbound',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '4f4dd79e-b9f6-4e22-9155-c7abe8c1b18d' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'Sender')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '4f4dd79e-b9f6-4e22-9155-c7abe8c1b18d',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100006,
        'Sender',
        'Sender',
        NULL,
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '09bc3f32-9b8e-4498-a689-b8593b67066d' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'Recipient')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '09bc3f32-9b8e-4498-a689-b8593b67066d',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100007,
        'Recipient',
        'Recipient',
        NULL,
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '02614f66-f942-45bd-964f-13f31eda3577' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'Subject')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '02614f66-f942-45bd-964f-13f31eda3577',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100008,
        'Subject',
        'Subject',
        NULL,
        'TEXT',
        510,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'bb897f01-29e0-45a3-8d04-98718e809dea' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'Content')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'bb897f01-29e0-45a3-8d04-98718e809dea',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100009,
        'Content',
        'Content',
        NULL,
        'TEXT',
        -1,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'd101fb7c-780a-4cc0-986e-5656c650333b' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'IsSecure')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd101fb7c-780a-4cc0-986e-5656c650333b',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100010,
        'IsSecure',
        'Is Secure',
        NULL,
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'b26c0dfc-3cc7-46fb-bfdd-842e0929b978' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'Status')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'b26c0dfc-3cc7-46fb-bfdd-842e0929b978',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100011,
        'Status',
        'Status',
        NULL,
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'New',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '1ecc4378-5d0a-4da3-98fa-9daeea12204b' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'ExternalMessageID')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '1ecc4378-5d0a-4da3-98fa-9daeea12204b',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100012,
        'ExternalMessageID',
        'External Message ID',
        'When the Channel Messages adapter is active, holds the mirrored Channel Message ID so the AI pipeline can process the message. NULL in the self-contained path.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '91aafabe-9a87-4b90-ac41-ddb26fd49b79' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'ReceivedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '91aafabe-9a87-4b90-ac41-ddb26fd49b79',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100013,
        'ReceivedAt',
        'Received At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '8c53d93b-0775-4c15-9e72-226e07d06e2c' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'IsStarred')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '8c53d93b-0775-4c15-9e72-226e07d06e2c',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100014,
        'IsStarred',
        'Is Starred',
        'When 1, this message is starred/flagged by staff for quick retrieval (shown under the Starred category). Per-message, staff-toggled.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '060aeccd-baa3-4bc8-829e-cb28eab6e954' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'IsImported')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '060aeccd-baa3-4bc8-829e-cb28eab6e954',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100015,
        'IsImported',
        'Is Imported',
        'When 1, this message was imported (copied) into the secure thread during a promotion/bridge from an insecure channel, rather than originating natively in the secure channel. Imported messages predate the switch to secure.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'a537df35-8388-4fde-ad19-f429a07c2436' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = 'SourceChannel')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'a537df35-8388-4fde-ad19-f429a07c2436',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100016,
        'SourceChannel',
        'Source Channel',
        'For imported messages, the insecure channel the message originated from (e.g. Email, SMS). NULL for messages that originated natively in the secure channel.',
        'TEXT',
        100,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = 'e3d22297-0531-4289-a88e-31a792e5ba86' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e3d22297-0531-4289-a88e-31a792e5ba86',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100017,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityField" WHERE "ID" = '384ac274-3cfc-4d13-908e-b63674385e68' OR ("EntityID" = '95A23EED-0C13-4D65-965C-FD40C371C870' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO "${mjSchema}"."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '384ac274-3cfc-4d13-908e-b63674385e68',
        '95A23EED-0C13-4D65-965C-FD40C371C870', -- "Entity": "MJ_BizApps_SecureMessaging": "Secure" "Messages"
        100018,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('760f855c-384b-43eb-853c-3d54cf7e3355', '8B8422A2-C239-478F-8F6A-BAA36C756E48', 1, 'Active', 'Active', NOW(), NOW());

/* SQL text to insert entity field value with ID ea44228c-f32f-4c73-ad23-b25039f6dad2 */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ea44228c-f32f-4c73-ad23-b25039f6dad2', '8B8422A2-C239-478F-8F6A-BAA36C756E48', 2, 'Archived', 'Archived', NOW(), NOW());

/* SQL text to insert entity field value with ID 6bd44d71-f434-412f-93e7-2408984b6dbb */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('6bd44d71-f434-412f-93e7-2408984b6dbb', '8B8422A2-C239-478F-8F6A-BAA36C756E48', 3, 'Closed', 'Closed', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 8B8422A2-C239-478F-8F6A-BAA36C756E48 */

UPDATE "${mjSchema}"."EntityField" SET "ValueListType"='List' WHERE "ID"='8B8422A2-C239-478F-8F6A-BAA36C756E48';

/* SQL text to insert entity field value with ID 682dccc2-1517-49ad-950e-4c9a67c863df */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('682dccc2-1517-49ad-950e-4c9a67c863df', '14BF5536-3C24-4264-912B-BCE7B6D83901', 1, 'Active', 'Active', NOW(), NOW());

/* SQL text to insert entity field value with ID bd81339b-2508-4183-b385-efd955213186 */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('bd81339b-2508-4183-b385-efd955213186', '14BF5536-3C24-4264-912B-BCE7B6D83901', 2, 'Expired', 'Expired', NOW(), NOW());

/* SQL text to insert entity field value with ID c2eb92c5-7935-4548-807b-691fb30f43f4 */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('c2eb92c5-7935-4548-807b-691fb30f43f4', '14BF5536-3C24-4264-912B-BCE7B6D83901', 3, 'Revoked', 'Revoked', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 14BF5536-3C24-4264-912B-BCE7B6D83901 */

UPDATE "${mjSchema}"."EntityField" SET "ValueListType"='List' WHERE "ID"='14BF5536-3C24-4264-912B-BCE7B6D83901';

/* SQL text to insert entity field value with ID 83664457-9c35-40c4-9259-b22d781f0f0c */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('83664457-9c35-40c4-9259-b22d781f0f0c', '42885A4A-1B1F-4984-819D-B6A17A9992E3', 1, 'Expired', 'Expired', NOW(), NOW());

/* SQL text to insert entity field value with ID eed63ee9-fb0c-4588-8c6a-a51807ae3ae9 */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('eed63ee9-fb0c-4588-8c6a-a51807ae3ae9', '42885A4A-1B1F-4984-819D-B6A17A9992E3', 2, 'Pending', 'Pending', NOW(), NOW());

/* SQL text to insert entity field value with ID 9bf295bc-127f-4d84-84f9-27c38cf6215e */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('9bf295bc-127f-4d84-84f9-27c38cf6215e', '42885A4A-1B1F-4984-819D-B6A17A9992E3', 3, 'Used', 'Used', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 42885A4A-1B1F-4984-819D-B6A17A9992E3 */

UPDATE "${mjSchema}"."EntityField" SET "ValueListType"='List' WHERE "ID"='42885A4A-1B1F-4984-819D-B6A17A9992E3';

/* SQL text to insert entity field value with ID e067ce56-a288-4f95-97f0-a143d0ada96a */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e067ce56-a288-4f95-97f0-a143d0ada96a', 'C47729BE-ED8F-4BD6-BDE0-9EE08EE65C4E', 1, 'Inbound', 'Inbound', NOW(), NOW());

/* SQL text to insert entity field value with ID 57678279-1e9b-4b16-91f9-2bc37d802e15 */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('57678279-1e9b-4b16-91f9-2bc37d802e15', 'C47729BE-ED8F-4BD6-BDE0-9EE08EE65C4E', 2, 'Outbound', 'Outbound', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID C47729BE-ED8F-4BD6-BDE0-9EE08EE65C4E */

UPDATE "${mjSchema}"."EntityField" SET "ValueListType"='List' WHERE "ID"='C47729BE-ED8F-4BD6-BDE0-9EE08EE65C4E';

/* SQL text to insert entity field value with ID abbd2f1a-bdd1-4e0e-8888-923b41845014 */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('abbd2f1a-bdd1-4e0e-8888-923b41845014', 'B26C0DFC-3CC7-46FB-BFDD-842E0929B978', 1, 'Failed', 'Failed', NOW(), NOW());

/* SQL text to insert entity field value with ID 7046af48-b372-4dcf-b15b-5b78bb0ea39f */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('7046af48-b372-4dcf-b15b-5b78bb0ea39f', 'B26C0DFC-3CC7-46FB-BFDD-842E0929B978', 2, 'New', 'New', NOW(), NOW());

/* SQL text to insert entity field value with ID 17a2fc1f-2a8a-4d26-b1d6-0bc680946b20 */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('17a2fc1f-2a8a-4d26-b1d6-0bc680946b20', 'B26C0DFC-3CC7-46FB-BFDD-842E0929B978', 3, 'Read', 'Read', NOW(), NOW());

/* SQL text to insert entity field value with ID 7cda5eca-07e0-48ee-bab2-81caffba53d1 */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('7cda5eca-07e0-48ee-bab2-81caffba53d1', 'B26C0DFC-3CC7-46FB-BFDD-842E0929B978', 4, 'Replied', 'Replied', NOW(), NOW());

/* SQL text to insert entity field value with ID 8c88ea9a-2fa0-4b53-88c5-206dd70b1af9 */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('8c88ea9a-2fa0-4b53-88c5-206dd70b1af9', 'B26C0DFC-3CC7-46FB-BFDD-842E0929B978', 5, 'Sent', 'Sent', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID B26C0DFC-3CC7-46FB-BFDD-842E0929B978 */

UPDATE "${mjSchema}"."EntityField" SET "ValueListType"='List' WHERE "ID"='B26C0DFC-3CC7-46FB-BFDD-842E0929B978';

/* SQL text to insert entity field value with ID 85f9c6b8-ffe8-474e-afb0-2427ee02e119 */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('85f9c6b8-ffe8-474e-afb0-2427ee02e119', '2680A27E-5BBF-46BC-A9F9-46EF4ECC815E', 1, 'Cancelled', 'Cancelled', NOW(), NOW());

/* SQL text to insert entity field value with ID 58ed5b6a-100c-490c-aa38-0f7ade9792e3 */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('58ed5b6a-100c-490c-aa38-0f7ade9792e3', '2680A27E-5BBF-46BC-A9F9-46EF4ECC815E', 2, 'Expired', 'Expired', NOW(), NOW());

/* SQL text to insert entity field value with ID d15d4ad6-8744-4fa4-9861-f2348e6cf6ed */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d15d4ad6-8744-4fa4-9861-f2348e6cf6ed', '2680A27E-5BBF-46BC-A9F9-46EF4ECC815E', 3, 'Fulfilled', 'Fulfilled', NOW(), NOW());

/* SQL text to insert entity field value with ID e2dd19f5-a531-4aa0-888f-eccc3e2bb431 */

INSERT INTO "${mjSchema}"."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('e2dd19f5-a531-4aa0-888f-eccc3e2bb431', '2680A27E-5BBF-46BC-A9F9-46EF4ECC815E', 4, 'Pending', 'Pending', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 2680A27E-5BBF-46BC-A9F9-46EF4ECC815E */

UPDATE "${mjSchema}"."EntityField" SET "ValueListType"='List' WHERE "ID"='2680A27E-5BBF-46BC-A9F9-46EF4ECC815E';


/* Create Entity Relationship: MJ_BizApps_SecureMessaging: Secure Threads -> MJ_BizApps_SecureMessaging: File Requests (One To Many via ThreadID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = 'a2e039a5-d192-433d-b9bd-ced54d36a8d4'
    ) THEN
        INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('a2e039a5-d192-433d-b9bd-ced54d36a8d4', '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', 'ThreadID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = 'e64e58e2-81ca-4a75-b04f-af9c32b41f3f'
    ) THEN
        INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('e64e58e2-81ca-4a75-b04f-af9c32b41f3f', '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', '95A23EED-0C13-4D65-965C-FD40C371C870', 'ThreadID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '55b78ead-60f4-454a-93c4-927a683d09b7'
    ) THEN
        INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('55b78ead-60f4-454a-93c4-927a683d09b7', '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', 'C08C5B36-FFFD-455B-849E-9481C8E1286C', 'ThreadID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '2a57f3ce-237e-48bf-a7cd-44671634af1f'
    ) THEN
        INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('2a57f3ce-237e-48bf-a7cd-44671634af1f', '1409049B-3E4A-4D8D-81EF-E70D9CE50A88', '2B2E8762-39B4-488D-953C-BA1169E774D1', 'DeepLinkThreadID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = 'bd6210a8-40c3-4eab-afd0-dc3649085c0f'
    ) THEN
        INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('bd6210a8-40c3-4eab-afd0-dc3649085c0f', '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', '2B2E8762-39B4-488D-953C-BA1169E774D1', 'PortalSessionID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = '0849973d-cffd-439d-ba14-54cb43336d79'
    ) THEN
        INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('0849973d-cffd-439d-ba14-54cb43336d79', '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', '92B5FC8B-0F4C-47DC-B57D-5A56FF77FC27', 'PortalSessionID', 'One To Many', TRUE, TRUE, 2, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = 'a31a7f3f-4139-4e29-9ae3-9839383b23ca'
    ) THEN
        INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('a31a7f3f-4139-4e29-9ae3-9839383b23ca', '8A83C1E4-F2CB-4DAA-87B5-FA9573A2C1F9', '95A23EED-0C13-4D65-965C-FD40C371C870', 'PortalSessionID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "${mjSchema}"."EntityRelationship" WHERE "ID" = 'f57f3926-3924-4194-a09b-710e9e98dc97'
    ) THEN
        INSERT INTO "${mjSchema}"."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f57f3926-3924-4194-a09b-710e9e98dc97', '95A23EED-0C13-4D65-965C-FD40C371C870', 'C08C5B36-FFFD-455B-849E-9481C8E1286C', 'SecureMessageID', 'One To Many', TRUE, TRUE, 1, NOW(), NOW());
    END IF;
END $$;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsSecureMessaging."vwFileRequests" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_SecureMessaging: File Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: File Requests
-- Item: Permissions for vwFileRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsSecureMessaging."vwFileRequests" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_SecureMessaging: File Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: File Requests
-- Item: spCreateFileRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR FileRequest
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spCreateFileRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_SecureMessaging: File Requests */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spCreateFileRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_SecureMessaging: File Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: File Requests
-- Item: spUpdateFileRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR FileRequest
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spUpdateFileRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spUpdateFileRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ_BizApps_SecureMessaging: Message Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Message Files
-- Item: vwMessageFiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_SecureMessaging: Message Files
-----               SCHEMA:      __mj_BizAppsSecureMessaging
-----               BASE TABLE:  MessageFile
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsSecureMessaging."vwMessageFiles" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_SecureMessaging: Message Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Message Files
-- Item: Permissions for vwMessageFiles
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsSecureMessaging."vwMessageFiles" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_SecureMessaging: Message Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Message Files
-- Item: spCreateMessageFile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MessageFile
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spCreateMessageFile" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_SecureMessaging: Message Files */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spCreateMessageFile" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_SecureMessaging: Message Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Message Files
-- Item: spUpdateMessageFile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MessageFile
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spUpdateMessageFile" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spUpdateMessageFile" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ_BizApps_SecureMessaging: Portal Magic Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
-- Item: vwPortalMagicLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_SecureMessaging: Portal Magic Links
-----               SCHEMA:      __mj_BizAppsSecureMessaging
-----               BASE TABLE:  PortalMagicLink
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsSecureMessaging."vwPortalMagicLinks" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_SecureMessaging: Portal Magic Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
-- Item: Permissions for vwPortalMagicLinks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsSecureMessaging."vwPortalMagicLinks" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_SecureMessaging: Portal Magic Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
-- Item: spCreatePortalMagicLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PortalMagicLink
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spCreatePortalMagicLink" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_SecureMessaging: Portal Magic Links */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spCreatePortalMagicLink" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_SecureMessaging: Portal Magic Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
-- Item: spUpdatePortalMagicLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PortalMagicLink
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spUpdatePortalMagicLink" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spUpdatePortalMagicLink" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ_BizApps_SecureMessaging: Portal Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
-- Item: vwPortalSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_SecureMessaging: Portal Sessions
-----               SCHEMA:      __mj_BizAppsSecureMessaging
-----               BASE TABLE:  PortalSession
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsSecureMessaging."vwPortalSessions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_SecureMessaging: Portal Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
-- Item: Permissions for vwPortalSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsSecureMessaging."vwPortalSessions" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_SecureMessaging: Portal Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
-- Item: spCreatePortalSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR PortalSession
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spCreatePortalSession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_SecureMessaging: Portal Sessions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spCreatePortalSession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_SecureMessaging: Portal Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
-- Item: spUpdatePortalSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR PortalSession
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spUpdatePortalSession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spUpdatePortalSession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ_BizApps_SecureMessaging: Secure Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Messages
-- Item: vwSecureMessages
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_SecureMessaging: Secure Messages
-----               SCHEMA:      __mj_BizAppsSecureMessaging
-----               BASE TABLE:  SecureMessage
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsSecureMessaging."vwSecureMessages" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_SecureMessaging: Secure Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Messages
-- Item: Permissions for vwSecureMessages
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsSecureMessaging."vwSecureMessages" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_SecureMessaging: Secure Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Messages
-- Item: spCreateSecureMessage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SecureMessage
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spCreateSecureMessage" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_SecureMessaging: Secure Messages */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spCreateSecureMessage" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_SecureMessaging: Secure Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Messages
-- Item: spUpdateSecureMessage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SecureMessage
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spUpdateSecureMessage" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spUpdateSecureMessage" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_SecureMessaging: File Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: File Requests
-- Item: spDeleteFileRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR FileRequest
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spDeleteFileRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_SecureMessaging: File Requests */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spDeleteFileRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_SecureMessaging: Message Files */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Message Files
-- Item: spDeleteMessageFile
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR MessageFile
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spDeleteMessageFile" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_SecureMessaging: Message Files */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spDeleteMessageFile" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_SecureMessaging: Portal Magic Links */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Magic Links
-- Item: spDeletePortalMagicLink
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PortalMagicLink
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spDeletePortalMagicLink" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_SecureMessaging: Portal Magic Links */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spDeletePortalMagicLink" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_SecureMessaging: Portal Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Portal Sessions
-- Item: spDeletePortalSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR PortalSession
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spDeletePortalSession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_SecureMessaging: Portal Sessions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spDeletePortalSession" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_SecureMessaging: Secure Messages */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Messages
-- Item: spDeleteSecureMessage
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SecureMessage
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spDeleteSecureMessage" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_SecureMessaging: Secure Messages */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spDeleteSecureMessage" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for SecureThread */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Threads
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

/* Base View SQL for MJ_BizApps_SecureMessaging: Secure Threads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Threads
-- Item: vwSecureThreads
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ_BizApps_SecureMessaging: Secure Threads
-----               SCHEMA:      __mj_BizAppsSecureMessaging
-----               BASE TABLE:  SecureThread
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsSecureMessaging."vwSecureThreads" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ_BizApps_SecureMessaging: Secure Threads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Threads
-- Item: Permissions for vwSecureThreads
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj_BizAppsSecureMessaging."vwSecureThreads" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ_BizApps_SecureMessaging: Secure Threads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Threads
-- Item: spCreateSecureThread
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SecureThread
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spCreateSecureThread" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ_BizApps_SecureMessaging: Secure Threads */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spCreateSecureThread" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ_BizApps_SecureMessaging: Secure Threads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Threads
-- Item: spUpdateSecureThread
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SecureThread
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spUpdateSecureThread" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spUpdateSecureThread" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ_BizApps_SecureMessaging: Secure Threads */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ_BizApps_SecureMessaging: Secure Threads
-- Item: spDeleteSecureThread
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR SecureThread
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spDeleteSecureThread" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ_BizApps_SecureMessaging: Secure Threads */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj_BizAppsSecureMessaging."spDeleteSecureThread" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to delete unneeded entity fields (6 scoped entities) */


-- ===================== Comments =====================

COMMENT ON TABLE __mj_BizAppsSecureMessaging."SecureThread" IS 'A first-class secure conversation (thread) between the organization and one external contact. Owns the subject, lifecycle status, and all messages/files/requests via FKs. The unit of the contact portal inbox; magic links deep-link into a thread.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."SecureThread"."ContactID" IS 'Soft reference to the external contact (MJ_BizApps_Common.Person.ID). Not a hard FK so the schema stays standalone.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."SecureThread"."Subject" IS 'The conversation subject line (TitanFile-channel style), set by staff at compose or derived at promotion.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."SecureThread"."Status" IS 'Thread lifecycle: Active (open), Closed (contact-visible read-only), Archived (hidden from default lists). Contact-visible, unlike the old session-level archive flags.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."SecureThread"."SourceChannel" IS 'NULL for threads that originated natively in the secure channel; the insecure channel name (e.g. Email, SMS) for threads created by promotion (PRD §9 bridges).';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."SecureThread"."CreatedByUserID" IS 'Soft reference to the MJ user (staff) who created the thread; NULL for promoted/backfilled threads. Not a hard FK so the schema stays standalone.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."SecureThread"."LastMessageAt" IS 'Timestamp of the most recent message in the thread (denormalized for inbox ordering).';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."SecureThread"."IsDeleted" IS 'Soft delete (staff Trash). Records are never hard-deleted — compliance/audit.';

COMMENT ON TABLE __mj_BizAppsSecureMessaging."PortalSession" IS 'A contact''s authenticated portal session. Sessions are per-contact: one active session grants access to all of that contact''s secure threads. Authenticated via a hashed opaque token with a sliding TTL; revocable by staff.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."PortalSession"."TokenHash" IS 'SHA-256 hash of the opaque session token (sm_ prefix). Raw token is never stored.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."PortalSession"."Status" IS 'Session lifecycle status: Active, Expired, or Revoked';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."PortalSession"."ExpiresAt" IS 'When the session token expires. Default TTL is 7 days, extended on each access.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."PortalSession"."LastAccessedAt" IS 'Last time the session was accessed. Used for session extension and cleanup.';

COMMENT ON TABLE __mj_BizAppsSecureMessaging."PortalMagicLink" IS 'Single-use magic links — the passwordless entry path. Short-lived (15 min default), redeems into a fresh session token, and may deep-link to a specific thread.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."PortalMagicLink"."TokenHash" IS 'SHA-256 hash of the magic link token (sm_ml_ prefix). Raw token is never stored.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."PortalMagicLink"."Status" IS 'Magic link lifecycle status: Pending, Used, or Expired';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."PortalMagicLink"."ExpiresAt" IS 'When the magic link expires. Default is 15 minutes from creation.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."PortalMagicLink"."UsedAt" IS 'Timestamp when the magic link was redeemed. NULL if not yet used.';

COMMENT ON TABLE __mj_BizAppsSecureMessaging."SecureMessage" IS 'Self-contained secure message store. Each row is one inbound or outbound message in a thread. App-agnostic: does not require an external Channel Messages entity.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."SecureMessage"."PersonID" IS 'Soft reference to the person (e.g. MJ_BizApps_Common.People.ID). Not a hard FK so the schema stays standalone.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."SecureMessage"."Direction" IS 'Direction of the message relative to the organization: Inbound (from contact) or Outbound (reply to contact).';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."SecureMessage"."ExternalMessageID" IS 'When the Channel Messages adapter is active, holds the mirrored Channel Message ID so the AI pipeline can process the message. NULL in the self-contained path.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."SecureMessage"."IsStarred" IS 'When 1, this message is starred/flagged by staff for quick retrieval (shown under the Starred category). Per-message, staff-toggled.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."SecureMessage"."IsImported" IS 'When 1, this message was imported (copied) into the secure thread during a promotion/bridge from an insecure channel, rather than originating natively in the secure channel. Imported messages predate the switch to secure.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."SecureMessage"."SourceChannel" IS 'For imported messages, the insecure channel the message originated from (e.g. Email, SMS). NULL for messages that originated natively in the secure channel.';

COMMENT ON TABLE __mj_BizAppsSecureMessaging."MessageFile" IS 'Links an uploaded file to a secure message. Bytes are stored in core MJ File Storage (MJ: Files) and wrapped as an MJ Artifact; this table holds references and display metadata only.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."MessageFile"."ArtifactID" IS 'Soft reference to MJ: Artifacts.ID wrapping the uploaded file.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."MessageFile"."FileID" IS 'Soft reference to MJ: Files.ID holding the bytes in the configured storage provider.';

COMMENT ON TABLE __mj_BizAppsSecureMessaging."FileRequest" IS 'A request from staff for the external contact to securely upload one or more files. Fulfilled by uploading files (stored as MessageFile rows) and setting Status to Fulfilled.';

COMMENT ON COLUMN __mj_BizAppsSecureMessaging."FileRequest"."Status" IS 'Request lifecycle status: Pending (awaiting the contact), Fulfilled (files uploaded and the contact marked it complete), Cancelled (staff closed it out), or Expired (the DueAt deadline passed while still Pending). Only Pending requests appear as action callouts in the portal; terminal states collapse into thread history.';


-- ===================== Other =====================

-- =====================================================================================
-- Extended properties (CodeGen reads these as entity/field descriptions)
-- =====================================================================================

-- SecureThread

-- =====================================================================================
-- Captured CodeGen run (metadata registration)
--
-- Appended verbatim from the CodeGen output produced against a fresh database running
-- ONLY the DDL above (see migrations/CLAUDE.md — "Baseline + captured-CodeGen pattern").
-- Registers the six entities with deterministic hardcoded IDs, their fields / value
-- lists / permissions / relationships, the schema Explorer application, __mj timestamp
-- columns, FK indexes, base views, and CRUD stored procedures — so every install
-- replays identical metadata without CodeGen having to invent it.
-- NOTE: '__mj_BizAppsCommon' below is intentionally a hardcoded literal (its schema
-- name is fixed regardless of the consumer's core schema name — see CLAUDE.md fixup).
-- =====================================================================================
/* SQL generated to create new entity MJ_BizApps_SecureMessaging: Secure Threads */

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ_BizApps_SecureMessaging: File Requests */

/* spUpdate Permissions for MJ_BizApps_SecureMessaging: Message Files */

/* spUpdate Permissions for MJ_BizApps_SecureMessaging: Portal Magic Links */

/* spUpdate Permissions for MJ_BizApps_SecureMessaging: Portal Sessions */

/* spUpdate Permissions for MJ_BizApps_SecureMessaging: Secure Messages */

/* spUpdate Permissions for MJ_BizApps_SecureMessaging: Secure Threads */
-- >>> BEGIN baked CodeGen timestamp defaults (scripts/pg-bake-codegen.mjs) <<<
-- CodeGen normalizes every app table's __mj_CreatedAt / __mj_UpdatedAt DEFAULT from the
-- converter's now() to (now() AT TIME ZONE 'UTC'). Baking it keeps `mj codegen` a no-op.
ALTER TABLE __mj_bizappssecuremessaging."FileRequest" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE __mj_bizappssecuremessaging."FileRequest" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE __mj_bizappssecuremessaging."MessageFile" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE __mj_bizappssecuremessaging."MessageFile" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE __mj_bizappssecuremessaging."PortalMagicLink" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE __mj_bizappssecuremessaging."PortalMagicLink" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE __mj_bizappssecuremessaging."PortalSession" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE __mj_bizappssecuremessaging."PortalSession" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE __mj_bizappssecuremessaging."SecureMessage" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE __mj_bizappssecuremessaging."SecureMessage" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE __mj_bizappssecuremessaging."SecureThread" ALTER COLUMN "__mj_CreatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
ALTER TABLE __mj_bizappssecuremessaging."SecureThread" ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT (now() AT TIME ZONE 'UTC'::text);
-- >>> END baked CodeGen timestamp defaults <<<
