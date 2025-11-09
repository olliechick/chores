import type { Chore } from "./models";
import netlifyIdentity from 'netlify-identity-widget';

/**
 * Helper to get the auth token for the current logged-in user.
 */
function getAuthHeader(): Record<string, string> {
    const user = netlifyIdentity.currentUser();
    if (!user) {
        throw new Error("User not authenticated");
    }
    return {
        Authorization: `Bearer ${user.token?.access_token}`,
    };
}

/**
 * Fetches the list of chores from the backend proxy.
 */
export const fetchChores = async (): Promise<Chore[]> => {
    const response = await fetch('/.netlify/functions/get-chores', {
        headers: getAuthHeader(), // Send the auth token
    });

    if (!response.ok) {
        if (response.status === 401) {
            netlifyIdentity.logout();
        } // Auto-logout on bad token
        const err = await response.json();
        throw new Error(err.error || "Failed to fetch chores from server.");
    }

    const chores: Chore[] = await response.json();

    // Re-hydrate dates
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
    currentChores: Chore[],
): Promise<Chore[]> => {

    const response = await fetch('/.netlify/functions/complete-chore', {
        method: 'POST',
        headers: {
            ...getAuthHeader(), // Send the auth token
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            choreId: choreId,
            completedById: completedById,
        }),
    });

    if (!response.ok) {
        if (response.status === 401) {
            netlifyIdentity.logout();
        }
        const err = await response.json();
        throw new Error(err.error || "Failed to complete chore.");
    }

    // Optimistic update (same as before)
    return currentChores.map(c =>
        c.id === choreId
            ? { ...c, lastCompleted: new Date() }
            : c
    );
};