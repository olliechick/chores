import { differenceInDays, format, isToday, isTomorrow } from "date-fns";
import { calculateNextDueDate, getChoreStatus } from "../utils.ts";
import type { Chore } from "../models.ts";

export type StatusBadgeProps = { chore: Chore }

/**
 * Helper component for displaying the due date/status tag
 */
export const StatusBadge = ({ chore }: StatusBadgeProps) => {
    // Get the current date for comparison (using 'new Date()' or passing it in)
    // For simplicity, we'll use new Date() here.
    const today = new Date();

    const nextDueDate = calculateNextDueDate(chore);
    const status = getChoreStatus(chore, nextDueDate);

    let color = 'bg-gray-200 text-gray-700';
    let label = `Next: ${format(nextDueDate, 'd MMM')}`;

    if (status === 'Overdue') {
        const daysOverdue = differenceInDays(today, nextDueDate);

        // Ensure daysOverdue is positive or zero (it should be if status is 'Overdue',
        // but this handles potential edge cases or if nextDueDate is slightly in the past
        // but not fully a day past). We want to show 1 day overdue for anything past midnight.
        // differenceInDays(today, yesterday) will be 1.

        color = 'bg-red-100 text-red-700 border border-red-300 animate-pulse';

        if (daysOverdue > 0) {
            // Use Math.abs in case your getChoreStatus is based on checking a time other than midnight,
            // but differenceInDays(later, earlier) will return a positive number.
            label = `${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue`;
        } else {
            // This case might happen if 'Overdue' is set the moment the time passes
            // on the due day, but differenceInDays is 0 until the next day.
            label = `Overdue`;
        }
    } else if (status === 'Due' || status === 'NextWeek' || status === 'NextMonth' || status === 'FarFuture') {
        if (isToday(nextDueDate)) {
            color = 'bg-amber-100 text-amber-700 border border-amber-300';
            label = 'Due today';
        } else if (isTomorrow(nextDueDate)) {
            color = 'bg-emerald-100 text-emerald-700 border border-emerald-300';
            label = 'Due tomorrow';
        } else {
            color = 'bg-gray-100 text-gray-500 border border-gray-300';
            const daysUntilDue = differenceInDays(nextDueDate, today);
            label = `Due in ${daysUntilDue} days`;
        }
    } else if (status === 'Done' && chore.lastCompleted && isToday(chore.lastCompleted)) {
        color = 'bg-green-500 text-white border border-green-500';
        label = 'Done today';
    }

    return (
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${color}`}>
      {label}
    </span>
    );
};