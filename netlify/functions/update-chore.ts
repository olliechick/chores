import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@notionhq/client';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });

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

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
    }

    try {
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) {
            throw new Error('Missing token');
        }

        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
        }

        if (!event.body) {
            throw new Error("Missing body");
        }

        const { choreId, name, assignees, days, room, important, searchTerms } = JSON.parse(event.body);

        if (!choreId || typeof choreId !== 'string') {
            return { statusCode: 400, body: JSON.stringify({ error: "Chore ID is required" }) };
        }
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return { statusCode: 400, body: JSON.stringify({ error: "Name is required" }) };
        }
        if (!Array.isArray(assignees) || assignees.length === 0 || assignees.some(id => typeof id !== 'string')) {
            return { statusCode: 400, body: JSON.stringify({ error: "At least one assignee is required" }) };
        }
        if (typeof days !== 'number' || !Number.isInteger(days) || days < 1) {
            return { statusCode: 400, body: JSON.stringify({ error: "Days must be a positive integer" }) };
        }

        const properties: Record<string, unknown> = {
            'Name': { title: [{ text: { content: name.trim().slice(0, 200) } }] },
            'Assigned to': { people: assignees.map(id => ({ id })) },
            'Days': { number: days },
            'Important': { checkbox: Boolean(important) },
            'Room': room && typeof room === 'string' && room.trim() !== '' ? { select: { name: room } } : { select: null },
            'Search terms': searchTerms && typeof searchTerms === 'string' && searchTerms.trim() !== ''
                ? { rich_text: [{ text: { content: searchTerms.trim() } }] }
                : { rich_text: [] },
        };

        await notion.pages.update({
            page_id: choreId,
            properties,
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };
    } catch (error) {
        console.error("Failed to update chore:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to update chore." }),
        };
    }
}