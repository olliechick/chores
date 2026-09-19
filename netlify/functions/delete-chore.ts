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
                'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
            },
            body: '',
        };
    }

    if (event.httpMethod !== 'DELETE') {
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

        const choreId = event.queryStringParameters?.choreId;
        if (!choreId) {
            return { statusCode: 400, body: JSON.stringify({ error: "Missing choreId parameter" }) };
        }

        // 1. Soft-delete: tick the 'Deleted' checkbox (page stays in Notion, app hides it)
        await notion.pages.update({
            page_id: choreId,
            properties: { 'Deleted': { checkbox: true } },
        });

        // 2. Scrub this chore from other chores' 'Also completes' relations
        let cursor: string | undefined;
        const scrub = async (page: { id: string; properties: Record<string, unknown> }) => {
            const alsoProp = (page.properties as Record<string, { type?: string; relation?: Array<{ id: string }> }>)['Also completes'];
            if (alsoProp?.type !== 'relation') return;
            const current = alsoProp.relation.map(r => r.id);
            if (!current.includes(choreId)) return;
            await notion.pages.update({
                page_id: page.id,
                properties: { 'Also completes': { relation: current.filter(id => id !== choreId).map(id => ({ id })) } },
            });
        };

        do {
            const response = await notion.dataSources.query({
                data_source_id: choreDbId,
                start_cursor: cursor,
            });
            for (const page of response.results) {
                if (!('properties' in page)) continue;
                const deletedProp = (page.properties as Record<string, { type?: string; checkbox?: boolean }>)['Deleted'];
                if (deletedProp?.type === 'checkbox' && deletedProp.checkbox) continue;
                await scrub(page as { id: string; properties: Record<string, unknown> });
            }
            cursor = response.has_more ? response.next_cursor ?? undefined : undefined;
        } while (cursor);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true }),
        };
    } catch (error) {
        console.error("Failed to delete chore:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to delete chore." }),
        };
    }
}