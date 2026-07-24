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
        const token = event.headers.authorization?.split(' ')[1];
        if (!token) {
            throw new Error('Missing token');
        }

        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            return { statusCode: 401, body: JSON.stringify({ error: "Unauthorized" }) };
        }

        const choreId = event.queryStringParameters?.choreId;
        if (!choreId) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing choreId parameter" }) };
        }

        const response = await notion.dataSources.query({
            data_source_id: logDatabaseId,
            filter: {
                property: 'Chore',
                relation: {
                    contains: choreId,
                },
            },
            sorts: [
                { property: 'Date', direction: 'descending' },
            ],
        });

        const entries = response.results
            .filter((page): page is Extract<typeof page, { properties: Record<string, unknown> }> => 'properties' in page)
            .map(page => {
                const props = page.properties as Record<string, { type: string; date?: { start: string | null } | null; people?: Array<{ id: string; name?: string }> | null }>;

                const dateProp = props['Date'];
                const dateStr = dateProp?.type === 'date' ? dateProp.date?.start : null;

                const completedByProp = props['Completed by'];
                let completedBy = 'Unknown';
                if (completedByProp?.type === 'people' && completedByProp.people && completedByProp.people.length > 0) {
                    const person = completedByProp.people[0];
                    completedBy = person.name || person.id;
                }

                return {
                    date: dateStr || null,
                    completedBy,
                };
            })
            .filter((entry): entry is { date: string; completedBy: string } => entry.date !== null);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entries),
        };
    } catch (error) {
        console.error("Failed to fetch chore history:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to fetch chore history" }),
        };
    }
};
