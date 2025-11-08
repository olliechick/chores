import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { format, isToday, isTomorrow, isPast, isFuture, startOfToday, addDays, getDay } from 'date-fns';
import { RotateCcw, CheckCircle2, Loader2, Calendar, LayoutGrid, Zap, User } from 'lucide-react';
import type {Chore} from "./models.ts";
import {calculateNextDueDate, getChoreStatus} from "./utils.ts";
import {StatusBadge} from "./components/status-badge.tsx";
import {ChoreCard} from "./components/chore-card.tsx";

// --- TYPES & MOCK DATA ---

// Define the structure for the App State
interface AppState {
    chores: Chore[];
    loading: boolean;
    error: string | null;
}

// Mock Data for the application (This will be replaced by Notion later)
const mockInitialChores: Chore[] = [
    { id: '1', name: 'Wash Dishes', assignee: 'Ollie', schedule: 'Daily', lastCompleted: startOfToday() },
    { id: '2', name: 'Vacuum Living Room', assignee: 'Rosie', schedule: 'Weekly', lastCompleted: addDays(startOfToday(), -4) },
    { id: '3', name: 'Mop Kitchen Floor', assignee: 'Ollie', schedule: 'Weekly', lastCompleted: addDays(startOfToday(), -2) },
    { id: '4', name: 'Clean Bathroom', assignee: 'Rosie', schedule: 'BiWeekly', lastCompleted: addDays(startOfToday(), -15) },
    { id: '5', name: 'Take Out Trash', assignee: 'Rosie', schedule: 'Daily', lastCompleted: addDays(startOfToday(), -1) },
];

// --- FAKE API FUNCTIONS (To be replaced with Notion API calls) ---

const fetchChores = async (): Promise<Chore[]> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    return mockInitialChores;
};

const completeChoreApi = async (choreId: string, currentChores: Chore[]): Promise<Chore[]> => {
    // Simulate API delay, and Notion API call to create a new entry in the Chore Log database
    await new Promise(resolve => setTimeout(resolve, 300));

    // In the mock, we simulate the Notion Rollup property updating 'lastCompleted'
    return currentChores.map(c =>
        c.id === choreId
            ? { ...c, lastCompleted: new Date() }
            : c
    );
};

// --- CORE LOGIC & SCHEDULING ---

