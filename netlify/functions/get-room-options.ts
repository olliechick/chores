import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@notionhq/client';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const choreDbId = process.env.CHORE_DB_ID!;

export const handler: Handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
            },
            body: '',
        };
    }

    if (event.httpMethod !== 'GET') {
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

        const dataSource = await notion.dataSources.retrieve({ data_source_id: choreDbId });

        const roomProp = 'properties' in dataSource ? dataSource.properties['Room'] : null;
        const rooms = roomProp?.type === 'select'
            ? roomProp.select.options.map(option => option.name)
            : [];

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rooms }),
        };
    } catch (error) {
        console.error("Failed to fetch room options:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to fetch room options" }),
        };
    }
};