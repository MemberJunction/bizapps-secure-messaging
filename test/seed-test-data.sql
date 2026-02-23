-- =============================================================================
-- Secure Messaging Test Seed Data
-- =============================================================================
-- Run against: Izzy_SecureMsg_Test
--
-- This script creates the minimal reference data needed to test the
-- Secure Messaging REST API endpoints:
--   1. "Secure Web" Communication Provider
--   2. "Secure Web" Channel Type
--   3. A test Channel linked to rasa org
--   4. A PortalSession with a known test token
--
-- Test token: sm_testtoken_for_local_testing_only
-- SHA-256 hash: computed inline below
-- =============================================================================

DECLARE @ProviderID   UNIQUEIDENTIFIER;
DECLARE @ChannelTypeID UNIQUEIDENTIFIER;
DECLARE @ChannelID    UNIQUEIDENTIFIER;
DECLARE @ContactID    UNIQUEIDENTIFIER;
DECLARE @OrgID        UNIQUEIDENTIFIER;
DECLARE @SessionID    UNIQUEIDENTIFIER;
DECLARE @ThreadID     NVARCHAR(255) = 'test-thread-001';

-- The known test token and its SHA-256 hash
-- Token: sm_testtoken_for_local_testing_only
-- Hash computed via: echo -n 'sm_testtoken_for_local_testing_only' | sha256sum
DECLARE @TokenHash NVARCHAR(128) = '{{TOKEN_HASH}}';

-- ---- 1. Communication Provider ----
IF NOT EXISTS (SELECT 1 FROM [__mj].[CommunicationProvider] WHERE [Name] = 'Secure Web')
BEGIN
    SET @ProviderID = NEWID();
    INSERT INTO [__mj].[CommunicationProvider]
        ([ID], [Name], [Description], [Status], [SupportsSending], [SupportsReceiving],
         [SupportsScheduledSending], [SupportsForwarding], [SupportsReplying], [SupportsDrafts])
    VALUES
        (@ProviderID, 'Secure Web',
         'Internal MJ communication provider for the Secure Messaging portal.',
         'Active', 1, 1, 0, 0, 1, 0);
    PRINT 'Created Communication Provider: Secure Web';
END
ELSE
BEGIN
    SELECT @ProviderID = ID FROM [__mj].[CommunicationProvider] WHERE [Name] = 'Secure Web';
    PRINT 'Communication Provider already exists: Secure Web';
END

-- ---- 2. Channel Type ----
IF NOT EXISTS (SELECT 1 FROM [Izzy].[ChannelType] WHERE [Name] = 'Secure Web')
BEGIN
    SET @ChannelTypeID = NEWID();
    INSERT INTO [Izzy].[ChannelType]
        ([ID], [Name], [Description], [CommunicationProviderID], [ActionInheritMode], [Status])
    VALUES
        (@ChannelTypeID, 'Secure Web',
         'Secure web messaging channel for external contacts via embedded widget.',
         @ProviderID, 'Combined', 'Active');
    PRINT 'Created Channel Type: Secure Web';
END
ELSE
BEGIN
    SELECT @ChannelTypeID = ID FROM [Izzy].[ChannelType] WHERE [Name] = 'Secure Web';
    PRINT 'Channel Type already exists: Secure Web';
END

-- ---- 3. Pick reference data ----
-- Use rasa org
SELECT @OrgID = ID FROM [__BCSaaS].[Organization] WHERE [Name] = 'rasa';
-- Use jared.loftus@rasa.io contact
SELECT @ContactID = ID FROM [__BCSaaS].[Contact] WHERE [Email] = 'jared.loftus@rasa.io';

IF @OrgID IS NULL OR @ContactID IS NULL
BEGIN
    PRINT 'ERROR: Could not find rasa org or jared.loftus@rasa.io contact';
    RETURN;
END

PRINT 'Using OrgID: ' + CAST(@OrgID AS NVARCHAR(36));
PRINT 'Using ContactID: ' + CAST(@ContactID AS NVARCHAR(36));

-- ---- 4. Test Channel ----
IF NOT EXISTS (SELECT 1 FROM [Izzy].[Channel] WHERE [Name] = 'Secure Web - Test')
BEGIN
    SET @ChannelID = NEWID();
    INSERT INTO [Izzy].[Channel]
        ([ID], [OrganizationID], [ChannelTypeID], [Name], [Description],
         [ActionInheritMode], [Status])
    VALUES
        (@ChannelID, @OrgID, @ChannelTypeID, 'Secure Web - Test',
         'Test channel for secure messaging development',
         'Combined', 'Active');
    PRINT 'Created Channel: Secure Web - Test';
END
ELSE
BEGIN
    SELECT @ChannelID = ID FROM [Izzy].[Channel] WHERE [Name] = 'Secure Web - Test';
    PRINT 'Channel already exists: Secure Web - Test';
END

-- ---- 5. Portal Session ----
IF NOT EXISTS (SELECT 1 FROM [secure_messaging].[PortalSession] WHERE [ThreadID] = @ThreadID)
BEGIN
    SET @SessionID = NEWID();
    INSERT INTO [secure_messaging].[PortalSession]
        ([ID], [ChannelID], [ContactID], [ThreadID], [TokenHash],
         [Status], [ExpiresAt], [LastAccessedAt])
    VALUES
        (@SessionID, @ChannelID, @ContactID, @ThreadID, @TokenHash,
         'Active', DATEADD(DAY, 7, SYSDATETIMEOFFSET()), SYSDATETIMEOFFSET());
    PRINT 'Created PortalSession for thread: ' + @ThreadID;
END
ELSE
BEGIN
    SELECT @SessionID = ID FROM [secure_messaging].[PortalSession] WHERE [ThreadID] = @ThreadID;
    PRINT 'PortalSession already exists for thread: ' + @ThreadID;
END

-- ---- Summary ----
PRINT '';
PRINT '=== Test Data Summary ===';
PRINT 'Provider ID:    ' + CAST(@ProviderID AS NVARCHAR(36));
PRINT 'Channel Type ID:' + CAST(@ChannelTypeID AS NVARCHAR(36));
PRINT 'Channel ID:     ' + CAST(@ChannelID AS NVARCHAR(36));
PRINT 'Contact ID:     ' + CAST(@ContactID AS NVARCHAR(36));
PRINT 'Session ID:     ' + CAST(@SessionID AS NVARCHAR(36));
PRINT 'Thread ID:      ' + @ThreadID;
PRINT '';
PRINT 'Test token: sm_testtoken_for_local_testing_only';
PRINT 'Use this token with the /auth/validate endpoint and as Bearer token.';
