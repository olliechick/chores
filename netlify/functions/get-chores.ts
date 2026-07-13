import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@notionhq/client';
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { AppUser, Chore } from "../../src/models";

// Helper for type safety (duplicated from utils to avoid build issues in serverless context if not shared properly)
const isDefined = <T>(value: T | null | undefined): value is T => {
    return value !== null && value !== undefined
};

// Initialize Supabase (Service Role for auth verification)
const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize Notion
const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const databaseId = process.env.CHORE_DB_ID!;

/**
 * Parses a single Notion page object into the app's Chore type.
 */
const parseNotionPage = (page: PageObjectResponse): Chore | null => {
    try {
        const props = page.properties;

        // 1. Get ID
        const id = page.id;

        const nameProp = props['Name'];
        const assigneeProp = props['Assigned to'];
        const daysProp = props['Days'];
        const lastCompletedProp = props['Last completed at'];
        const roomProp = props['Room'];
        const importantProp = props['Important'];

        // --- Validation ---
        if (nameProp?.type !== 'title' || nameProp.title.length === 0) {
            return null;
        }
        if (assigneeProp?.type !== 'people' || assigneeProp.people.length === 0) {
            return null;
        }
        if (daysProp?.type !== 'number' || daysProp.number === null) {
            return null;
        }
        if (lastCompletedProp?.type !== 'rollup' || !lastCompletedProp.rollup) {
            console.warn(`Missing 'Last completed at' Rollup for: ${nameProp.title[0].plain_text}`);
            return null;
        }
        if (roomProp && roomProp.type !== 'select') {
            console.warn(`Invalid 'Room' property type for: ${nameProp.title[0].plain_text}`);
            return null;
        }

        const name = nameProp.title[0].plain_text;
        const schedule = daysProp.number;
        const lastCompletedDate = lastCompletedProp.rollup.type === 'date' ? lastCompletedProp.rollup.date?.start : null;
        const room = (roomProp?.type === 'select' && roomProp.select) ? roomProp.select.name : null;

        // Parse 'Important' checkbox (default to false if missing or wrong type)
        const important = importantProp?.type === 'checkbox' ? importantProp.checkbox : false;

        const assignees: AppUser[] = assigneeProp.people.map(person => {
            let personName = ('name' in person ? person.name : person.id) || 'Unassigned';

            // Get only the first name
            if (personName !== 'Unassigned') {
                personName = personName.split(' ')[0];
            }

            return { id: person.id, name: personName };
        });
        return {
            id,
            name,
            assignees,
            schedule,
            lastCompleted: lastCompletedDate ? new Date(lastCompletedDate) : null,
            room,
            important,
        };

    } catch (error) {
        console.error("Failed to parse Notion page:", page.id, error);
        return null;
    }
};

export const handler: Handler = async (event) => {
    // 1. CORS Preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            },
            body: '',
        };
    }

    try {
        // 2. Auth Check (Supabase)
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            throw new Error('No authorization header');
        }
        const token = authHeader.split(' ')[1];

        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return {
                statusCode: 401,
                body: JSON.stringify({ error: "Unauthorized" }),
            };
        }

        // 3. Query Notion
        const response = await notion.dataSources.query({
            data_source_id: databaseId
        });

        // 4. Map Notion Data to App Interface
        const chores = response.results
            .map(page => 'properties' in page && 'icon' in page && 'is_locked' in page ? parseNotionPage(page) : null)
            .filter(isDefined)

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(chores),
        };
    } catch (error) {
        console.error("Failed to fetch from Notion:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to fetch chores" }),
        };
    }
};