import { calculateNextDueDate, getChoreStatus } from "../utils.ts";
import { formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { CheckCircle2, ClipboardList, MapPin, Star, User, Zap } from "lucide-react";
import type { Chore } from "../models.ts";
import { StatusBadge } from "./status-badge.tsx";

type ChoreCardProps = { chore: Chore, onRequestComplete?: (id: string) => void, onSelect?: (id: string) => void }

export const ChoreCard = ({
                              chore,
                              onRequestComplete,
                              onSelect
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

    // Helper to determine which icon to show
    const getIcon = () => {
        const baseClass = "w-5 h-5 mr-2 shrink-0";

        // 1. Completed
        if (status === 'Done') {
            return <CheckCircle2 className={`${baseClass} text-green-600`} />;
        }

        // 2. Important Items
        if (chore.important) {
            // If it's specifically Due (today), show Red Zap
            if (status === 'Due' || status === 'Overdue') {
                return <Zap className={`${baseClass} text-red-500`} />;
            }
            // Otherwise (Future, etc), show Amber Star
            return <Star className={`${baseClass} text-amber-500 fill-amber-500`} />;
        }

        // 3. Standard Items
        if (status === 'Due') {
            return <ClipboardList className={`${baseClass} text-amber-500`} />;
        }

        // 4. Fallback for Overdue (Standard)
        // Ensures non-important overdue items still look urgent
        if (status === 'Overdue') {
            return <ClipboardList className={`${baseClass} text-amber-500`} />;
        }

        return null;
    };

    return (
        <div onClick={() => onSelect?.(chore.id)} className={`flex flex-col rounded-xl p-4 shadow-xl transition-all duration-300 ease-in-out cursor-pointer
                 ${isActionable ? 'bg-white hover:shadow-2xl border-l-4 ' + borderColor : (status === 'Done' ? 'bg-green-50 border-l-4 border-green-300' : 'bg-gray-100 border-l-4 border-gray-300')} 
                 transform hover:-translate-y-0.5`}>

            {/* Chore Name */}
            <div className="flex flex-col items-start gap-0.5">
                <h3 className="text-lg font-bold truncate text-gray-800 flex items-center text-left w-full">
                    {getIcon()}

                    <span className={`truncate ${status === 'Done' ? 'line-through text-gray-500' : ''}`}>
                        {chore.name}
                    </span>
                </h3>

                {/* Room */}
                {chore.room && (
                    <p className="flex items-center text-sm">
                        <MapPin className="w-4 h-4 mr-1.5 text-indigo-400" />
                        {chore.room}
                    </p>
                )}
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
                        onClick={(e) => { e.stopPropagation(); onRequestComplete?.(chore.id); }}
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