// --- REACT COMPONENTS ---

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
    const [state, setState] = useState<AppState>({
        chores: [],
        loading: true,
        error: null,
    });
    const [isCompletingId, setIsCompletingId] = useState<string | null>(null);

    // 1. Initial Data Fetch (or Mock Fetch)
    useEffect(() => {
        const loadChores = async () => {
            try {
                const data = await fetchChores();
                setState(prev => ({ ...prev, chores: data, loading: false }));
            } catch (e) {
                console.error("Failed to load chores:", e);
                setState(prev => ({ ...prev, error: "Failed to load chores. Check Notion connection.", loading: false }));
            }
        };
        loadChores();
    }, []);

    // 2. Chore Completion Handler
    const handleCompleteChore = useCallback(async (choreId: string) => {
        if (isCompletingId) return; // Prevent multiple clicks

        setIsCompletingId(choreId);
        try {
            // API call to Notion Log database
            const updatedChores = await completeChoreApi(choreId, state.chores);
            setState(prev => ({ ...prev, chores: updatedChores }));
        } catch  {
            alert("Failed to complete chore. Please try again.");
        } finally {
            setIsCompletingId(null);
        }
    }, [state.chores, isCompletingId]);


    // 3. Filtering and Sorting Logic (Memoized)
    const { dueChores, completedTodayChores, futureChores } = useMemo(() => {
        const allChoresWithStatus = state.chores.map(chore => {
            const nextDue = calculateNextDueDate(chore);
            return {
                ...chore,
                status: getChoreStatus(chore, nextDue),
                nextDue: nextDue,
            };
        });

        // Separate based on status
        const dueChores = allChoresWithStatus
            .filter(c => (c.status === 'Due' || c.status === 'Overdue'))
            .sort((a, b) => {
                // Sort Overdue first
                if (a.status === 'Overdue' && b.status !== 'Overdue') return -1;
                if (b.status === 'Overdue' && a.status !== 'Overdue') return 1;
                // Then by next due date
                return a.nextDue.getTime() - b.nextDue.getTime();
            });

        const completedTodayChores = allChoresWithStatus
            .filter(c => c.status === 'Done' && isToday(c.lastCompleted))
            .sort((a, b) => b.lastCompleted.getTime() - a.lastCompleted.getTime()); // Sort newest first

        const futureChores = allChoresWithStatus
            .filter(c => c.status === 'Future')
            .sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime());

        return { dueChores, completedTodayChores, futureChores };
    }, [state.chores]);

    // --- RENDER FUNCTION ---

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans w-screen">

            {/* Header */}
            <header className="mb-8">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-extrabold  tracking-tight flex items-center">
                        <CheckCircle2 className="w-7 h-7 mr-2" /> Chores
                    </h1>
                    <button
                        onClick={() => window.location.reload()}
                        className="text-gray-500 hover:text-indigo-600 transition-colors p-2 rounded-full hover:bg-indigo-50"
                        aria-label="Refresh Data"
                    >
                        <RotateCcw className="w-5 h-5" />
                    </button>
                </div>
                <p className="text-gray-500 mt-1">
                    Chore schedule for the household.
                </p>
            </header>

            {/* Loading & Error States */}
            {state.loading && (
                <div className="text-center py-20 text-indigo-500">
                    <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                    <p className="text-lg">Loading chores...</p>
                </div>
            )}

            {state.error && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg shadow-md mb-8" role="alert">
                    <p className="font-bold">Data Error</p>
                    <p>{state.error}</p>
                </div>
            )}

            {!state.loading && !state.error && (
                <main className="space-y-8">

                    {/* Section 1: Chores Due Today/Overdue */}
                    <div>
                        <h2 className="text-2xl font-bold mb-4 text-gray-700 flex items-center">
                            <Zap className="w-6 h-6 mr-2 text-red-500" /> Action required ({dueChores.length})
                        </h2>
                        {dueChores.length === 0 ? (
                            <div className="bg-white p-4 rounded-xl text-center text-gray-500 border border-indigo-200 shadow">
                                <p>🎉 All chores are up-to-date! Great job!</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {dueChores.map(chore => (
                                    <ChoreCard
                                        key={chore.id}
                                        chore={chore}
                                        onComplete={handleCompleteChore}
                                        isCompleting={isCompletingId === chore.id}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Section 2: Completed Today */}
                    {completedTodayChores.length > 0 && (
                        <div>
                            <h2 className="text-2xl font-bold mb-4 text-gray-700 flex items-center">
                                <CheckCircle2 className="w-6 h-6 mr-2 text-green-600" /> Completed today ({completedTodayChores.length})
                            </h2>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 opacity-80">
                                {completedTodayChores.map(chore => (
                                    <ChoreCard
                                        key={chore.id}
                                        chore={chore}
                                        onComplete={() => {}} // No action needed on completed
                                        isCompleting={false}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Section 3: Future Schedule */}
                    <details className="p-4 bg-white rounded-xl shadow border border-gray-100 cursor-pointer">
                        <summary className="text-xl font-bold text-gray-600 flex items-center">
                            <Calendar className="w-5 h-5 mr-2 text-gray-400" />
                            Future schedule ({futureChores.length})
                        </summary>
                        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 opacity-70">
                            {futureChores.map(chore => (
                                <ChoreCard
                                    key={chore.id}
                                    chore={chore}
                                    onComplete={() => {}}
                                    isCompleting={false}
                                />
                            ))}
                        </div>
                    </details>

                </main>
            )}

            {/* Footer / Status Bar */}
            <footer className="mt-12 text-center text-sm text-gray-400">
                <p>Made with ❤️ by Ollie</p>
            </footer>
        </div>
    );
};

export default App;