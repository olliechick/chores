import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@notionhq/client';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const logDatabaseId = process.env.CHORE_LOG_DB_ID;

export const handler: Handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
            },
            body: '',
        };
    }

    try {
        // 1. Auth Check
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) {
            throw new Error('Missing token');
        }

        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
        }

        // 2. Parse Data
        if (!event.body) {
            throw new Error("Missing body");
        }
        const { choreId, completedById } = JSON.parse(event.body);

        if (!choreId || !completedById) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing choreId or completedById" }) };
        }

        // 3. Create the log page
        await notion.pages.create({
            parent: { data_source_id: logDatabaseId },
            properties: {
                '': { type: 'title', title: [{ type: 'text', text: { content: "" } }] },
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