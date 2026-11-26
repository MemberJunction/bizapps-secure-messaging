/**
 * MJ entity names, in one place. Metadata.GetEntityObject / RunView resolve these
 * at runtime — a typo compiles and returns empty results.
 */

export const E_PERSON = 'MJ_BizApps_Common: People';
export const E_ORGANIZATION = 'MJ_BizApps_Common: Organizations';

export const E_THREAD = 'MJ_BizApps_SecureMessaging: Secure Threads';
export const E_MESSAGE = 'MJ_BizApps_SecureMessaging: Secure Messages';
export const E_SESSION = 'MJ_BizApps_SecureMessaging: Portal Sessions';
export const E_MAGIC = 'MJ_BizApps_SecureMessaging: Portal Magic Links';
export const E_FILE_REQUEST = 'MJ_BizApps_SecureMessaging: File Requests';
export const E_MESSAGE_FILE = 'MJ_BizApps_SecureMessaging: Message Files';

export const E_ARTIFACT = 'MJ: Artifacts';
export const E_ARTIFACT_VERSION = 'MJ: Artifact Versions';
export const E_ARTIFACT_TYPE = 'MJ: Artifact Types';
export const E_ARTIFACT_PERMISSION = 'MJ: Artifact Permissions';

/** Committed world tag. Threads, artifacts, requests and files key off this prefix. */
export const WORLD_MARK = 'SM-WORLD';

/** Shared party-directory domain (same people as common/orders COM-WORLD when that suite has run). */
export const WORLD_EMAIL_DOMAIN = 'com-world.test';

/** Documented raw session tokens for widget poking. Only SHA-256 hashes are stored. */
export const WORLD_TOKENS = {
    noraActive: 'sm_world_nora_active',
    elenaActive: 'sm_world_elena_active',
    graceActive: 'sm_world_grace_active',
    jordanActive: 'sm_world_jordan_active',
    alanActive: 'sm_world_alan_active',
    marcusActive: 'sm_world_marcus_active',
    jamesExpired: 'sm_world_james_expired',
    adaActive: 'sm_world_ada_active',
    priyaActive: 'sm_world_priya_northstar_active',
    derekActive: 'sm_world_derek_northstar_active',
    samanthaActive: 'sm_world_samantha_meridian_active',
    omarRevoked: 'sm_world_omar_meridian_revoked',
    jamesMagic: 'sm_ml_world_james_pending',
    priyaMagic: 'sm_ml_world_priya_used',
} as const;
