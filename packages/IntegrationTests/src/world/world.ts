import type { WorldOrgKey, WorldRole } from './seed-fixtures.js';

export interface WorldPerson {
    ID: string;
    OrgKey: WorldOrgKey;
    OrganizationID: string;
    Role: WorldRole;
    Email: string;
    FirstName: string;
    LastName: string;
}

export interface WorldIds {
    /** Primary host organization ID (Blue Cypress Press) for backwards compatibility. */
    OrganizationID: string;
    /** All seeded tenant/organization IDs keyed by {@link WorldOrgKey}. */
    Organizations: Record<WorldOrgKey, string>;
    People: Record<string, WorldPerson>;
    Threads: Record<string, string>;
    Sessions: Record<string, string>;
    Messages: Record<string, string>;
    Artifacts: Record<string, string>;
    ArtifactVersions: Record<string, string>;
    MessageFiles: Record<string, string>;
    FileRequests: Record<string, string>;
    MagicLinks: Record<string, string>;
}

let cached: WorldIds | null = null;

export function SetWorld(world: WorldIds): void {
    cached = world;
}

export function GetWorld(): WorldIds | null {
    return cached;
}

export function World(): WorldIds {
    if (!cached) {
        throw new Error('SM-WORLD is not loaded. Run the messaging-world bundle first.');
    }
    return cached;
}
