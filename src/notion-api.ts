import type { Chore } from "./models";
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

    // Re-hydrate dates strings to Date objects
    return chores.map((chore) => ({
        ...chore,
        lastCompleted: chore.lastCompleted ? new Date(chore.lastCompleted) : null,
    }));
};

/**
 * Logs a chore by telling the backend proxy to do it.
 */
export const completeChoreApi = async (
    choreId: string,
    completedById: string,
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