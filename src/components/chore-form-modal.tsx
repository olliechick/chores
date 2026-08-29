import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import type { AppUser, Chore } from "../models";
import { createChoreApi, fetchRoomOptions, updateChoreApi } from "../notion-api";

type ChoreFormModalProps = {
    chore: Chore | null;
    allUsers: AppUser[];
    currentUserId: string | null;
    onClose: () => void;
    onSaved: () => Promise<void>;
};

const FREQUENCY_PRESETS: { label: string; days: number }[] = [
    { label: 'Daily', days: 1 },
    { label: 'Weekly', days: 7 },
    { label: 'Fortnightly', days: 14 },
    { label: 'Monthly', days: 30 },
];

export const ChoreFormModal = ({ chore, allUsers, currentUserId, onClose, onSaved }: ChoreFormModalProps) => {
    const isEdit = chore !== null;

    const [name, setName] = useState(chore?.name ?? "");
    const [assigneeIds, setAssigneeIds] = useState<string[]>(chore ? chore.assignees.map(a => a.id) : (currentUserId ? [currentUserId] : []));
    const [days, setDays] = useState<number>(chore?.schedule ?? 7);
    const [room, setRoom] = useState(chore?.room ?? "");
    const [important, setImportant] = useState(chore?.important ?? false);
    const [searchTerms, setSearchTerms] = useState(chore?.searchTerms ?? "");
    const [lastDone, setLastDone] = useState("");

    const [rooms, setRooms] = useState<string[]>([]);
    const [roomsLoading, setRoomsLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        fetchRoomOptions()
            .then(roomOptions => {
                if (!cancelled) setRooms(roomOptions);
            })
            .catch(e => {
                console.error("Failed to load room options:", e);
            })
            .finally(() => {
                if (!cancelled) setRoomsLoading(false);
            });
        return () => { cancelled = true; };
    }, []);

    const toggleAssignee = (id: string) => {
        setAssigneeIds(prev =>
            prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]
        );
    };

    const handleSubmit = async () => {
        setError(null);

        if (!name.trim()) {
            setError("Please enter a name.");
            return;
        }
        if (assigneeIds.length === 0) {
            setError("Please select at least one person.");
            return;
        }
        if (!Number.isInteger(days) || days < 1) {
            setError("Days must be a positive whole number.");
            return;
        }

        setSaving(true);
        try {
            if (chore) {
                await updateChoreApi(chore.id, {
                    name: name.trim(),
                    assignees: assigneeIds,
                    days,
                    room: room || undefined,
                    important,
                    searchTerms: searchTerms.trim() || undefined,
                });
            } else {
                await createChoreApi({
                    name: name.trim(),
                    assignees: assigneeIds,
                    days,
                    room: room || undefined,
                    important,
                    searchTerms: searchTerms.trim() || undefined,
                    lastDone: lastDone || undefined,
                    completedById: lastDone && currentUserId ? currentUserId : undefined,
                });
            }
            await onSaved();
        } catch (e) {
            console.error("Failed to save chore:", e);
            const errorMessage = e instanceof Error ? e.message : "Failed to save chore.";
            setError(errorMessage);
            setSaving(false);
        }
    };

    const inputClass = `w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 ${
        error ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'
    }`;

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
                    <h3 className="text-lg font-bold text-gray-800">{isEdit ? "Edit chore" : "New chore"}</h3>
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
                        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="chore-name">
                            Name
                        </label>
                        <input
                            id="chore-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Wash dishes"
                            className={inputClass}
                            autoFocus
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Assigned to</label>
                        {allUsers.length === 0 ? (
                            <p className="text-sm text-gray-400">No people found.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {allUsers.map(user => (
                                    <button
                                        key={user.id}
                                        type="button"
                                        onClick={() => toggleAssignee(user.id)}
                                        className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-colors cursor-pointer ${
                                            assigneeIds.includes(user.id)
                                                ? 'bg-indigo-600 text-white border-indigo-600'
                                                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                        }`}
                                    >
                                        {user.name}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="chore-days">
                            Frequency (every N days)
                        </label>
                        <input
                            id="chore-days"
                            type="number"
                            min={1}
                            step={1}
                            value={days}
                            onChange={(e) => setDays(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                            className={inputClass}
                        />
                        <div className="flex flex-wrap gap-2 mt-2">
                            {FREQUENCY_PRESETS.map(preset => (
                                <button
                                    key={preset.days}
                                    type="button"
                                    onClick={() => setDays(preset.days)}
                                    className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors cursor-pointer ${
                                        days === preset.days
                                            ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                                            : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                                    }`}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {!isEdit && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="chore-last-done">
                                Last done (optional)
                            </label>
                            <input
                                id="chore-last-done"
                                type="date"
                                value={lastDone}
                                onChange={(e) => setLastDone(e.target.value)}
                                className={inputClass}
                            />
                            <p className="text-xs text-gray-400 mt-1">If set, a history entry is created for this date.</p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="chore-room">
                            Room
                        </label>
                        {roomsLoading ? (
                            <input
                                id="chore-room"
                                type="text"
                                className={inputClass}
                                placeholder="Loading rooms..."
                                disabled
                            />
                        ) : (
                            <select
                                id="chore-room"
                                value={room}
                                onChange={(e) => setRoom(e.target.value)}
                                className={inputClass}
                            >
                                <option value="">None</option>
                                {rooms.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="chore-search-terms">
                            Search terms
                        </label>
                        <input
                            id="chore-search-terms"
                            type="text"
                            value={searchTerms}
                            onChange={(e) => setSearchTerms(e.target.value)}
                            placeholder="Optional synonyms, e.g. vacuum, hoover"
                            className={inputClass}
                        />
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={important}
                            onChange={(e) => setImportant(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Important</span>
                        <span className="text-xs text-gray-400">Shows under "Action required" when due</span>
                    </label>

                    {error && (
                        <div className="bg-red-50 text-red-700 p-3 rounded-lg border border-red-200 text-sm">
                            {error}
                        </div>
                    )}
                </div>

                <div className="flex gap-3 justify-end p-4 border-t border-gray-100">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {saving ? (isEdit ? 'Saving...' : 'Creating...') : (isEdit ? 'Save' : 'Create')}
                    </button>
                </div>
            </div>
        </div>
    );
};