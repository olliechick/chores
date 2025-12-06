import { useCallback, useEffect, useMemo, useState } from 'react';
import { isToday } from 'date-fns';
import {
    Calendar,
    CalendarDays,
    CalendarRange,
    CheckCircle2,
    Loader2,
    LogOut,
    Mail,
    RotateCcw,
    User,
    Zap
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import type { Chore, ChoreWithStatus } from "./models";
import { calculateNextDueDate, getChoreStatus } from "./utils";
import { ChoreCard } from "./components/chore-card";
import { completeChoreApi, fetchChores } from "./notion-api";
import { supabase } from "./supabase";
import type { Session } from '@supabase/supabase-js';

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

    const [session, setSession] = useState<Session | null>(null);
    const [authLoading, setAuthLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [isVerifying, setIsVerifying] = useState(false);

    // 'Who are you?' state
    const [allUsers, setAllUsers] = useState<AppUser[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // 1. Auth & Session Management
    useEffect(() => {
        // A. Check for Magic Link callback (token_hash)
        const params = new URLSearchParams(window.location.search);
        const token_hash = params.get("token_hash");
        const type = params.get("type");

        if (token_hash && (type === null || type === '' || type === 'signup' || type === 'invite' || type === 'magiclink' || type === 'recovery' || type === 'email_change' || type === 'email')) {
            setIsVerifying(true);
            supabase.auth.verifyOtp({
                token_hash,
                type: type || "email",
            }).then(({ error }) => {
                setIsVerifying(false);
                if (error) {
                    toast.error("Login link failed or expired.");
                } else {
                    toast.success("Successfully logged in!");
                    // Clean URL
                    window.history.replaceState({}, document.title, "/");
                }
            });
        }

        // B. Check existing session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
        });

        // C. Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (!session) {
                // Clear state on logout
                setState({ chores: [], loading: false, error: null });
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    // 2. Handle Login (Magic Link)
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthLoading(true);
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: window.location.origin,
            },
        });

        setAuthLoading(false);

        if (error) {
            toast.error(error.message);
        } else {
            toast.success("Check your email for the login link!");
            setEmail("");
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
    };


    // 3. Data Fetch (Triggered when session exists)
    useEffect(() => {
        if (session) {
            const loadChores = async () => {
                setState(prev => ({ ...prev, loading: true, error: null }));
                try {
                    const data = await fetchChores();
                    setState(prev => ({ ...prev, chores: data, loading: false }));

                    // Parse unique users from chores for the dropdown
                    const users = new Map<string, string>();
                    data.forEach(chore => {
                        // Loop through each chore's assignees array
                        chore.assignees.forEach(person => {
                            if (!users.has(person.id)) {
                                users.set(person.id, person.name);
                            }
                        });
                    });

                    const userList: AppUser[] = Array.from(users.entries()).map(([id, name]) => ({ id, name }));
                    setAllUsers(userList);

                    // Try to match Supabase email to Notion user
                    const supabaseEmail = session.user.email;
                    // Simple heuristic: Does the Notion name appear in the email?
                    const matchingNotionUser = supabaseEmail
                        ? userList.find(u => supabaseEmail.toLowerCase().includes(u.name.toLowerCase()))
                        : null;
                    if (matchingNotionUser) {
                        // If we find a match, set them as the default
                        setCurrentUserId(matchingNotionUser.id);
                    } else if (userList.length > 0) {
                        // Otherwise, fallback to the first user in the list
                        setCurrentUserId(userList[0].id);
                    }

                } catch (e) {
                    console.error("Failed to load chores:", e);
                    const errorMessage = e instanceof Error ? e.message : "Failed to load chores.";
                    setState(prev => ({ ...prev, error: errorMessage, loading: false }));
                }
            };
            loadChores();
        }
    }, [session]);

    // 4. Chore Completion Handler
    const handleCompleteChore = useCallback((choreId: string) => {
        if (!currentUserId) {
            toast.error("Please select a user first.");
            return;
        }

        const choreToComplete = state.chores.find(c => c.id === choreId);
        if (!choreToComplete) {
            return;
        }

        // 1. Store original state for the undo action
        const originalChores = state.chores;

        // 2. Create and set the optimistic state (mark as done *now*)
        const optimisticChores = originalChores.map(c =>
            c.id === choreId
                ? { ...c, lastCompleted: new Date() }
                : c
        );
        setState(prev => ({ ...prev, chores: optimisticChores }));

        // 3. Schedule the actual API call
        const UNDO_DURATION = 4000; // 4 seconds
        const timerId = setTimeout(() => {
            // Time's up, user didn't undo. Call the API.
            completeChoreApi(choreId, currentUserId)
                .catch((e) => {
                    // API call FAILED! Revert state and show error.
                    console.error("API call failed:", e);
                    const errorMessage = e instanceof Error ? e.message : "Failed to save chore.";
                    toast.error(`Failed to save '${choreToComplete.name}'. ${errorMessage}`);
                    setState(prev => ({ ...prev, chores: originalChores }));
                });
        }, UNDO_DURATION);

        // 4. Show the toast with an undo button
        toast.success(
            (t) => (
                <div className="flex items-center justify-between w-full">
                    <span className="mr-4">Chore completed!</span>
                    <button
                        className="px-3 py-1 text-sm font-semibold text-indigo-600 bg-white rounded-md shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                        onClick={() => {
                            clearTimeout(timerId); // Cancel the pending API call
                            setState(prev => ({ ...prev, chores: originalChores })); // Revert state
                            toast.dismiss(t.id); // Close this toast
                        }}
                    >
                        Undo
                    </button>
                </div>
            ),
            { duration: UNDO_DURATION }
        );
    }, [state.chores, currentUserId]);


    // 5. Filtering and Sorting Logic
    const { dueChores, completedTodayChores, nextWeekChores, nextMonthChores, farFutureChores } = useMemo(() => {
        const allChoresWithStatus: ChoreWithStatus[] = state.chores.map(chore => {
            const nextDue = calculateNextDueDate(chore);
            return {
                ...chore,
                status: getChoreStatus(chore, nextDue),
                nextDue: nextDue,
            };
        });

        // --- Sorters ---

        /** Sorts "mine" > "others", then by due date */
        const futureSorter = (a: ChoreWithStatus, b: ChoreWithStatus) => {
            const aIsMine = a.assignees.some(user => user.id === currentUserId);
            const bIsMine = b.assignees.some(user => user.id === currentUserId);

            // 1. Prioritize "My" chores
            if (aIsMine && !bIsMine) {
                return -1;
            }
            if (!aIsMine && bIsMine) {
                return 1;
            }

            // 2. If both are "mine" or both are "not mine", sort by due date
            return a.nextDue.getTime() - b.nextDue.getTime();
        };

        /** Sorts "mine" > "others", then "Overdue" > "Due", then by due date */
        const dueSorter = (a: ChoreWithStatus, b: ChoreWithStatus) => {
            const aIsMine = a.assignees.some(user => user.id === currentUserId);
            const bIsMine = b.assignees.some(user => user.id === currentUserId);

            // 1. Prioritize "My" chores
            if (aIsMine && !bIsMine) {
                return -1;
            }
            if (!aIsMine && bIsMine) {
                return 1;
            }

            // 2. Both are "mine" or "not mine". Now, sort by Overdue.
            if (a.status === 'Overdue' && b.status !== 'Overdue') {
                return -1;
            }
            if (b.status === 'Overdue' && a.status !== 'Overdue') {
                return 1;
            }

            // 3. Status is the same (both Overdue or both Due). Sort by date.
            return a.nextDue.getTime() - b.nextDue.getTime();
        };

        // --- Separate based on status ---
        const dueChores = allChoresWithStatus
            .filter(c => (c.status === 'Due' || c.status === 'Overdue'))
            .sort(dueSorter);

        const completedTodayChores = allChoresWithStatus
            .filter(c => c.status === 'Done' && c.lastCompleted && isToday(c.lastCompleted))
            .sort((a, b) => (b.lastCompleted?.getTime() ?? 0) - (a.lastCompleted?.getTime() ?? 0));

        const nextWeekChores = allChoresWithStatus
            .filter(c => c.status === 'NextWeek')
            .sort(futureSorter);

        const nextMonthChores = allChoresWithStatus
            .filter(c => c.status === 'NextMonth')
            .sort(futureSorter);

        const farFutureChores = allChoresWithStatus
            .filter(c => c.status === 'FarFuture')
            .sort(futureSorter);

        return { dueChores, completedTodayChores, nextWeekChores, nextMonthChores, farFutureChores };
    }, [state.chores, currentUserId]);

    // --- RENDER ---

    if (isVerifying) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                <h2 className="text-xl font-semibold text-gray-700">Verifying login link…</h2>
            </div>
        );
    }

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

                    {session && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => window.location.reload()}
                                className="text-gray-500 hover:text-indigo-600 transition-colors p-2 rounded-full hover:bg-indigo-50"
                                aria-label="Refresh Data"
                            >
                                <RotateCcw className="w-5 h-5" />
                            </button>
                            <button
                                onClick={handleLogout}
                                className="text-gray-500 hover:text-indigo-600 transition-colors p-2 rounded-full hover:bg-indigo-50"
                                aria-label="Log out"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>
                <p className="text-gray-500 mt-1">
                    Chore schedule for the household.
                </p>

                {/* Notion User Selector */}
                {session && allUsers.length > 0 && (
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

            {/* Login Form (Shown when no session) */}
            {!session && (
                <div className="max-w-md mx-auto mt-12 bg-white p-8 rounded-xl shadow-lg border border-gray-100">
                    <div className="text-center mb-6">
                        <Mail className="w-12 h-12 text-indigo-600 mx-auto mb-2" />
                        <h2 className="text-2xl font-bold text-gray-900">Sign in</h2>
                        <p className="text-gray-500">Enter your email to receive a magic link</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label htmlFor="email" className="sr-only">Email address</label>
                            <input
                                id="email"
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="appearance-none rounded-lg relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                placeholder="Email address"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={authLoading}
                            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {authLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                "Send magic link"
                            )}
                        </button>
                    </form>
                </div>
            )}

            {/* Main App Content (Shown when session exists) */}
            {session && (
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
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {completedTodayChores.map(chore => (
                                            <ChoreCard
                                                key={chore.id}
                                                chore={chore}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Section 3: Next Week */}
                            {nextWeekChores.length > 0 && (
                                <div>
                                    <h2 className="text-2xl font-bold mb-4 text-gray-700 flex items-center">
                                        <CalendarDays className="w-6 h-6 mr-2 text-blue-500" />
                                        Next 7 days ({nextWeekChores.length})
                                    </h2>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {nextWeekChores.map(chore => (
                                            <ChoreCard
                                                key={chore.id}
                                                chore={chore}
                                                onComplete={handleCompleteChore}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Section 4: Next Month */}
                            {nextMonthChores.length > 0 && (
                                <div>
                                    <h2 className="text-2xl font-bold mb-4 text-gray-700 flex items-center">
                                        <CalendarRange className="w-6 h-6 mr-2 text-purple-500" />
                                        Next 30 days ({nextMonthChores.length})
                                    </h2>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {nextMonthChores.map(chore => (
                                            <ChoreCard
                                                key={chore.id}
                                                chore={chore}
                                                onComplete={handleCompleteChore}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Section 5: Far Future */}
                            {farFutureChores.length > 0 && (
                                <div>
                                    <h2 className="text-2xl font-bold mb-4 text-gray-700 flex items-center">
                                        <Calendar className="w-6 h-6 mr-2 text-gray-400" />
                                        Far future ({farFutureChores.length})
                                    </h2>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {farFutureChores.map(chore => (
                                            <ChoreCard
                                                key={chore.id}
                                                chore={chore}
                                                onComplete={handleCompleteChore}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
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