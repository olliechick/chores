import { Client } from "@notionhq/client";
import type { PageObjectResponse, } from "@notionhq/client/build/src/api-endpoints";
import type { Chore } from "./models";
import type { AppSettings } from "./App";
import { isDefined } from "./utils.ts";

// A simple cache for the Notion client
let notionClient: Client | null = null;
let currentToken: string | null = null;

const getNotionClient = (token: string): Client => {
    if (notionClient && currentToken === token) {
        return notionClient;
    }
    notionClient = new Client({
        auth: token,
        fetch: window.fetch.bind(window),
    });
    currentToken = token;
    return notionClient;
};

/**
 * Parses a single Notion page object into the app's Chore type.
 */
const parseNotionPage = (page: PageObjectResponse): Chore | null => {
    try {
        const props = page.properties;

        // 1. Get ID
        const id = page.id;

        // 2. Get Name (Title)
        const nameProp = props['Name'];
        if (nameProp?.type !== 'title' || nameProp.title.length === 0) {
            return null;
        }
        const name = nameProp.title[0].plain_text;

        // 3. Get Assignee (Person) - We need both name and ID
        const assigneeProp = props['Assigned to'];
        if (assigneeProp?.type !== 'people' || assigneeProp.people.length === 0) {
            return null;
        }
        const person = assigneeProp.people[0]
        const assigneeName = ('name' in person ? person.name : person.id) || 'Unassigned';
        const assigneeId = assigneeProp.people[0].id;

        // 4. Get Days (Number) and use it as the schedule
        const daysProp = props['Days'];
        if (daysProp?.type !== 'number' || daysProp.number === null) {
            return null;
        }
        const schedule = daysProp.number; // Use the number directly

        // 5. Get Last Completed (Rollup) - ASSUMED to exist per README
        const lastCompletedProp = props['Last Completed'];
        if (lastCompletedProp?.type !== 'rollup' || !lastCompletedProp.rollup) {
            console.warn(`Missing 'Last Completed' Rollup property for chore: ${name}`);
            return null;
        }

        // If rollup is null (never completed), default to epoch
        const lastCompletedDate = lastCompletedProp.rollup.type === 'date' ? lastCompletedProp.rollup.date?.start : null;
        const lastCompleted = lastCompletedDate ? new Date(lastCompletedDate) : null;

        return {
            id,
            name,
            assignee: assigneeName,
            assigneeId,
            schedule,
            lastCompleted,
        };

    } catch (error) {
        console.error("Failed to parse Notion page:", page, error);
        return null;
    }
};

// --- REPLACEMENT API FUNCTIONS ---

/**
 * Fetches the list of chores from the Notion database.
 */
export const fetchChores = async (settings: AppSettings): Promise<Chore[]> => {
    console.log("Fetching chores from Notion with settings:", settings);
    const notion = getNotionClient(settings.token);

    try {
        const response = await notion.dataSources.query({
            data_source_id: settings.choreDbId,
        })

        return response.results
            .map(page => 'properties' in page && 'icon' in page && 'is_locked' in page ? parseNotionPage(page) : null)
            .filter(isDefined)

    } catch (error) {
        console.error("Failed to fetch from Notion:", error);
        if (error instanceof TypeError && error.message.includes("non ISO-8859-1")) {
            throw new Error("Invalid API Token. Your Notion token likely contains an invalid character (e.g., a smart quote ’ or emoji). Please re-copy your token from Notion and save it in settings.");
        }
        // Throw a more specific error for the UI to catch
        if (error && typeof error === 'object' && 'code' in error && 'status' in error) {
            if (error.code === 'object_not_found' || error.status === 404) {
                throw new Error("Notion database not found. Check your 'Chore Database ID'.");
            }
            if (error.code === 'unauthorized' || error.status === 401) {
                throw new Error("Invalid Notion API Token. Check your token and share settings.");
            }
        }
        throw new Error("An unknown error occurred while fetching chores.");
    }
};

/**
 * Logs a chore as complete by creating a new page in the "Chore Log" database.
 */
export const completeChoreApi = async (
    choreId: string,
    currentChores: Chore[],
    settings: AppSettings
): Promise<Chore[]> => {
    console.log(`Completing chore ${choreId} via Notion API...`);
    const notion = getNotionClient(settings.token);

    const choreToComplete = currentChores.find(c => c.id === choreId);
    if (!choreToComplete) {
        throw new Error("Chore not found in current state.");
    }

    try {
        // 1. Create a new page in the "Chore Log" database
        await notion.pages.create({
            parent: { data_source_id: settings.choreLogDbId },
            properties: {
                // "" (Title)
                '': {
                    type: 'title',
                    title: [{ type: 'text', text: { content: "" } }],
                },
                // "Date" (Date)
                'Date': {
                    type: 'date',
                    date: { start: new Date().toISOString().split('T')[0] }, // YYYY-MM-DD
                },
                // "Completed by" (Person)
                'Completed by': {
                    type: 'people',
                    people: [{ id: choreToComplete.assigneeId }], // todo use current user
                },
                // "Chore Relation" (Relation)
                'Chore Relation': {
                    type: 'relation',
                    relation: [{ id: choreToComplete.id }], // Link to the main chore
                },
            },
        });

        // 2. Return the updated list with the new 'lastCompleted' date (simulating the Rollup)
        // This provides immediate UI feedback.
        return currentChores.map(c =>
            c.id === choreId
                ? { ...c, lastCompleted: new Date() }
                : c
        );
    } catch (error) {
        console.error("Failed to complete chore in Notion:", error);
        if (error && typeof error === 'object' && 'code' in error && error.code === 'validation_error') {
            throw new Error("Failed to log chore. Check your 'Chore Log' database properties. Are 'Name', 'Date', 'Completed by', and 'Chore Relation' set up correctly?");
        }
        throw new Error("An unknown error occurred while logging the chore.");
    }
};