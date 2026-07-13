import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@notionhq/client';

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const logDatabaseId = process.env.CHORE_LOG_DB_ID!;

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

    try {
        // 1. Auth Check
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

        // 2. Parse query params
        const params = new URLSearchParams(event.queryStringParameters || {});
        const since = params.get('since');
        const cursor = params.get('cursor') || undefined;

        // 3. Build Notion query
        const query: Parameters<typeof notion.dataSources.query>[0] = {
            data_source_id: logDatabaseId,
        };

        if (since) {
            query.filter = {
                timestamp: 'created_time',
                created_time: { after: since }
            };
        }

        if (cursor) {
            query.start_cursor = cursor;
        }

        const response = await notion.dataSources.query(query);

        // 4. Extract chore ID + date from each entry
        const entries: Array<{ choreId: string; date: string }> = [];
        for (const page of response.results) {
            if (!('properties' in page)) continue;

            const choreRel = page.properties['Chore'];
            const dateProp = page.properties['Date'];

            if (choreRel?.type === 'relation' && choreRel.relation.length > 0
                && dateProp?.type === 'date' && dateProp.date?.start) {
                entries.push({
                    choreId: choreRel.relation[0].id,
                    date: dateProp.date.start,
                });
            }
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                entries,
                has_more: response.has_more,
                next_cursor: response.next_cursor ?? null,
            }),
        };
    } catch (error) {
        console.error("Failed to fetch chore log:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to fetch chore log" }),
        };
    }
};
