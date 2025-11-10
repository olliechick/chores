import { Client } from '@notionhq/client';
import type { Handler } from '@netlify/functions';

const notion = new Client({
    auth: process.env.NOTION_API_TOKEN,
});

export const handler: Handler = async (event, context) => {
    // 1. Auth Check
    if (!context.clientContext?.user) {
        return {
            statusCode: 401,
            body: JSON.stringify({ error: "Unauthorized" }),
        };
    }

    // 2. Method Check
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');

        const { choreId, name, completedById } = body;

        if (!choreId || !name || !completedById) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Missing required fields (choreId, name, completedById)." }),
            };
        }

        // 3. Create the log page
        await notion.pages.create({
            parent: { database_id: process.env.CHORE_LOG_DB_ID! },
            properties: {
                'Name': { type: 'title', title: [{ type: 'text', text: { content: name } }] },
                'Date': { type: 'date', date: { start: new Date().toISOString().split('T')[0] } },
                'Completed by': { type: 'people', people: [{ id: completedById }] },
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