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

        // 2. Parse Body
        if (!event.body) {
            throw new Error("Missing body");
        }
        const { choreId, completedById, date: clientDate } = JSON.parse(event.body);

        if (!choreId || !completedById) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing choreId or completedById" }) };
        }

        // 3. Use client-provided date or fall back to NZ timezone date
        const nzDateString = clientDate || new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Pacific/Auckland',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(new Date());

        const createLogEntry = (choreId: string, title: string) =>
            notion.pages.create({
                parent: { data_source_id: logDatabaseId },
                properties: {
                    '': { title: [{ text: { content: title } }] },
                    Date: { date: { start: nzDateString } },
                    'Completed by': { people: [{ id: completedById }] },
                    Chore: { relation: [{ id: choreId }] },
                }
            });

        // 4. Look up the chore's name and its 'Also completes' self-relation
        const chorePage = await notion.pages.retrieve({ page_id: choreId });
        const choreProps = chorePage.properties;
        const nameProp = (choreProps as Record<string, { type?: string; title?: Array<{ plain_text: string }> }>)['Name'];
        const choreName = nameProp?.type === 'title' && nameProp.title && nameProp.title.length > 0
            ? nameProp.title[0].plain_text
            : null;

        const alsoProp = (choreProps as Record<string, { type?: string; relation?: Array<{ id: string }> }>)['Also completes'];
        const alsoIds = alsoProp?.type === 'relation'
            ? [...new Set(alsoProp.relation.map(r => r.id))]
            : [];

        // 5. Create the main log entry
        await createLogEntry(choreId, '');

        // 6. Auto-complete linked chores with the same date/person
        const alsoCompleted: string[] = [];
        for (const linkedId of alsoIds) {
            if (linkedId === choreId) continue;
            await createLogEntry(linkedId, choreName ? `via ${choreName}` : '');
            alsoCompleted.push(linkedId);
        }

        // Send a simple success response
        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, dateUsed: nzDateString, alsoCompleted }),
        };

    } catch (error) {
        console.error("Failed to complete chore:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to complete chore." }),
        };
    }
}