import { useState } from "react";
import { motion } from "framer-motion";
import {
    CalendarDays,
    PiggyBank,
    PieChart,
    Wallet,
} from "lucide-react";

import Tracker from "../components/Tracker";
import DailyReport from "../components/DailyReport";
import MonthlyReport from "../components/MonthlyReport";

import { useTransactions } from "../hooks/useTransactions";
import { useBudget } from "../hooks/useBudget";

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
        budgetInput,
        setBudgetInput,
        saveBudget,
    } = useBudget();

    const navItems = [
        {
            id: "tracker",
            label: "Tracker",
            icon: Wallet,
        },
        {
            id: "daily-report",
            label: "Daily Report",
            icon: CalendarDays,
        },
        {
            id: "report",
            label: "Monthly Report",
            icon: PieChart,
        },
    ];

    if (isLoading) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
                <div className="space-y-4 text-center">
                    <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-muted border-t-foreground" />

                    <div>
                        <p className="text-base font-semibold">
                            Loading transactions...
                        </p>

                        <p className="mt-1 text-sm text-muted-foreground">
                            Syncing data from Google Sheets.
                        </p>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="min-h-screen bg-background p-4 text-foreground md:p-8">
            <div className="mx-auto max-w-7xl space-y-6">
                <motion.header
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                >
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <PiggyBank className="h-4 w-4" />
                        Ilham's Money Tracker
                    </div>

                    <div>
                        <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
                            Track your spending clearly.
                        </h1>

                        <p className="mt-3 max-w-2xl text-sm text-muted-foreground md:text-base">
                            Add spending, review daily reports, and analyze monthly summaries.
                        </p>
                    </div>
                </motion.header>

                <nav className="grid grid-cols-3 gap-2 rounded-2xl bg-muted p-2">
                    {navItems.map((item) => {
                        const Icon = item.icon;

                        return (
                            <button
                                key={item.id}
                                onClick={() => setActivePage(item.id)}
                                className={`flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-3 text-xs font-semibold transition sm:px-4 sm:text-sm ${
                                    activePage === item.id
                                        ? "scale-[1.02] border-2 border-primary bg-background shadow-lg"
                                        : "text-muted-foreground hover:bg-background/60"
                                }`}
                            >
                                <Icon className="h-4 w-4 shrink-0" />

                                <span className="truncate">
                                    {item.label}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                {syncStatus && (
                    <div className="rounded-2xl border bg-muted p-4 text-sm text-muted-foreground">
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
        </main>
    );
}