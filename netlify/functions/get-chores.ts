import { Client } from '@notionhq/client';
import type { Handler, HandlerContext } from '@netlify/functions';
import type { AppUser, Chore } from '../../src/models';
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { isDefined } from "../../src/utils";

// Initialize the Notion client on the server
const notion = new Client({
    auth: process.env.NOTION_API_TOKEN,
});

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

        const name = nameProp.title[0].plain_text;
        const schedule = daysProp.number;
        const lastCompletedDate = lastCompletedProp.rollup.type === 'date' ? lastCompletedProp.rollup.date?.start : null;

        const assignees: AppUser[] = assigneeProp.people.map(person => {
            const personName = ('name' in person ? person.name : person.id) || 'Unassigned';
            return { id: person.id, name: personName };
        });

        return {
            id,
            name,
            assignees,
            schedule,
            lastCompleted: lastCompletedDate ? new Date(lastCompletedDate) : null,
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