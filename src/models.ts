// Define the structure for a Chore item (Chore Definition)
export interface Chore {
    id: string; // Notion Page ID
    name: string;
    assignee: string; // The person's name
    assigneeId: string; // The person's Notion User ID
    schedule: number; // How often it should occur (in days)
    lastCompleted: Date | null; // The last time it was completed (Rollup from Log)
}

export interface AppSettings {
    token: string;
    choreDbId: string;
    choreLogDbId: string;
}
