import { Client } from '@notionhq/client';
import type { Handler } from '@netlify/functions';

const notion = new Client({
    auth: process.env.NOTION_API_TOKEN,
});

export const handler: Handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    try {
        // The body from the frontend is a string, so we must parse it
        const body = JSON.parse(event.body || '{}');
        const { choreId, name, assigneeId } = body;

        if (!choreId || !name || !assigneeId) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing required fields." }),
            };
        }

        // Create the new page in the "Chore Log"
        await notion.pages.create({
            parent: { database_id: process.env.CHORE_LOG_DB_ID! },
            properties: {
                'Name': { type: 'title', title: [{ type: 'text', text: { content: name } }] },
                'Date': { type: 'date', date: { start: new Date().toISOString().split('T')[0] } },
                'Completed by': { type: 'people', people: [{ id: assigneeId }] },
                'Chore': { type: 'relation', relation: [{ id: choreId }] },
            },
        });

        // Send a simple success response
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };

    } catch (error) {
        console.error("Failed to complete chore:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to complete chore." }),
        };
    }
}