
// Define the structure for a Chore item (Chore Definition)
export interface Chore {
    id: string;
    name: string;
    assignee: string; // The person responsible
    schedule: 'Daily' | 'Weekly' | 'BiWeekly'; // How often it should occur
    lastCompleted: Date; // The last time it was completed (Rollup from Log)
}
