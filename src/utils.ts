import { addDays, isToday, isWithinInterval, startOfToday } from "date-fns";
import type { Chore, Status } from "./models.ts";

export const isDefined = <T>(value: T | null | undefined): value is T => {
    return value !== null && value !== undefined
};


/**
 * Calculates the next due date for a given chore based on its schedule.
 */
export const calculateNextDueDate = (chore: Chore): Date => {
    const last = chore.lastCompleted;

    // If never completed, return today.
    if (!last) {
        return new Date();
    }

    // If schedule is 0 or invalid, prevent infinite loops
    const daysToAdd = chore.schedule;

    // Calculate the next due date based on the schedule
    return addDays(last, daysToAdd);
};

/**
 * Determines the status of the chore (Due, Overdue, or Done for today)
 */
export const getChoreStatus = (chore: Chore, nextDueDate: Date): Status => {
    const today = startOfToday();

    // 1. Done check (uses lastCompleted, not nextDue)
    // If completed today, it's done.
    if (chore.lastCompleted && isToday(chore.lastCompleted)) {
        return 'Done';
    }

    // 2. Overdue check
    // Use `< today` to check if it was due yesterday or earlier
    if (nextDueDate < today) {
        return 'Overdue';
    }

    // 3. Due check
    // isToday checks the calendar day
    if (isToday(nextDueDate)) {
        return 'Due';
    }

    // --- At this point, nextDueDate is tomorrow or later ---

    // 4. Next Week check
    const endOfWeek = addDays(today, 7);
    // isWithinInterval is inclusive, so this checks [today, today + 7 days]
    // Since we already know it's not today, this effectively checks [tomorrow, today + 7 days]
    if (isWithinInterval(nextDueDate, { start: today, end: endOfWeek })) {
        return 'NextWeek';
    }

    // 5. Next Month check
    const endOfMonth = addDays(today, 31);
    // Checks (today + 8 days, today + 30 days]
    if (isWithinInterval(nextDueDate, { start: endOfWeek, end: endOfMonth })) {
        return 'NextMonth';
    }

    // 6. Far Future check
    return 'FarFuture'; // Anything else (more than 30 days away)
};