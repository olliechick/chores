import { useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Trash2, TreePalm, X } from 'lucide-react';
import type { Holiday } from "../models";
import { createHolidayApi, deleteHolidayApi } from "../notion-api";

type HolidayModalProps = {
    holidays: Holiday[];
    onClose: () => void;
    onSaved: () => Promise<void>;
};

const toISODate = (d: Date) => d.toISOString().split('T')[0];

export const HolidayModal = ({ holidays, onClose, onSaved }: HolidayModalProps) => {
    const [name, setName] = useState("");
    const [start, setStart] = useState(toISODate(new Date()));
    const [end, setEnd] = useState(toISODate(new Date()));
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const inputClass = `w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 ${
        error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'
    }`;

    const handleAdd = async () => {
        setError(null);

        if (!name.trim()) {
            setError("Please enter a name.");
            return;
        }
        if (!start || !end) {
            setError("Please choose a start and end date.");
            return;
        }
        if (end < start) {
            setError("End must be on or after start.");
            return;
        }

        setSaving(true);
        try {
            await createHolidayApi({ name: name.trim(), start, end });
            await onSaved();
        } catch (e) {
            console.error("Failed to create holiday:", e);
            const errorMessage = e instanceof Error ? e.message : "Failed to create holiday.";
            setError(errorMessage);
            setSaving(false);
        }
    };

    const handleDelete = async (holiday: Holiday) => {
        setDeletingId(holiday.id);
        try {
            await deleteHolidayApi(holiday.id);
            await onSaved();
        } catch (e) {
            console.error("Failed to delete holiday:", e);
            toastError(e);
            setDeletingId(null);
        }
    };

    const toastError = (e: unknown) => {
        const errorMessage = e instanceof Error ? e.message : "Failed to delete holiday.";
        setError(errorMessage);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center">
                        <TreePalm className="w-5 h-5 mr-2 text-emerald-500" />
                        Holidays
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="holiday-name">
                            Name
                        </label>
                        <input
                            id="holiday-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Ski trip"
                            className={inputClass}
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="holiday-start">
                                Start
                            </label>
                            <input
                                id="holiday-start"
                                type="date"
                                value={start}
                                onChange={(e) => setStart(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="holiday-end">
                                End
                            </label>
                            <input
                                id="holiday-end"
                                type="date"
                                value={end}
                                onChange={(e) => setEnd(e.target.value)}
                                className={inputClass}
                            />
                        </div>
                    </div>

                    <p className="text-xs text-gray-400">
                        Chores marked "Pause on holiday" skip their due date while a holiday is happening.
                    </p>

                    <button
                        onClick={handleAdd}
                        disabled={saving}
                        className="w-full px-4 py-2 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {saving ? 'Adding...' : 'Add holiday'}
                    </button>

                    {error && (
                        <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm">
                            {error}
                        </div>
                    )}

                    {holidays.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Holidays</p>
                            <ul className="space-y-2">
                                {holidays.map(holiday => (
                                    <li
                                        key={holiday.id}
                                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-gray-700 truncate">{holiday.name}</p>
                                            <p className="text-xs text-gray-500">
                                                {format(holiday.start, 'd MMM yyyy')} – {format(holiday.end, 'd MMM yyyy')}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleDelete(holiday)}
                                            disabled={deletingId === holiday.id}
                                            className="text-gray-400 hover:text-red-600 transition-colors p-1 rounded-full hover:bg-red-50 disabled:opacity-50 shrink-0"
                                            aria-label={`Delete ${holiday.name}`}
                                        >
                                            {deletingId === holiday.id
                                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                                : <Trash2 className="w-4 h-4" />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};