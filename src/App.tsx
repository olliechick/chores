import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format, formatDistanceToNowStrict, isToday } from 'date-fns';
import {
    Calendar,
    CalendarDays,
    CalendarRange,
    CheckCircle2,
    ClipboardList,
    Clock,
    Loader2,
    LogOut,
    Mail,
    Plus,
    RotateCcw,
    Search,
    Trash2,
    User,
    X,
    Zap
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import type { AppUser, Chore, ChoreLogEntry, ChoreWithStatus } from "./models";
import { calculateNextDueDate, formatSchedule, getChoreStatus } from "./utils";
import { ChoreCard } from "./components/chore-card";
import { NewChoreModal } from "./components/new-chore-modal";
import { completeChoreApi, deleteChoreLogApi, fetchChoreHistory, fetchChores, fetchLogPage } from "./notion-api";
import { supabase } from "./supabase";
import { getLogCache, setLogCache, clearLogCache, buildLastCompletedMap } from "./log-cache";
import type { Session } from '@supabase/supabase-js';

declare const __BUILD_TIME__: string;

interface AppState {
    chores: Chore[];
    loading: boolean;
    error: string | null;
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

    // Whether the initial session check is still in progress (avoids flashing the login form)
    const [checkingSession, setCheckingSession] = useState(true);

    // 'Who are you?' state
    const [allUsers, setAllUsers] = useState<AppUser[]>([]);
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);

    // User menu (header dropdown)
    const [userMenuOpen, setUserMenuOpen] = useState(false);

    // Track whether chores have been fetched to avoid re-fetching on session reference changes
    const choresLoadedRef = useRef(false);

    // Whether log sync is in progress (controls main loading spinner)
    const [logSyncing, setLogSyncing] = useState(false);

    // History modal state
    const [selectedChoreId, setSelectedChoreId] = useState<string | null>(null);
    const [historyEntries, setHistoryEntries] = useState<ChoreLogEntry[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Search state
    const [searchQuery, setSearchQuery] = useState("");

    // New chore modal visibility
    const [showNewChoreModal, setShowNewChoreModal] = useState(false);

    // Mark done confirmation modal
    const [confirmingChoreId, setConfirmingChoreId] = useState<string | null>(null);
    const [confirmDate, setConfirmDate] = useState(() => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    });
    const [saving, setSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

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
            }).then(({ data, error }) => {
                setIsVerifying(false);
                setSession(data.session);
                if (error) {
                    toast.error("Login link failed or expired.");
                } else {
                    toast.success("Successfully logged in!");
                    // Clean URL
                    window.history.replaceState({}, document.title, "/");
                }
            }).finally(() => setCheckingSession(false));
        }

        // B. Check existing session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            // Only mark the check complete here if there's no magic link flow pending
            if (!token_hash) {
                setCheckingSession(false);
            }
        });

        // C. Listen for auth changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (!session) {
                // Clear state on logout
                clearLogCache();
                choresLoadedRef.current = false;
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
        clearLogCache();
        await supabase.auth.signOut();
    };

    // Fetches chores and re-derives the user list + current user.
    const refreshChores = useCallback(async () => {
        setState(prev => ({ ...prev, loading: true, error: null }));
        try {
            const data = await fetchChores();
            setState(prev => ({ ...prev, chores: data, loading: false }));

            // Parse unique users from chores for the menu
            const users = new Map<string, AppUser>();
            data.forEach(chore => {
                // Loop through each chore's assignees array
                chore.assignees.forEach(person => {
                    const existing = users.get(person.id);
                    if (!existing) {
                        users.set(person.id, person);
                    } else if (!existing.fullName && person.fullName) {
                        // Upgrade to a copy with a full name if we found one
                        users.set(person.id, { ...person });
                    }
                });
            });

            const userList: AppUser[] = Array.from(users.values());
            setAllUsers(userList);

            // Try to match Supabase email to Notion user
            const supabaseEmail = session?.user.email;
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
    }, [session?.user.email]);

    const handleChoreCreated = useCallback(async () => {
        await refreshChores();
        setShowNewChoreModal(false);
        toast.success("Chore created!");
    }, [refreshChores]);

    // 3. Data Fetch (Triggered when session exists, but only once)
    useEffect(() => {
        if (session && !choresLoadedRef.current) {
            choresLoadedRef.current = true;
            refreshChores();
        }
    }, [session, refreshChores]);

    // 3b. Background log sync (runs after chores load — always full rebuild)
    useEffect(() => {
        if (!session || state.chores.length === 0) return;

        let cancelled = false;

        const syncLog = async () => {
            setLogSyncing(true);

            try {
                let allEntries: { choreId: string; date: string }[] = [];
                let hasMore = true;
                let cursor: string | undefined;

                while (hasMore) {
                    if (cancelled) return;
                    const page = await fetchLogPage(undefined, cursor);

                    allEntries = allEntries.concat(page.entries);

                    hasMore = page.has_more;
                    cursor = page.next_cursor ?? undefined;
                }

                setLogCache({
                    entries: allEntries,
                    lastSyncedAt: new Date().toISOString(),
                });

                if (cancelled) return;

                // Override lastCompleted: take most recent of (rollup, log)
                const logMap = buildLastCompletedMap(allEntries);
                setState(prev => {
                    const overridden = prev.chores.map(c => {
                        const logDate = logMap.get(c.id);
                        if (logDate && (!c.lastCompleted || logDate > c.lastCompleted)) {
                            return { ...c, lastCompleted: logDate };
                        }
                        return c;
                    });
                    return { ...prev, chores: overridden };
                });
            } catch (e) {
                console.warn("Log sync failed, using rollup fallback:", e);
            } finally {
                if (!cancelled) setLogSyncing(false);
            }
        };

        syncLog();
        return () => { cancelled = true; };
    }, [session, state.chores.length > 0]);

    // 3c. Fetch chore history when a chore is selected
    useEffect(() => {
        if (!selectedChoreId) {
            setHistoryEntries([]);
            return;
        }

        let cancelled = false;
        setHistoryLoading(true);

        fetchChoreHistory(selectedChoreId)
            .then(entries => {
                if (!cancelled) {
                    setHistoryEntries(entries);
                    setHistoryLoading(false);
                }
            })
            .catch(e => {
                console.error("Failed to fetch chore history:", e);
                if (!cancelled) {
                    setHistoryLoading(false);
                    toast.error("Failed to load history.");
                }
            });

        return () => { cancelled = true; };
    }, [selectedChoreId]);

    // 4. Chore Completion Handler
    const handleCompleteChore = useCallback(async (choreId: string, date?: string) => {
        if (!currentUserId) {
            toast.error("Please select a user first.");
            return;
        }

        const choreToComplete = state.chores.find(c => c.id === choreId);
        if (!choreToComplete) {
            return;
        }

        try {
            await completeChoreApi(choreId, currentUserId, date);
            const completedDate = date ? new Date(`${date}T00:00:00`) : new Date();
            const dateStr = date || completedDate.toISOString().split('T')[0];

            setState(prev => ({
                ...prev,
                chores: prev.chores.map(c =>
                    c.id === choreId ? { ...c, lastCompleted: completedDate } : c
                ),
            }));

            // Update log cache
            const cache = getLogCache();
            if (cache) {
                cache.entries.push({ choreId, date: dateStr });
                cache.lastSyncedAt = new Date().toISOString();
                setLogCache(cache);
            }

            toast.success("Chore completed!");
        } catch (e) {
            console.error("API call failed:", e);
            const errorMessage = e instanceof Error ? e.message : "Failed to save chore.";
            toast.error(`Failed to save '${choreToComplete.name}'. ${errorMessage}`);
        }
    }, [state.chores, currentUserId]);

    // 4b. Delete log entry handler
    const handleDeleteLogEntry = useCallback(async (pageId: string, choreId: string) => {
        setDeletingId(pageId);
        try {
            await deleteChoreLogApi(pageId);
            setHistoryEntries(prev => {
                const remaining = prev.filter(e => e.id !== pageId);
                const newLastCompleted = remaining.length > 0
                    ? remaining.reduce((latest, e) => e.date > latest ? e.date : latest, remaining[0].date)
                    : null;
                setState(s => ({
                    ...s,
                    chores: s.chores.map(c =>
                        c.id === choreId ? { ...c, lastCompleted: newLastCompleted } : c
                    ),
                }));
                return remaining;
            });
            toast.success("Entry deleted.");
        } catch (e) {
            console.error("Failed to delete log entry:", e);
            toast.error("Failed to delete entry.");
        } finally {
            setDeletingId(null);
        }
    }, []);


    // 5. Filtering and Sorting Logic
    const {
        importantDueChores,
        standardDueChores,
        completedTodayChores,
        nextWeekChores,
        nextMonthChores,
        farFutureChores
    } = useMemo(() => {
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

        const allDue = allChoresWithStatus
            .filter(c => (c.status === 'Due' || c.status === 'Overdue'))
            .sort(dueSorter);

        const importantDueChores = allDue.filter(c => c.important);
        const standardDueChores = allDue.filter(c => !c.important);

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

        return {
            importantDueChores,
            standardDueChores,
            completedTodayChores,
            nextWeekChores,
            nextMonthChores,
            farFutureChores
        };
    }, [state.chores, currentUserId]);

    // Apply search filter to all categories
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch = q === '' ? () => true : (c: Chore) =>
        c.name.toLowerCase().includes(q) ||
        c.room?.toLowerCase().includes(q) ||
        c.searchTerms.toLowerCase().includes(q) ||
        c.assignees.some(a => a.name.toLowerCase().includes(q));

    const filteredImportantDue = importantDueChores.filter(matchesSearch);
    const filteredStandardDue = standardDueChores.filter(matchesSearch);
    const filteredCompletedToday = completedTodayChores.filter(matchesSearch);
    const filteredNextWeek = nextWeekChores.filter(matchesSearch);
    const filteredNextMonth = nextMonthChores.filter(matchesSearch);
    const filteredFarFuture = farFutureChores.filter(matchesSearch);

    // Current user for the menu header
    const currentUser = allUsers.find(u => u.id === currentUserId) ?? null;

    // Renders an avatar image or a fallback initial
    const avatarFor = (user: AppUser) => (
        user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
        ) : (
            <span className="w-full h-full flex items-center justify-center text-xs font-bold text-indigo-600 bg-indigo-100">
                {user.name.charAt(0).toUpperCase()}
            </span>
        )
    );

    // Renders the avatar for the collapsed menu button
    const userMenuAvatar = (user: AppUser | null) => (
        user ? (
            user.avatarUrl ? (
                <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
            ) : (
                <div className="w-full h-full bg-indigo-600 text-white flex items-center justify-center font-semibold text-sm">
                    {user.name.charAt(0).toUpperCase()}
                </div>
            )
        ) : (
            <div className="w-full h-full bg-indigo-600 text-white flex items-center justify-center">
                <User className="w-5 h-5" />
            </div>
        )
    );

    // --- RENDER ---

    if (isVerifying) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                <h2 className="text-xl font-semibold text-gray-700">Verifying login link…</h2>
            </div>
        );
    }

    if (checkingSession) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
                <h2 className="text-xl font-semibold text-gray-700">Loading…</h2>
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
                                onClick={() => setShowNewChoreModal(true)}
                                className="text-gray-400 hover:text-indigo-600 transition-colors p-2 rounded-full hover:bg-indigo-50"
                                aria-label="Add new chore"
                            >
                                <Plus className="w-5 h-5" />
                            </button>

                            <button
                                onClick={() => window.location.reload()}
                                className="text-gray-500 hover:text-indigo-600 transition-colors p-2 rounded-full hover:bg-indigo-50"
                                aria-label="Refresh Data"
                            >
                                <RotateCcw className="w-5 h-5" />
                            </button>

                            <div className="relative">
                                <button
                                    onClick={() => setUserMenuOpen(o => !o)}
                                    className="w-10 h-10 rounded-full overflow-hidden ring-2 ring-indigo-200 hover:ring-indigo-400 transition-all focus:outline-none cursor-pointer"
                                    aria-label="User menu"
                                >
                                    {userMenuAvatar(currentUser)}
                                </button>

                                {userMenuOpen && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-30"
                                            onClick={() => setUserMenuOpen(false)}
                                        />
                                        <div className="absolute right-0 z-40 mt-2 w-60 bg-white rounded-xl shadow-2xl border border-gray-100 py-2">
                                            <div className="px-4 py-2 border-b border-gray-100">
                                                <p className="font-semibold text-gray-800 truncate">{currentUser?.fullName ?? currentUser?.name}</p>
                                            </div>
                                            <div className="py-1">
                                                {allUsers.map(user => (
                                                    <button
                                                        key={user.id}
                                                        onClick={() => { setCurrentUserId(user.id); setUserMenuOpen(false); }}
                                                        className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition-colors cursor-pointer ${user.id === currentUserId
                                                            ? 'bg-indigo-50 text-indigo-700 font-semibold'
                                                            : 'text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <span className="w-6 h-6 rounded-full overflow-hidden shrink-0 bg-indigo-100 flex items-center justify-center text-[10px] font-bold text-indigo-600">
                                                            {avatarFor(user)}
                                                        </span>
                                                        <span className="truncate">{user.name}</span>
                                                        {user.id === currentUserId && (
                                                            <CheckCircle2 className="w-4 h-4 text-indigo-600 ml-auto shrink-0" />
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="border-t border-gray-100 pt-1">
                                                <button
                                                    onClick={handleLogout}
                                                    className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                                >
                                                    <LogOut className="w-4 h-4" />
                                                    Log out
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Search + User Selector */}
                {session && (
                    <div className="mt-4 flex flex-col gap-3 max-w-sm mx-auto">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Search className="w-5 h-5 text-gray-400" />
                            </div>
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="block w-full pl-10 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md shadow-sm"
                                placeholder="Search chores..."
                            />
                            {searchQuery && (
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
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
                    {(state.loading || logSyncing) && (
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

                    {!state.loading && !logSyncing && !state.error && (
                        <main className="space-y-8">

                            {filteredImportantDue.length === 0 &&
                             filteredStandardDue.length === 0 &&
                             filteredCompletedToday.length === 0 &&
                             filteredNextWeek.length === 0 &&
                             filteredNextMonth.length === 0 &&
                             filteredFarFuture.length === 0 && (
                                <div className="text-center py-16 text-gray-400">
                                    {searchQuery ? (
                                        <>
                                            <Search className="w-10 h-10 mx-auto mb-3 opacity-40" />
                                            <p className="text-lg">No chores match "{searchQuery}"</p>
                                            <p className="text-sm mt-1">Try a different search term</p>
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
                                            <p className="text-lg">All caught up! No chores to show.</p>
                                        </>
                                    )}
                                </div>
                            )}

                            {filteredImportantDue.length > 0 && (
                                <div>
                                    <h2 className="text-2xl font-bold mb-4 text-gray-800 flex items-center">
                                        <Zap className="w-6 h-6 mr-2 text-red-500 fill-red-500" />
                                        Action required ({filteredImportantDue.length})
                                    </h2>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {filteredImportantDue.map(chore => (
                                            <ChoreCard
                                                key={chore.id}
                                                chore={chore}
                                                onRequestComplete={(id) => { setConfirmingChoreId(id); setConfirmDate(new Date().toISOString().split('T')[0]); }}
                                                onSelect={setSelectedChoreId}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {filteredStandardDue.length > 0 && (
                                <div>
                                    <h2 className="text-2xl font-bold mb-4 text-gray-700 flex items-center">
                                        <ClipboardList className="w-6 h-6 mr-2 text-amber-500" />
                                        Tasks due ({filteredStandardDue.length})
                                    </h2>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {filteredStandardDue.map(chore => (
                                            <ChoreCard
                                                key={chore.id}
                                                chore={chore}
                                                onRequestComplete={(id) => { setConfirmingChoreId(id); setConfirmDate(new Date().toISOString().split('T')[0]); }}
                                                onSelect={setSelectedChoreId}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {filteredCompletedToday.length > 0 && (
                                <div>
                                    <h2 className="text-2xl font-bold mb-4 text-gray-700 flex items-center">
                                        <CheckCircle2 className="w-6 h-6 mr-2 text-green-600" /> Completed today
                                        ({filteredCompletedToday.length})
                                    </h2>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {filteredCompletedToday.map(chore => (
                                            <ChoreCard
                                                key={chore.id}
                                                chore={chore}
                                                onSelect={setSelectedChoreId}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {filteredNextWeek.length > 0 && (
                                <div>
                                    <h2 className="text-2xl font-bold mb-4 text-gray-700 flex items-center">
                                        <CalendarDays className="w-6 h-6 mr-2 text-blue-500" />
                                        Next 7 days ({filteredNextWeek.length})
                                    </h2>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {filteredNextWeek.map(chore => (
                                            <ChoreCard
                                                key={chore.id}
                                                chore={chore}
                                                onRequestComplete={(id) => { setConfirmingChoreId(id); setConfirmDate(new Date().toISOString().split('T')[0]); }}
                                                onSelect={setSelectedChoreId}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {filteredNextMonth.length > 0 && (
                                <div>
                                    <h2 className="text-2xl font-bold mb-4 text-gray-700 flex items-center">
                                        <CalendarRange className="w-6 h-6 mr-2 text-purple-500" />
                                        Next 30 days ({filteredNextMonth.length})
                                    </h2>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {filteredNextMonth.map(chore => (
                                            <ChoreCard
                                                key={chore.id}
                                                chore={chore}
                                                onRequestComplete={(id) => { setConfirmingChoreId(id); setConfirmDate(new Date().toISOString().split('T')[0]); }}
                                                onSelect={setSelectedChoreId}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {filteredFarFuture.length > 0 && (
                                <div>
                                    <h2 className="text-2xl font-bold mb-4 text-gray-700 flex items-center">
                                        <Calendar className="w-6 h-6 mr-2 text-gray-400" />
                                        Far future ({filteredFarFuture.length})
                                    </h2>
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                        {filteredFarFuture.map(chore => (
                                            <ChoreCard
                                                key={chore.id}
                                                chore={chore}
                                                onRequestComplete={(id) => { setConfirmingChoreId(id); setConfirmDate(new Date().toISOString().split('T')[0]); }}
                                                onSelect={setSelectedChoreId}
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
                <p>Made with ❤️ by Ollie · v{format(new Date(__BUILD_TIME__), 'yyyy-MM-dd.HH:mm')}</p>
            </footer>

            {/* History Modal */}
            {selectedChoreId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                    onClick={() => setSelectedChoreId(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between p-4 border-b border-gray-100">
                            <div className="min-w-0 pr-2">
                                <h3 className="text-lg font-bold text-gray-800 truncate">
                                    {state.chores.find(c => c.id === selectedChoreId)?.name ?? 'Chore History'}
                                </h3>
                                {(() => {
                                    const chore = state.chores.find(c => c.id === selectedChoreId);
                                    return chore && (
                                        <p className="text-sm text-gray-500 mt-0.5">
                                            {formatSchedule(chore.schedule)}
                                        </p>
                                    );
                                })()}
                            </div>
                            <button
                                onClick={() => setSelectedChoreId(null)}
                                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100 shrink-0"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1">
                            {historyLoading ? (
                                <div className="flex items-center justify-center py-8 text-indigo-500">
                                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                                    Loading history...
                                </div>
                            ) : historyEntries.length === 0 ? (
                                <div className="text-center py-8 text-gray-400">
                                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p>No completion history yet.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                                        <p className="text-sm text-indigo-600 font-medium mb-1 text-center">Last completed</p>
                                        <p className="text-2xl font-bold text-indigo-700 text-center">
                                            {isToday(historyEntries[0].date)
                                                ? 'Today'
                                                : formatDistanceToNowStrict(historyEntries[0].date, { addSuffix: true })}
                                        </p>
                                        <div className="mt-3 flex items-center justify-between p-3 bg-white rounded-lg border border-indigo-100">
                                            <div className="flex items-center gap-2">
                                                <User className="w-4 h-4 text-indigo-400" />
                                                <span className="text-sm font-medium text-gray-700">{historyEntries[0].completedBy}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-500">
                                                    {format(historyEntries[0].date, 'd MMM yyyy')}
                                                </span>
                                                <button
                                                    onClick={() => handleDeleteLogEntry(historyEntries[0].id, selectedChoreId!)}
                                                    disabled={deletingId === historyEntries[0].id}
                                                    className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50 disabled:opacity-50"
                                                    aria-label="Delete entry"
                                                >
                                                    {deletingId === historyEntries[0].id
                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        : <Trash2 className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    {historyEntries.length > 1 && (
                                        <>
                                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">History</p>
                                            <ul className="space-y-2">
                                                {historyEntries.slice(1).map((entry) => (
                                                    <li key={entry.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                                        <div className="flex items-center gap-2">
                                                            <User className="w-4 h-4 text-indigo-400" />
                                                            <span className="text-sm font-medium text-gray-700">{entry.completedBy}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm text-gray-500">
                                                                {format(entry.date, 'd MMM yyyy')}
                                                            </span>
                                                            <button
                                                                onClick={() => handleDeleteLogEntry(entry.id, selectedChoreId!)}
                                                                disabled={deletingId === entry.id}
                                                                className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50 disabled:opacity-50"
                                                                aria-label="Delete entry"
                                                            >
                                                                {deletingId === entry.id
                                                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                    : <Trash2 className="w-3.5 h-3.5" />}
                                                            </button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Mark Done Confirmation Modal */}
            {confirmingChoreId && (() => {
                const chore = state.chores.find(c => c.id === confirmingChoreId);
                if (!chore) return null;
                return (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
                        onClick={() => setConfirmingChoreId(null)}
                    >
                        <div
                            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <h3 className="text-lg font-bold text-gray-800 mb-1">Mark as done</h3>
                            <p className="text-gray-500 text-sm mb-4">{chore.name}</p>

                            <label htmlFor="confirm-date" className="block text-sm font-medium text-gray-700 mb-1">
                                Date completed
                            </label>
                            <input
                                id="confirm-date"
                                type="date"
                                value={confirmDate}
                                onChange={(e) => setConfirmDate(e.target.value)}
                                className="block w-full px-3 py-2 text-base border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm mb-5"
                            />

                            <div className="flex gap-3 justify-end">
                                <button
                                    onClick={() => setConfirmingChoreId(null)}
                                    disabled={saving}
                                    className="px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={async () => {
                                        setSaving(true);
                                        await handleCompleteChore(confirmingChoreId, confirmDate);
                                        setSaving(false);
                                        setConfirmingChoreId(null);
                                    }}
                                    disabled={saving}
                                    className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-md disabled:opacity-50 flex items-center gap-2"
                                >
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {saving ? 'Saving...' : 'Confirm'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}
        {/* New Chore Modal */}
            {showNewChoreModal && (
                <NewChoreModal
                    allUsers={allUsers}
                    currentUserId={currentUserId}
                    onClose={() => setShowNewChoreModal(false)}
                    onCreated={handleChoreCreated}
                />
            )}
        </div>
    );
};

export default App;