import { addDays, isPast, isToday } from "date-fns";
import type { Chore } from "./models.ts";

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
export const getChoreStatus = (chore: Chore, nextDueDate: Date): 'Overdue' | 'Due' | 'Done' | 'Future' => {
    // If completed today, it's done.
    if (chore.lastCompleted && isToday(chore.lastCompleted)) {
        return 'Done';
    }

    // If the next due date is today or earlier (and not done today)
    if (isPast(nextDueDate) || isToday(nextDueDate)) {
        if (isPast(nextDueDate) && !isToday(nextDueDate)) {
            return 'Overdue';
        }
        return 'Due';
    }

    return 'Future'; // Due date is in the future
};