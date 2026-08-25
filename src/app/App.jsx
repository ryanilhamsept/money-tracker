import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    PiggyBank,
    Home,
    PieChart,
    Wallet,
    RefreshCw,
} from "lucide-react";

import Tracker from "../components/Tracker";
import Plan from "../components/Plan";
import MonthlyReport from "../components/MonthlyReport";
import Accounts from "../components/Accounts";
import Login from "../components/Login";
import { useAccounts } from "../hooks/useAccounts";

import { useTransactions } from "../hooks/useTransactions";
import { useBudget } from "../hooks/useBudget";
import { formatCurrency } from "../utils/currency";
import { currentMonth, getTransactionMonth } from "../utils/date";
import { supabase } from "../services/supabase";

export default function App() {
    const [activePage, setActivePage] = useState("tracker");
    const [user, setUser] = useState(null);
    const [isAuthChecking, setIsAuthChecking] = useState(true);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            setIsAuthChecking(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
    }, []);

    const {
        budget,
        budgetInput,
        setBudgetInput,
        saveBudget,
        reloadBudget,
    } = useBudget(user?.id);

    const {
        accounts,
        isLoading: isAccountsLoading,
        addAccount,
        deleteAccount,
        updateStartingBalance,
        applyTransactionBalanceChange,
        syncAccountBalancesForTransaction,
        reloadAccounts,
    } = useAccounts(user?.id);

    const {
        transactions,
        isLoading,
        syncStatus,
        pendingSyncCount,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        retryPendingSync,
        reloadTransactions,
    } = useTransactions({
        userId: user?.id,
        applyTransactionBalanceChange,
        syncAccountBalancesForTransaction,
        reloadAccounts,
    });

    const currentMonthSpendBulanan = useMemo(() => {
        return transactions
            .filter((item) => getTransactionMonth(item.date) === currentMonth() && item.danaDipakai === "Spend Bulanan" && item.type !== "income")
            .reduce((sum, item) => sum + Number(item.amount), 0);
    }, [transactions]);

    const leftBudget = useMemo(() => {
        return Math.max(0, budget - currentMonthSpendBulanan);
    }, [budget, currentMonthSpendBulanan]);

    const [isManualSyncing, setIsManualSyncing] = useState(false);
    const [manualSyncStatus, setManualSyncStatus] = useState("");

    const handleManualSync = async () => {
        if (isManualSyncing) return;

        try {
            setIsManualSyncing(true);
            setManualSyncStatus(
                pendingSyncCount > 0
                    ? `Syncing ${pendingSyncCount} queued transaction...`
                    : "Fetching latest data..."
            );

            const pendingOk = await retryPendingSync({
                showStatus: false,
            }).catch(() => false);

            const [txOk, budgetOk, accountsOk] = await Promise.all([
                reloadTransactions().catch(() => false),
                reloadBudget().catch(() => false),
                reloadAccounts().catch(() => false),
            ]);

            const allOk = pendingOk && txOk && budgetOk && accountsOk;
            setManualSyncStatus(
                allOk
                    ? "All data is up to date!"
                    : "Sync done, but some sources failed to load."
            );
            setTimeout(() => setManualSyncStatus(""), 3000);
        } catch (error) {
            console.error("MANUAL SYNC ERROR:", error);
            setManualSyncStatus("Failed to sync data.");
            setTimeout(() => setManualSyncStatus(""), 3000);
        } finally {
            setIsManualSyncing(false);
        }
    };



    const totalAllTimeSpending = useMemo(() => {
        return transactions
            .filter((item) => item.type !== "income" && String(item.date) >= "2025-01-01")
            .reduce((sum, item) => sum + Number(item.amount), 0);
    }, [transactions]);

    const navItems = [
        {
            id: "tracker",
            label: "Tracker",
            icon: Home,
        },
        {
            id: "accounts",
            label: "Akun",
            icon: Wallet,
        },
        {
            id: "plan",
            label: "Plan",
            icon: PiggyBank,
        },
        {
            id: "report",
            label: "Monthly",
            icon: PieChart,
        },
    ];

    if (isAuthChecking) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#0a051b] p-4 text-white">
                <div className="space-y-4 text-center">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-pink-500/20 border-t-pink-500" />
                    <p className="text-base font-semibold">Checking session...</p>
                </div>
            </main>
        );
    }

    if (!user) {
        return <Login />;
    }

    if (isLoading || isAccountsLoading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#f8f6ff] p-4 text-slate-950">
                <div className="space-y-4 text-center">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-pink-100 border-t-pink-500" />

                    <div>
                        <p className="text-base font-semibold">
                            Loading app data...
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                            Syncing data from database.
                        </p>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-gradient-to-br from-pink-100 via-[#f8f6ff] to-indigo-100 p-4 pb-28 text-slate-950 md:p-8">
            <div className="mx-auto max-w-[1600px] space-y-6">
                <motion.header
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-xl backdrop-blur md:p-8"
                >
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-pink-400 to-indigo-500 text-white shadow-lg">
                                <Wallet className="h-5 w-5" />
                            </div>

                            <div>
                                <p className="text-base sm:text-lg font-black tracking-tight text-slate-900">
                                    {user?.email?.split('@')[0] || "User"}'s Money Tracker
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => supabase.auth.signOut()}
                            className="rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-rose-600 hover:border-rose-100"
                        >
                            Log Out
                        </button>
                    </div>

                    <div className="mt-8 grid gap-8 xl:grid-cols-[1.5fr_0.8fr] xl:items-center">
                        <div>
                            <p className="mb-3 inline-flex rounded-full bg-pink-100 px-4 py-2 text-xs font-bold text-pink-600">
                                All-in-one money tracker
                            </p>

                            <h1 className="max-w-4xl text-4xl font-black leading-tight tracking-tight md:text-5xl xl:text-6xl">
                                Track your spending clearly.
                            </h1>

                            <p className="mt-4 max-w-2xl text-base font-medium text-slate-500 md:text-lg">
                                Add spending, review daily reports, and analyze monthly summaries.
                            </p>
                        </div>

                        <div className="rounded-[1.75rem] bg-gradient-to-br from-indigo-500 to-pink-400 p-5 text-white shadow-xl">
                            <p className="text-sm font-semibold text-white/80">
                                Uang yang sudah keluar
                            </p>

                            <p className="mt-1 text-xs font-medium text-white/70">
                                Januari 2025 - Sekarang
                            </p>

                            <p className="mt-5 text-3xl font-black tracking-tight md:text-4xl xl:text-5xl">
                                {formatCurrency(totalAllTimeSpending)}
                            </p>

                            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/25">
                                <div className="h-full w-full rounded-full bg-white" />
                            </div>
                        </div>
                    </div>
                </motion.header>

                <nav className="hidden grid-cols-4 gap-3 rounded-[1.5rem] border border-white/70 bg-white/80 p-2 shadow-lg backdrop-blur md:grid">
                    {navItems.map((item) => {
                        const Icon = item.icon;

                        return (
                            <button
                                key={item.id}
                                onClick={() => setActivePage(item.id)}
                                className={`flex min-w-0 items-center justify-center gap-2 rounded-2xl px-4 py-4 text-sm font-bold transition ${activePage === item.id
                                        ? "bg-gradient-to-r from-pink-500 to-indigo-500 text-white shadow-lg"
                                        : "text-slate-500 hover:bg-slate-100"
                                    }`}
                            >
                                <Icon className="h-5 w-5 shrink-0" />

                                <span className="truncate">
                                    {item.label}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-white/70 bg-white/80 p-4 text-sm font-medium shadow-md backdrop-blur transition-all duration-300">
                    <div className="flex items-center gap-2.5">
                        {isManualSyncing ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                                <span className="font-semibold text-slate-700">{manualSyncStatus}</span>
                            </>
                        ) : manualSyncStatus ? (
                            <>
                                <div className="h-2 w-2 rounded-full bg-indigo-500" />
                                <span className="font-semibold text-indigo-600">{manualSyncStatus}</span>
                            </>
                        ) : pendingSyncCount > 0 ? (
                            <>
                                <div className="h-2 w-2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.55)] animate-pulse" />
                                <span className="font-semibold text-slate-700">
                                    {pendingSyncCount} transaction saved locally. Auto-sync is running.
                                </span>
                            </>
                        ) : syncStatus ? (
                            <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                                <span className="font-semibold text-slate-700">{syncStatus}</span>
                            </>
                        ) : (
                            <>
                                <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)] animate-pulse" />
                                <span className="text-slate-500 font-medium">All data in sync with database.</span>
                            </>
                        )}
                    </div>
                    
                    <button
                        onClick={handleManualSync}
                        disabled={isLoading || isManualSyncing}
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-indigo-500 px-4 py-2 text-xs font-black text-white shadow-md hover:from-pink-600 hover:to-indigo-600 hover:shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 shrink-0"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isManualSyncing ? "animate-spin" : ""}`} />
                        {pendingSyncCount > 0
                            ? `Sync Now (${pendingSyncCount})`
                            : "Sync Now"}
                    </button>
                </div>

                {activePage === "tracker" && (
                    <Tracker
                        transactions={transactions}
                        addTransaction={addTransaction}
                        deleteTransaction={deleteTransaction}
                        updateTransaction={updateTransaction}
                        budget={budget}
                        leftBudget={leftBudget}
                        budgetInput={budgetInput}
                        setBudgetInput={setBudgetInput}
                        saveBudget={saveBudget}
                    />
                )}

                {activePage === "accounts" && (
                    <Accounts
                        accounts={accounts}
                        addAccount={addAccount}
                        deleteAccount={deleteAccount}
                        updateStartingBalance={updateStartingBalance}
                    />
                )}

                {activePage === "plan" && (
                    <Plan userId={user?.id} />
                )}

                {activePage === "report" && (
                    <MonthlyReport transactions={transactions} budget={budget} />
                )}
            </div>

            <nav className="fixed bottom-4 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 grid-cols-4 items-center rounded-[2rem] border border-white/70 bg-white/90 p-2 shadow-2xl backdrop-blur md:hidden">
                {navItems.map((item) => {
                    const Icon = item.icon;

                    return (
                        <button
                            key={item.id}
                            onClick={() => setActivePage(item.id)}
                            className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-3 py-3 text-xs font-bold transition ${activePage === item.id
                                    ? "bg-pink-500 text-white shadow-lg"
                                    : "text-slate-400"
                                }`}
                        >
                            <Icon className="h-5 w-5" />

                            <span>{item.label}</span>
                        </button>
                    );
                })}
            </nav>
        </main>
    );
}
