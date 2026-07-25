import { Handler } from '@netlify/functions';
import { Client } from '@notionhq/client';
import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { sendPushToUser } from './_shared/notifications';

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const choreDbId = process.env.CHORE_DB_ID!;

// --- Date helpers (inlined to avoid build issues in serverless) ---

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isToday(date: Date): boolean {
  const today = new Date();
  return date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

function calculateNextDueDate(lastCompleted: Date | null, schedule: number): Date {
  if (!lastCompleted) return startOfToday();
  return addDays(lastCompleted, schedule);
}

function isDueOrOverdue(lastCompleted: Date | null, schedule: number): boolean {
  const nextDue = calculateNextDueDate(lastCompleted, schedule);
  const today = startOfToday();
  return nextDue <= today;
}

// --- Notion parsing ---

interface ChoreAssignee {
  name: string;
  email: string | null;
}

interface SimpleChore {
  name: string;
  assignees: ChoreAssignee[];
  schedule: number;
  lastCompleted: Date | null;
}

function parseNotionPage(page: PageObjectResponse): SimpleChore | null {
  try {
    const props = page.properties;

    const nameProp = props['Name'];
    const assigneeProp = props['Assigned to'];
    const daysProp = props['Days'];
    const lastCompletedProp = props['Last completed at'];

    if (nameProp?.type !== 'title' || nameProp.title.length === 0) return null;
    if (assigneeProp?.type !== 'people' || assigneeProp.people.length === 0) return null;
    if (daysProp?.type !== 'number' || daysProp.number === null) return null;
    if (lastCompletedProp?.type !== 'rollup' || !lastCompletedProp.rollup) return null;

    const name = nameProp.title[0].plain_text;
    const schedule = daysProp.number;
    const lastCompletedDate = lastCompletedProp.rollup.type === 'date' ? lastCompletedProp.rollup.date?.start : null;

    const assignees: ChoreAssignee[] = assigneeProp.people.map(person => {
      const personName = ('name' in person ? person.name : person.id) || 'Unassigned';
      const email = 'email' in person ? (person.email ?? null) : null;
      return { name: personName, email };
    });

    return {
      name,
      assignees,
      schedule,
      lastCompleted: lastCompletedDate ? new Date(lastCompletedDate) : null,
    };
  } catch (error) {
    console.error('Failed to parse Notion page:', page.id, error);
    return null;
  }
}

// --- Handler ---

export const handler: Handler = async () => {
  try {
    // 1. Fetch all chores from Notion
    const response = await notion.dataSources.query({ data_source_id: choreDbId });

    const chores = response.results
      .filter((page): page is PageObjectResponse => 'properties' in page)
      .map(parseNotionPage)
      .filter((c): c is SimpleChore => c !== null);

    // 2. Filter to due/overdue chores
    const actionRequired = chores.filter(c => isDueOrOverdue(c.lastCompleted, c.schedule));

    if (actionRequired.length === 0) {
      console.log('No action required chores, skipping notification.');
      return { statusCode: 200, body: JSON.stringify({ sent: 0 }) };
    }

    // 3. Group by assignee email
    const byEmail = new Map<string, string[]>();

    for (const chore of actionRequired) {
      for (const assignee of chore.assignees) {
        if (!assignee.email) continue;
        const email = assignee.email.toLowerCase();
        const existing = byEmail.get(email) || [];
        existing.push(chore.name);
        byEmail.set(email, existing);
      }
    }

    // 4. Send notifications
    let sent = 0;
    for (const [email, choreNames] of byEmail) {
      const list = choreNames.length <= 3
        ? choreNames.join(', ')
        : `${choreNames.slice(0, 2).join(', ')} and ${choreNames.length - 2} more`;

      const body = `You have ${choreNames.length} chore${choreNames.length > 1 ? 's' : ''} due: ${list}`;

      await sendPushToUser(email, 'Chores reminder', body);
      sent++;
      console.log(`Sent notification to ${email}: ${body}`);
    }

    return { statusCode: 200, body: JSON.stringify({ sent }) };
  } catch (error) {
    console.error('Daily reminder failed:', error);
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send reminders' }) };
  }
};
