export interface AppUser {
    id: string;
    name: string;
    fullName: string;
    avatarUrl: string | null;
}

export interface Chore {
    id: string; // Notion Page ID
    name: string;
    assignees: AppUser[]; // An array of people assigned
    schedule: number; // How often it should occur (in days)
    lastCompleted: Date | null; // The last time it was completed (Rollup from Log)
    room: string | null; // The name of the 'Select' option for the room
    important: boolean;
    searchTerms: string;
    deleted: boolean; // Soft-deleted in Notion ('Deleted' checkbox ticked)
    alsoCompletes: string[]; // IDs of chores completed at the same time as this one (e.g. sheets completes pillowcases)
}

export type Status = 'Overdue' | 'Due' | 'Done' | 'NextWeek' | 'NextMonth' | 'FarFuture';

// Define an internal type for the enhanced chore object
export type ChoreWithStatus = Chore & {
    status: Status
    nextDue: Date;
};

export interface ChoreLogEntry {
    id: string;
    date: Date;
    completedBy: string;
    viaName?: string; // Set when this entry was auto-created by completing another chore (e.g. pillowcases via sheets)
}

export interface AppSettings {
    token: string;
    choreDbId: string;
    choreLogDbId: string;
}
