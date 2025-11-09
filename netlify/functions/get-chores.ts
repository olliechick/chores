import { Client } from '@notionhq/client';
import type { Handler, HandlerContext } from '@netlify/functions';
import type { Chore } from '../../src/models';
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { isDefined } from "../../src/utils";

// Initialize the Notion client on the server
const notion = new Client({
    auth: process.env.NOTION_API_TOKEN, // Gets the key from Netlify's settings
});

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

        // 5. Get Last completed at (Rollup)
        const lastCompletedProp = props['Last completed at'];
        if (lastCompletedProp?.type !== 'rollup' || !lastCompletedProp.rollup) {
            console.warn(`Missing 'Last completed at' Rollup property for chore: ${name}`);
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

// --- Netlify Function Handler ---
export const handler: Handler = async (_, context: HandlerContext) => {

    // If the user isn't logged in, block them.
    if (!context.clientContext?.user) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: "Unauthorized" }),
        };
    }

    try {
        const response = await notion.dataSources.query({
            data_source_id: process.env.CHORE_DB_ID,
        })

        const chores = response.results
            .map(page => 'properties' in page && 'icon' in page && 'is_locked' in page ? parseNotionPage(page) : null)
            .filter(isDefined)

        // Send the chores back to the React app
        return {
            statusCode: 200,
            body: JSON.stringify(chores),
            headers: { 'Content-Type': 'application/json' },
        };
    } catch (error) {
        console.error("Failed to fetch from Notion:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to fetch chores." }),
        };
    }
};