import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    CalendarDays,
    Home,
    PieChart,
    Wallet,
} from "lucide-react";

import Tracker from "../components/Tracker";
import DailyReport from "../components/DailyReport";
import MonthlyReport from "../components/MonthlyReport";

import { useTransactions } from "../hooks/useTransactions";
import { useBudget } from "../hooks/useBudget";
import { formatCurrency } from "../utils/currency";

export default function App() {
    const [activePage, setActivePage] = useState("tracker");

    const {
        transactions,
        isLoading,
        syncStatus,
        addTransaction,
        updateTransaction,
        deleteTransaction,
    } = useTransactions();

    const {
        budget,
        leftBudget,
        budgetInput,
        setBudgetInput,
        saveBudget,
    } = useBudget();

    const totalAllTimeSpending = useMemo(() => {
        return transactions.reduce(
            (sum, item) => sum + Number(item.amount),
            0
        );
    }, [transactions]);

    const navItems = [
        {
            id: "tracker",
            label: "Tracker",
            icon: Home,
        },
        {
            id: "daily-report",
            label: "Daily",
            icon: CalendarDays,
        },
        {
            id: "report",
            label: "Monthly",
            icon: PieChart,
        },
    ];

    if (isLoading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-[#f8f6ff] p-4 text-slate-950">
                <div className="space-y-4 text-center">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-pink-100 border-t-pink-500" />

                    <div>
                        <p className="text-base font-semibold">
                            Loading transactions...
                        </p>

                        <p className="mt-1 text-sm text-slate-500">
                            Syncing data from Google Sheets.
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
                                <p className="text-lg font-black">
                                    ryanilhamsept's Money Tracker
                                </p>

                                <p className="text-xs font-medium text-slate-500">
                                    Expense dashboard
                                </p>
                            </div>
                        </div>
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
                                <div className="h-full w-3/4 rounded-full bg-white" />
                            </div>
                        </div>
                    </div>
                </motion.header>

                <nav className="hidden grid-cols-3 gap-3 rounded-[1.5rem] border border-white/70 bg-white/80 p-2 shadow-lg backdrop-blur md:grid">
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

                {syncStatus && (
                    <div className="rounded-2xl border border-white/70 bg-white/80 p-4 text-sm font-medium text-slate-500 shadow-sm backdrop-blur">
                        {syncStatus}
                    </div>
                )}

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

                {activePage === "daily-report" && (
                    <DailyReport transactions={transactions} />
                )}

                {activePage === "report" && (
                    <MonthlyReport transactions={transactions} />
                )}
            </div>

            <nav className="fixed bottom-4 left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-md -translate-x-1/2 grid-cols-3 items-center rounded-[2rem] border border-white/70 bg-white/90 p-2 shadow-2xl backdrop-blur md:hidden">
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