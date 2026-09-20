import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@notionhq/client';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const holidayDbId = process.env.HOLIDAY_DB_ID!;

const isISODate = (value: unknown): value is string =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

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

        const { name, start, end } = JSON.parse(event.body);

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return { statusCode: 400, body: JSON.stringify({ error: "Name is required" }) };
        }
        if (!isISODate(start) || !isISODate(end)) {
            return { statusCode: 400, body: JSON.stringify({ error: "Start and end must be dates in YYYY-MM-DD format" }) };
        }
        if (end < start) {
            return { statusCode: 400, body: JSON.stringify({ error: "End must be on or after start" }) };
        }

        await notion.pages.create({
            parent: { data_source_id: holidayDbId },
            properties: {
                'Name': { title: [{ text: { content: name.trim().slice(0, 200) } }] },
                'Date': { date: { start, end } },
            },
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };
    } catch (error) {
        console.error("Failed to create holiday:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to create holiday." }),
        };
    }
}