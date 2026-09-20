import { Handler } from '@netlify/functions';
import { Client } from '@notionhq/client';
import { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { sendPushToUser } from './_shared/notifications';

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const choreDbId = process.env.CHORE_DB_ID!;
const holidayDbId = process.env.HOLIDAY_DB_ID;

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

function calculateNextDueDate(lastCompleted: Date | null, schedule: number): Date {
  if (!lastCompleted) return startOfToday();
  return addDays(lastCompleted, schedule);
}

function shiftDueForHolidays(nextDue: Date, pauseOnHoliday: boolean, holidays: Holiday[]): Date {
  let due = nextDue;
  if (!pauseOnHoliday || holidays.length === 0) return due;

  const sorted = [...holidays].sort((a, b) => a.start.getTime() - b.start.getTime());
  for (const holiday of sorted) {
    if (due >= holiday.start && due <= holiday.end) {
      due = addDays(holiday.end, 1);
    }
  }
  return due;
}

function isDueOrOverdue(chore: SimpleChore, holidays: Holiday[]): boolean {
  const nextDue = calculateNextDueDate(chore.lastCompleted, chore.schedule);
  const shifted = shiftDueForHolidays(nextDue, chore.pauseOnHoliday, holidays);
  const today = startOfToday();
  return shifted <= today;
}

// --- Notion parsing ---

interface ChoreAssignee {
  name: string;
  email: string | null;
}

interface Holiday {
  name: string;
  start: Date;
  end: Date;
}

interface SimpleChore {
  name: string;
  assignees: ChoreAssignee[];
  schedule: number;
  lastCompleted: Date | null;
  pauseOnHoliday: boolean;
}

function parseNotionPage(page: PageObjectResponse): SimpleChore | null {
  try {
    const props = page.properties;

    const nameProp = props['Name'];
    const assigneeProp = props['Assigned to'];
    const daysProp = props['Days'];
    const lastCompletedProp = props['Last completed at'];
    const deletedProp = props['Deleted'];
    const pauseOnHolidayProp = props['Pause on holiday'];

    if (nameProp?.type !== 'title' || nameProp.title.length === 0) return null;
    if (assigneeProp?.type !== 'people' || assigneeProp.people.length === 0) return null;
    if (daysProp?.type !== 'number' || daysProp.number === null) return null;
    if (lastCompletedProp?.type !== 'rollup' || !lastCompletedProp.rollup) return null;

    // Skip soft-deleted chores
    if (deletedProp?.type === 'checkbox' && deletedProp.checkbox) return null;

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
      pauseOnHoliday: pauseOnHolidayProp?.type === 'checkbox' ? pauseOnHolidayProp.checkbox : false,
    };
  } catch (error) {
    console.error('Failed to parse Notion page:', page.id, error);
    return null;
  }
}

function parseHolidayPage(page: PageObjectResponse): Holiday | null {
  try {
    const props = page.properties;
    const nameProp = props['Name'];
    const dateProp = props['Date'];

    if (nameProp?.type !== 'title' || nameProp.title.length === 0) return null;
    if (dateProp?.type !== 'date' || !dateProp.date?.start) return null;

    return {
      name: nameProp.title[0].plain_text,
      start: new Date(`${dateProp.date.start}T00:00:00`),
      end: new Date(`${(dateProp.date.end ?? dateProp.date.start)}T00:00:00`),
    };
  } catch (error) {
    console.error('Failed to parse holiday page:', page.id, error);
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

    // 1b. Fetch holidays (best-effort if the DB is not configured)
    let holidays: Holiday[] = [];
    if (holidayDbId) {
      try {
        const holidayResponse = await notion.dataSources.query({ data_source_id: holidayDbId });
        holidays = holidayResponse.results
          .filter((page): page is PageObjectResponse => 'properties' in page && !page.archived)
          .map(parseHolidayPage)
          .filter((h): h is Holiday => h !== null);
      } catch (e) {
        console.warn('Failed to fetch holidays, skipping holiday shifts:', e);
      }
    }

    // 2. Filter to due/overdue chores
    const actionRequired = chores.filter(c => isDueOrOverdue(c, holidays));

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
