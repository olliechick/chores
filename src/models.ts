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

export type Status = 'Overdue' | 'Due' | 'Done' | 'NextWeek' | 'NextMonth' | 'FarFuture';

// Define an internal type for the enhanced chore object
export type ChoreWithStatus = Chore & {
    status: Status
    nextDue: Date;
};

export interface AppSettings {
    token: string;
    choreDbId: string;
    choreLogDbId: string;
}
