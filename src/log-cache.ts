const CACHE_KEY = 'chore_log_cache';

export type LogEntry = { choreId: string; date: string };

export type LogCache = {
    entries: LogEntry[];
    lastSyncedAt: string;
};

export function getLogCache(): LogCache | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as LogCache;
    } catch {
        return null;
    }
}

export function setLogCache(cache: LogCache): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn("Failed to write log cache:", e);
    }
}

export function clearLogCache(): void {
    try {
        localStorage.removeItem(CACHE_KEY);
    } catch {
        // ignore
    }
}

/**
 * Build a map of choreId → most recent completion Date from log entries.
 */
export function buildLastCompletedMap(entries: LogEntry[]): Map<string, Date> {
    const map = new Map<string, Date>();
    for (const entry of entries) {
        const existing = map.get(entry.choreId);
        const date = new Date(`${entry.date}T00:00:00`);
        if (!existing || date > existing) {
            map.set(entry.choreId, date);
        }
    }
    return map;
}
