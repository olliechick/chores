import {format, isToday, isTomorrow} from "date-fns";
import {calculateNextDueDate, getChoreStatus} from "../utils.ts";
import type {Chore} from "../models.ts";

/**
 * Helper component for displaying the due date/status tag
 */
export const StatusBadge = ({ chore }: {chore:Chore}) => {
    const nextDueDate = calculateNextDueDate(chore);
    const status = getChoreStatus(chore, nextDueDate);

    let color = 'bg-gray-200 text-gray-700';
    let label = `Next: ${format(nextDueDate, 'MMM dd')}`;

    if (status === 'Overdue') {
        color = 'bg-red-100 text-red-700 border border-red-300 animate-pulse';
        label = 'Overdue';
    } else if (status === 'Due') {
        if (isToday(nextDueDate)) {
            color = 'bg-amber-100 text-amber-700 border border-amber-300';
            label = 'Due today';
        } else if (isTomorrow(nextDueDate)) {
            color = 'bg-emerald-100 text-emerald-700 border border-emerald-300';
            label = 'Due tomorrow';
        } else {
            color = 'bg-blue-100 text-blue-700 border border-blue-300';
            label = `Next: ${format(nextDueDate, 'd MMM')}`;
        }
    } else if (status === 'Done' && isToday(chore.lastCompleted)) {
        color = 'bg-green-500 text-white shadow-lg';
        label = 'Done today';
    } else if (status === 'Future') {
        color = 'bg-gray-100 text-gray-500 border border-gray-300';
        label = `Due ${format(nextDueDate, 'MMM dd')}`;
    }

    return (
        <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${color}`}>
      {label}
    </span>
    );
};

