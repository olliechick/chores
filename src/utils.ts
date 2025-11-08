import {addDays, isPast, isToday} from "date-fns";
import type {Chore} from "./models.ts";

/**
 * Calculates the next due date for a given chore based on its schedule.
 */
export const calculateNextDueDate = (chore: Chore): Date => {
    const last = chore.lastCompleted;
    let nextDue = new Date(last);

    // Calculate the next possible due date based on the schedule
    switch (chore.schedule) {
        case 'Daily':
            nextDue = addDays(last, 1);
            break;
        case 'Weekly':
            nextDue = addDays(last, 7);
            break;
        case 'BiWeekly':
            nextDue = addDays(last, 14);
            break;
    }

    // Ensure the date is not in the past relative to today
    while (isPast(nextDue) && !isToday(nextDue)) {
        // If the next calculated date is in the past, push it forward
        switch (chore.schedule) {
            case 'Daily':
                nextDue = addDays(nextDue, 1);
                break;
            case 'Weekly':
                nextDue = addDays(nextDue, 7);
                break;
            case 'BiWeekly':
                nextDue = addDays(nextDue, 14);
                break;
        }
    }

    return nextDue;
};

/**
 * Determines the status of the chore (Due, Overdue, or Done for today)
 */
export const getChoreStatus = (chore: Chore, nextDueDate: Date): 'Overdue' | 'Due' | 'Done' | 'Future' => {
    // If completed today, it's done.
    if (isToday(chore.lastCompleted)) {
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

