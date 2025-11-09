import { useCallback, useEffect, useMemo, useState } from 'react';
import { isToday } from 'date-fns';
import { Calendar, CheckCircle2, Loader2, LogIn, LogOut, RotateCcw, User, Zap } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import type { Chore } from "./models";
import { calculateNextDueDate, getChoreStatus } from "./utils";
import { ChoreCard } from "./components/chore-card";
import { completeChoreApi, fetchChores } from "./notion-api";
import netlifyIdentity from 'netlify-identity-widget';

interface AppState {
    chores: Chore[];
    loading: boolean;
    error: string | null;
}

type AppUser = {
    id: string;
    name: string;
}

const App = () => {
    const [state, setState] = useState<AppState>({
        chores: [],
        loading: false,
        error: null,
    });
    const [isCompletingId, setIsCompletingId] = useState<string | null>(null);

    // Auth state
    const [user, setUser] = useState<netlifyIdentity.User | null>(netlifyIdentity.currentUser());

    // 'Who are you?' state
    const [allUsers, setAllUsers] = useState<AppUser[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // 1. Listen for login/logout events
    useEffect(() => {
        netlifyIdentity.on('login', (user) => {
            setUser(user);
            netlifyIdentity.close();
        });
        netlifyIdentity.on('logout', () => {
            setUser(null);
            setState({ chores: [], loading: false, error: null }); // Clear state on logout
        });
        netlifyIdentity.on('error', (err) => console.error('Netlify Identity Error:', err));

        // Clean up listeners
        return () => {
            netlifyIdentity.off('login');
            netlifyIdentity.off('logout');
            netlifyIdentity.off('error');
        };
    }, []);

    // 2. Initial Data Fetch (depends on user)
    useEffect(() => {
        // Only load chores IF we are logged in
        if (user) {
            const loadChores = async () => {
                setState(prev => ({ ...prev, loading: true, error: null }));
                try {
                    const data = await fetchChores();
                    setState(prev => ({ ...prev, chores: data, loading: false }));

                    // Parse unique users from chores for the dropdown
                    const users = new Map<string, string>();
                    data.forEach(chore => {
                        if (!users.has(chore.assigneeId)) {
                            users.set(chore.assigneeId, chore.assignee);
                        }
                    });

                    const userList: AppUser[] = Array.from(users.entries()).map(([id, name]) => ({ id, name }));
                    setAllUsers(userList);

                    if (userList.length > 0) {
                        setCurrentUserId(userList[0].id); // Default to first user
                    }

                } catch (e) {
                    console.error("Failed to load chores:", e);
                    const errorMessage = e instanceof Error ? e.message : "Failed to load chores.";
                    setState(prev => ({ ...prev, error: errorMessage, loading: false }));
                }
            };
            loadChores();
        }
    }, [user]); // Re-run this effect when the user logs in or out

    // 3. Chore Completion Handler
    const handleCompleteChore = useCallback(async (choreId: string) => {
        if (isCompletingId || !currentUserId) {
            if (!currentUserId) {
                toast.error("Please select a user first.");
            }
            return;
        }

        const choreToComplete = state.chores.find(c => c.id === choreId);
        if (!choreToComplete) {
            return;
        }

        setIsCompletingId(choreId);
        try {
            const updatedChores = await completeChoreApi(
                choreId,
                currentUserId, // Pass the ID from the dropdown
                state.chores
            );
            setState(prev => ({ ...prev, chores: updatedChores }));
            toast.success("Chore completed!");
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : "Failed to complete chore. Please try again.";
            toast.error(errorMessage);
        } finally {
            setIsCompletingId(null);
        }
    }, [state.chores, isCompletingId, currentUserId]);


    // 4. Filtering and Sorting Logic (Memoized)
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
                if (a.status === 'Overdue' && b.status !== 'Overdue') {
                    return -1;
                }
                if (b.status === 'Overdue' && a.status !== 'Overdue') {
                    return 1;
                }
                // Then by next due date
                return a.nextDue.getTime() - b.nextDue.getTime();
            });
        const completedTodayChores = allChoresWithStatus
            .filter(c => c.status === 'Done' && c.lastCompleted && isToday(c.lastCompleted))
            .sort((a, b) => (b.lastCompleted?.getTime() ?? 0) - (a.lastCompleted?.getTime() ?? 0));
        const futureChores = allChoresWithStatus
            .filter(c => c.status === 'Future')
            .sort((a, b) => a.nextDue.getTime() - b.nextDue.getTime());
        return { dueChores, completedTodayChores, futureChores };
    }, [state.chores]);

    // --- RENDER FUNCTION ---

    return (
        <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans w-screen">
            <Toaster
                position="bottom-right"
                toastOptions={{ className: '!rounded-lg !bg-gray-800 !text-white' }}
            />

            <header className="mb-8">
                <div className="flex items-center justify-between">
                    <h1 className="text-3xl font-extrabold tracking-tight flex items-center">
                        <CheckCircle2 className="w-7 h-7 mr-2" /> Chores
                    </h1>
                    <div className="flex items-center gap-2">
                        {user && (
                            <button
                                onClick={() => window.location.reload()}
                                className="text-gray-500 hover:text-indigo-600 transition-colors p-2 rounded-full hover:bg-indigo-50"
                                aria-label="Refresh Data"
                            >
                                <RotateCcw className="w-5 h-5" />
                            </button>
                        )}
                        <button
                            onClick={() => user ? netlifyIdentity.logout() : netlifyIdentity.open()}
                            className="text-gray-500 hover:text-indigo-600 transition-colors p-2 rounded-full hover:bg-indigo-50"
                            aria-label={user ? "Log out" : "Log in"}
                        >
                            {user ? <LogOut className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
                <p className="text-gray-500 mt-1">
                    Chore schedule for the household.
                </p>

                {/* **NEW USER SELECTOR (only show if logged in)** */}
                {user && allUsers.length > 0 && (
                    <div className="mt-6 max-w-sm mx-auto">
                        <label htmlFor="user-select" className="block text-sm font-medium text-gray-700 mb-1">
                            Complete chores as:
                        </label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User className="w-5 h-5 text-gray-400" />
                            </div>
                            <select
                                id="user-select"
                                value={currentUserId || ''}
                                onChange={(e) => setCurrentUserId(e.target.value)}
                                className="block w-full pl-10 pr-4 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
                            >
                                {allUsers.map(user => (
                                    <option key={user.id} value={user.id}>
                                        {user.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                )}
            </header>

            {/* App content */}
            {!user && (
                <div className="text-center py-20">
                    <p className="text-lg text-gray-600">Please log in to see your chores.</p>
                    <button
                        onClick={() => netlifyIdentity.open()}
                        className="mt-4 inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                    >
                        <LogIn className="w-5 h-5 mr-2" />
                        Log In
                    </button>
                </div>
            )}

            {user && (
                <>
                    {state.loading && (
                        <div className="text-center py-20 text-indigo-500">
                            <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                            <p className="text-lg">Loading chores...</p>
                        </div>
                    )}

                    {state.error && (
                        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-lg shadow-md mb-8"
                             role="alert">
                            <p className="font-bold">Data Error</p>
                            <p>{state.error}</p>
                        </div>
                    )}

                    {!state.loading && !state.error && (
                        <main className="space-y-8">
                            {/* Section 1: Due */}
                            <div>
                                <h2 className="text-2xl font-bold mb-4 text-gray-700 flex items-center">
                                    <Zap className="w-6 h-6 mr-2 text-red-500" /> Action required ({dueChores.length})
                                </h2>
                                {dueChores.length === 0 ? (
                                    <div
                                        className="bg-white p-4 rounded-xl text-center text-gray-500 border border-indigo-200 shadow">
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

                            {/* Section 2: Completed */}
                            {completedTodayChores.length > 0 && (
                                <div>
                                    <h2 className="text-2xl font-bold mb-4 text-gray-700 flex items-center">
                                        <CheckCircle2 className="w-6 h-6 mr-2 text-green-600" /> Completed today
                                        ({completedTodayChores.length})
                                    </h2>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 opacity-80">
                                        {completedTodayChores.map(chore => (
                                            <ChoreCard
                                                key={chore.id}
                                                chore={chore}
                                                onComplete={() => {
                                                }}
                                                isCompleting={false}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Section 3: Future */}
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
                                            onComplete={() => {
                                            }}
                                            isCompleting={false}
                                        />
                                    ))}
                                </div>
                            </details>
                        </main>
                    )}
                </>
            )}

            {/* Footer */}
            <footer className="mt-12 text-center text-sm text-gray-400">
                <p>Made with ❤️ by Ollie</p>
            </footer>
        </div>
    );
};

export default App;