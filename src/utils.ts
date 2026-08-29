import { addDays, isToday, isWithinInterval, startOfToday } from "date-fns";
import type { Chore, Status } from "./models.ts";

export const isDefined = <T>(value: T | null | undefined): value is T => {
    return value !== null && value !== undefined
};

/**
 * Formats how often a chore should be done based on its schedule in days.
 */
export const formatSchedule = (days: number): string => {
    if (days <= 1) return 'Daily';
    if (days === 7) return 'Weekly';
    if (days === 30) return 'Monthly';
    if (days > 90) return `Every ${Math.round(days / 30.44)} months`;
    if (days > 30) return `Every ${Math.round(days / 7)} weeks`;
    return `Every ${days} days`;
};

/**
 * Calculates the next due date for a given chore based on its schedule.
 */
export const calculateNextDueDate = (chore: Chore): Date => {
    const last = chore.lastCompleted;

    // If never completed, return today (or start of today to be safe)
    if (!last) {
        return startOfToday();
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

    // 1. Done check
    // If completed today, it's done.
    if (chore.lastCompleted && isToday(chore.lastCompleted)) {
        return 'Done';
    }

    // 2. Overdue check
    // If nextDueDate is strictly before today (e.g. Yesterday 00:00:00)
    if (nextDueDate < today) {
        return 'Overdue';
    }

    // 3. Due check
    if (isToday(nextDueDate)) {
        return 'Due';
    }

    // 4. Future checks
    const endOfWeek = addDays(today, 7);
    const endOfMonth = addDays(today, 31);

    if (isWithinInterval(nextDueDate, { start: today, end: endOfWeek })) {
        return 'NextWeek';
    }

    if (isWithinInterval(nextDueDate, { start: endOfWeek, end: endOfMonth })) {
        return 'NextMonth';
    }

    return 'FarFuture';
};