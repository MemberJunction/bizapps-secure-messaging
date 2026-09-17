export interface WorldPerson {
    ID: string;
    Email: string;
    FirstName: string;
    LastName: string;
}

export interface WorldIds {
    OrganizationID: string;
    People: Record<string, WorldPerson>;
    Threads: Record<string, string>;
    Sessions: Record<string, string>;
    Messages: Record<string, string>;
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
