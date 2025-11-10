import { calculateNextDueDate, getChoreStatus } from "../utils.ts";
import { formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { Calendar, CheckCircle2, User, Zap } from "lucide-react";
import type { Chore } from "../models.ts";
import { StatusBadge } from "./status-badge.tsx";

type ChoreCardProps = { chore: Chore, onComplete?: (id: string) => void }

export const ChoreCard = ({
                              chore,
                              onComplete
                          }: ChoreCardProps) => {
    const nextDueDate = calculateNextDueDate(chore);
    const status = getChoreStatus(chore, nextDueDate);
    const isActionable = status !== 'Done';

    const borderColor = status === 'Overdue' ? 'border-red-500' :
        status === 'Due' ? 'border-amber-500' :
            'border-green-500';

    const lastCompletedDisplay = chore.lastCompleted ? isToday(chore.lastCompleted)
        ? 'Today'
        : isYesterday(chore.lastCompleted) ? "Yesterday" : formatDistanceToNowStrict(chore.lastCompleted, {
            addSuffix: true,
            unit: 'day'
        }) : 'Never';

    const assigneeNames = chore.assignees.map(a => a.name).join(', ');

    return (
        <div className={`flex flex-col rounded-xl p-4 shadow-xl transition-all duration-300 ease-in-out 
                    ${isActionable ? 'bg-white hover:shadow-2xl border-l-4 ' + borderColor : (status === 'Done' ? 'bg-green-50 border-l-4 border-green-300' : 'bg-gray-100 border-l-4 border-gray-300')} 
                    transform hover:-translate-y-0.5`}>

            {/* Chore Name */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold truncate text-gray-800 flex items-center">
                    {status === 'Overdue' && <Zap className="w-5 h-5 text-red-500 mr-2" />}
                    {status === 'Done' && <CheckCircle2 className="w-5 h-5 text-green-600 mr-2" />}
                    {status === 'Due' && <Calendar className="w-5 h-5 text-amber-500 mr-2" />}
                    <span className={status === 'Done' ? 'line-through text-gray-500' : ''}>
                        {chore.name}
                    </span>
                </h3>
            </div>

            {/* Details (Assignee & Last completed at) */}
            <div className="mt-1 mb-3 text-sm text-gray-600 flex justify-between items-center">
                <p className="flex items-center">
                    <User className="w-4 h-4 mr-1 text-indigo-500" />
                    <span className="font-semibold">{assigneeNames}</span>
                </p>
                <p>
                    Last done: {lastCompletedDisplay}
                </p>
            </div>

            {/* Status Badge and Action Button */}
            <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                <StatusBadge chore={chore} />

                {isActionable && (
                    <button
                        onClick={() => onComplete?.(chore.id)}
                        className={`flex items-center px-4 py-2 text-sm font-semibold rounded-lg transition-colors duration-200
                        bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg cursor-pointer`}
                    >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        Mark done
                    </button>
                )}
                {!isActionable && status === 'Done' && (
                    <div className="text-green-600 text-sm font-semibold flex items-center">
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Completed!
                    </div>
                )}
            </div>
        </div>
    );
};

