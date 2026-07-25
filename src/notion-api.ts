import type { Chore, ChoreLogEntry } from "./models";
import type { LogEntry } from "./log-cache";
import { supabase } from "./supabase";

/**
 * Helper to get the auth token for the current logged-in user.
 */
async function getAuthHeader(): Promise<Record<string, string>> {
    const { data } = await supabase.auth.getSession();

    // If no session, throw error (caller handles logout)
    if (!data.session?.access_token) {
        throw new Error("User not authenticated");
    }

    return {
        Authorization: `Bearer ${data.session.access_token}`,
    };
}

/**
 * Helper to parse YYYY-MM-DD string as Local Date (not UTC)
 */
function parseNotionDate(dateString: string | null | undefined): Date | null {
    if (!dateString) {
        return null;
    }

    // If Notion sends a full timestamp (ISO), use it as is.
    if (dateString.includes('T')) {
        return new Date(dateString);
    }

    // If Notion sends just "2024-12-06", appending "T00:00:00"
    // forces the browser to interpret it as Local Midnight.
    return new Date(`${dateString}T00:00:00`);
}

/**
 * Fetches the list of chores from the backend proxy.
 */
export const fetchChores = async (): Promise<Chore[]> => {
    const headers = await getAuthHeader();

    const response = await fetch('/.netlify/functions/get-chores', {
        headers: headers,
    });

    if (!response.ok) {
        if (response.status === 401) {
            await supabase.auth.signOut();
            window.location.reload();
        }
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch chores from server.");
    }

    const chores: Chore[] = await response.json();

    // Re-hydrate dates using the timezone-safe helper
    return chores.map((chore) => ({
        ...chore,
        // The type definition says Date | null, but JSON comes in as string
        lastCompleted: parseNotionDate(chore.lastCompleted as unknown as string),
    }));
};

/**
 * Logs a chore by telling the backend proxy to do it.
 */
export const completeChoreApi = async (
    choreId: string,
    completedById: string,
    date?: string,
): Promise<void> => {
    const headers = await getAuthHeader();

    const response = await fetch('/.netlify/functions/complete-chore', {
        method: 'POST',
        headers: {
            ...headers,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            choreId: choreId,
            completedById: completedById,
            date: date,
        }),
    });

    if (!response.ok) {
        if (response.status === 401) {
            await supabase.auth.signOut();
            window.location.reload();
        }
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to complete chore.");
    }
};

/**
 * Fetches the completion history for a specific chore.
 */
export const fetchChoreHistory = async (choreId: string): Promise<ChoreLogEntry[]> => {
    const headers = await getAuthHeader();

    const response = await fetch(`/.netlify/functions/get-chore-history?choreId=${encodeURIComponent(choreId)}`, {
        headers: headers,
    });

    if (!response.ok) {
        if (response.status === 401) {
            await supabase.auth.signOut();
            window.location.reload();
        }
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch chore history.");
    }

    const entries: { id: string; date: string; completedBy: string }[] = await response.json();

    return entries.map(entry => ({
        id: entry.id,
        date: parseNotionDate(entry.date)!,
        completedBy: entry.completedBy,
    }));
};

export type LogPageResponse = {
    entries: LogEntry[];
    has_more: boolean;
    next_cursor: string | null;
};

/**
 * Fetches a page of chore log entries from the backend.
 * If `since` is provided, only entries created after that timestamp are returned.
 * If `cursor` is provided, pagination continues from that point.
 */
export const fetchLogPage = async (
    since?: string,
    cursor?: string,
): Promise<LogPageResponse> => {
    const headers = await getAuthHeader();

    const params = new URLSearchParams();
    if (since) params.set('since', since);
    if (cursor) params.set('cursor', cursor);
    const qs = params.toString();

    const response = await fetch(`/.netlify/functions/get-log${qs ? `?${qs}` : ''}`, {
        headers: headers,
    });

    if (!response.ok) {
        if (response.status === 401) {
            await supabase.auth.signOut();
            window.location.reload();
        }
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch chore log.");
    }

    return response.json();
};

/**
 * Deletes a chore log entry by archiving its Notion page.
 */
export const deleteChoreLogApi = async (pageId: string): Promise<void> => {
    const headers = await getAuthHeader();

    const response = await fetch(`/.netlify/functions/delete-chore-log?pageId=${encodeURIComponent(pageId)}`, {
        method: 'DELETE',
        headers: headers,
    });

    if (!response.ok) {
        if (response.status === 401) {
            await supabase.auth.signOut();
            window.location.reload();
        }
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || "Failed to delete log entry.");
    }
};