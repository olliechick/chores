export interface AppUser {
    id: string;
    name: string;
}

export interface Chore {
    id: string; // Notion Page ID
    name: string;
    assignees: AppUser[]; // An array of people assigned
    schedule: number; // How often it should occur (in days)
    lastCompleted: Date | null; // The last time it was completed (Rollup from Log)
    room: string | null; // The name of the 'Select' option for the room
}

// This AppSettings model is no longer needed
// export interface AppSettings { ... }

export interface AppSettings {
    token: string;
    choreDbId: string;
    choreLogDbId: string;
}
