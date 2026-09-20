import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { Client } from '@notionhq/client';
import { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";
import { Holiday } from "../../src/models";

const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const holidayDbId = process.env.HOLIDAY_DB_ID!;

const parseHolidayPage = (page: PageObjectResponse): Holiday | null => {
    const props = page.properties;
    const nameProp = props['Name'];
    const dateProp = props['Date'];

    if (nameProp?.type !== 'title' || nameProp.title.length === 0) {
        return null;
    }
    if (dateProp?.type !== 'date' || !dateProp.date?.start) {
        return null;
    }

    return {
        id: page.id,
        name: nameProp.title[0].plain_text,
        start: new Date(`${dateProp.date.start}T00:00:00`),
        end: new Date(`${(dateProp.date.end ?? dateProp.date.start)}T00:00:00`),
    };
};

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

        const response = await notion.dataSources.query({
            data_source_id: holidayDbId,
        });

        const holidays = response.results
            .filter((page): page is PageObjectResponse => 'properties' in page && !page.archived)
            .map(parseHolidayPage)
            .filter((h): h is Holiday => h !== null)
            .sort((a, b) => a.start.getTime() - b.start.getTime());

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(holidays.map(h => ({ ...h, start: h.start.toISOString(), end: h.end.toISOString() }))),
        };
    } catch (error) {
        console.error("Failed to fetch holidays:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Failed to fetch holidays" }),
        };
    }
}