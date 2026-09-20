import { addDays, isToday, isWithinInterval, startOfToday } from "date-fns";
import type { Chore, Holiday, Status } from "./models.ts";

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
 * Shifts a due date to the day after each holiday it lands inside.
 * Holidays are processed chronologically so chained periods work.
 */
export const shiftNextDueForHolidays = (nextDue: Date, holidays: Holiday[]): Date => {
    if (holidays.length === 0) {
        return nextDue;
    }

    const sorted = [...holidays].sort((a, b) => a.start.getTime() - b.start.getTime());
    let due = startOfDay(nextDue);
    for (const holiday of sorted) {
        const start = startOfDay(holiday.start);
        const end = startOfDay(holiday.end);
        if (due >= start && due <= end) {
            due = addDays(end, 1);
        }
    }
    return due;
};

/**
 * Calculates the next due date for a given chore based on its schedule,
 * shifting past any holidays when the chore is marked to pause on holiday.
 */
export const calculateNextDueDate = (chore: Chore, holidays: Holiday[] = []): Date => {
    const last = chore.lastCompleted;

    // If never completed, return today (or start of today to be safe)
    if (!last) {
        return shiftNextDueForHolidays(startOfToday(), chore.pauseOnHoliday ? holidays : []);
    }

    // Calculate the next due date based on the schedule
    const nextDue = addDays(last, chore.schedule);
    return shiftNextDueForHolidays(nextDue, chore.pauseOnHoliday ? holidays : []);
};

function startOfDay(input: Date): Date {
    const d = new Date(input);
    d.setHours(0, 0, 0, 0);
    return d;
}

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