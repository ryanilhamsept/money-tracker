import { useMemo, useState } from "react";
import {
    Plus,
    Search,
    Wallet,
    FileText,
    PiggyBank,
    Pencil,
    Check,
    X,
    AlertTriangle,
} from "lucide-react";

import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import StatCard from "./StatCard";
import SelectField from "./SelectField";
import TransactionList from "./TransactionList";

import {
    categories,
    danaDipakaiOptions,
    fundSources,
} from "../constants/options";

import {
    currentMonth,
    getTransactionMonth,
    normalizeDate,
    today,
} from "../utils/date";

import { formatCurrency } from "../utils/currency";

export default function Tracker({
    transactions,
    addTransaction,
    deleteTransaction,
    updateTransaction,
    budget,
    budgetInput,
    setBudgetInput,
    saveBudget,
}) {
    const [query, setQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [sourceFilter, setSourceFilter] = useState("all");
    const [historyPage, setHistoryPage] = useState(1);
    const [isEditingBudget, setIsEditingBudget] = useState(false);

    const historyPageSize = 20;
    const DAILY_LIMIT = 300000;

    const [form, setForm] = useState({
        title: "",
        amount: "",
        category: "Food",
        source: "Mandiri",
        danaDipakai: "Spend Bulanan",
        date: today(),
    });

    const currentMonthTransactions = useMemo(() => {
        return transactions.filter(
            (item) => getTransactionMonth(item.date) === currentMonth()
        );
    }, [transactions]);

    const selectedDateSpending = useMemo(() => {
        const selectedDate = normalizeDate(form.date);

        return transactions
            .filter((item) => normalizeDate(item.date) === selectedDate)
            .reduce((sum, item) => sum + Number(item.amount), 0);
    }, [transactions, form.date]);

    const previewAmount =
        Number(String(form.amount || "").replace(/[^\d]/g, "")) || 0;

    const selectedDateTotalAfterInput =
        selectedDateSpending + previewAmount;

    const isNearDailyLimit =
        selectedDateTotalAfterInput >= DAILY_LIMIT * 0.8 &&
        selectedDateTotalAfterInput < DAILY_LIMIT;

    const isOverDailyLimit =
        selectedDateTotalAfterInput >= DAILY_LIMIT;

    const totals = useMemo(() => {
        const totalSpending = currentMonthTransactions.reduce(
            (sum, item) => sum + Number(item.amount),
            0
        );

        const budgetSpending = currentMonthTransactions
            .filter((item) => item.danaDipakai === "Spend Bulanan")
            .reduce((sum, item) => sum + Number(item.amount), 0);

        return {
            totalSpending,
            remainingBudget: budget - budgetSpending,
            currentMonthTransactionCount: currentMonthTransactions.length,
        };
    }, [currentMonthTransactions, budget]);

    const filteredTransactions = useMemo(() => {
        return currentMonthTransactions
            .filter((item) => {
                const matchesQuery =
                    `${item.title} ${item.category} ${item.source} ${item.danaDipakai}`
                        .toLowerCase()
                        .includes(query.toLowerCase());

                const matchesCategory =
                    categoryFilter === "all" || item.category === categoryFilter;

                const matchesSource =
                    sourceFilter === "all" || item.source === sourceFilter;

                return matchesQuery && matchesCategory && matchesSource;
            })
            .sort((a, b) =>
                normalizeDate(b.date).localeCompare(normalizeDate(a.date))
            );
    }, [currentMonthTransactions, query, categoryFilter, sourceFilter]);

    const totalHistoryPages = Math.max(
        1,
        Math.ceil(filteredTransactions.length / historyPageSize)
    );

    const paginatedTransactions = filteredTransactions.slice(
        (historyPage - 1) * historyPageSize,
        historyPage * historyPageSize
    );

    const handleSubmit = async (event) => {
        event.preventDefault();

        await addTransaction(form);

        setForm({
            title: "",
            amount: "",
            category: "Food",
            source: "Mandiri",
            danaDipakai: "Spend Bulanan",
            date: today(),
        });
    };

    const handleBudgetEditOpen = () => {
        setBudgetInput(String(budget || ""));
        setIsEditingBudget(true);
    };

    const handleBudgetSave = (event) => {
        saveBudget(event);
        setIsEditingBudget(false);
    };

    const handleBudgetCancel = () => {
        setBudgetInput("");
        setIsEditingBudget(false);
    };

    return (
        <>
            {(isNearDailyLimit || isOverDailyLimit) && (
                <div
                    className={`rounded-2xl border p-4 text-sm font-semibold ${
                        isOverDailyLimit
                            ? "border-rose-300 bg-rose-100 text-rose-700"
                            : "border-yellow-300 bg-yellow-100 text-yellow-700"
                    }`}
                >
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />

                        <div>
                            <p>
                                {isOverDailyLimit
                                    ? "Pengeluaran pada tanggal ini sudah melewati limit harian."
                                    : "Pengeluaran pada tanggal ini sudah mendekati limit harian."}
                            </p>

                            <p className="mt-1 text-xs font-medium">
                                Total: {formatCurrency(selectedDateTotalAfterInput)} / Limit:{" "}
                                {formatCurrency(DAILY_LIMIT)}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr_1fr]">
                <StatCard
                    icon={Wallet}
                    label="Total Spending"
                    value={formatCurrency(totals.totalSpending)}
                />

                <Card className="rounded-2xl shadow-sm">
                    <CardContent className="space-y-5 p-5">
                        <div className="flex min-w-0 items-start gap-4">
                            <div className="shrink-0 rounded-2xl bg-muted p-3">
                                <PiggyBank className="h-6 w-6" />
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <p className="text-sm text-muted-foreground">
                                        Budget Manual
                                    </p>

                                    {!isEditingBudget && (
                                        <button
                                            type="button"
                                            onClick={handleBudgetEditOpen}
                                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-background transition hover:bg-muted"
                                            aria-label="Edit budget"
                                        >
                                            <Pencil className="h-5 w-5 text-muted-foreground" />
                                        </button>
                                    )}
                                </div>

                                {!isEditingBudget ? (
                                    <p className="break-words text-3xl font-bold tracking-tight md:text-4xl">
                                        {formatCurrency(budget)}
                                    </p>
                                ) : (
                                    <form
                                        onSubmit={handleBudgetSave}
                                        className="grid min-w-0 gap-2 sm:grid-cols-[1fr_auto_auto]"
                                    >
                                        <div className="flex min-w-0 w-full items-center overflow-hidden rounded-2xl border bg-background px-4 py-3">
                                            <span className="mr-2 shrink-0 text-xl font-semibold">
                                                Rp
                                            </span>

                                            <input
                                                value={budgetInput}
                                                onChange={(event) =>
                                                    setBudgetInput(event.target.value)
                                                }
                                                autoFocus
                                                inputMode="numeric"
                                                placeholder="5000000"
                                                className="min-w-0 flex-1 bg-transparent text-xl font-bold outline-none md:text-3xl"
                                            />
                                        </div>

                                        <button
                                            type="submit"
                                            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-foreground text-background sm:w-11"
                                        >
                                            <Check className="h-4 w-4" />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleBudgetCancel}
                                            className="inline-flex h-11 w-full items-center justify-center rounded-full border bg-background sm:w-11"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </form>
                                )}
                            </div>
                        </div>

                        <div className="border-t pt-5">
                            <div className="flex min-w-0 items-center justify-between gap-3">
                                <p className="text-base font-medium text-muted-foreground">
                                    Sisa Budget
                                </p>

                                <p
                                    className={`shrink-0 text-2xl font-bold tracking-tight md:text-3xl ${
                                        totals.remainingBudget < 0
                                            ? "text-rose-600"
                                            : "text-foreground"
                                    }`}
                                >
                                    {formatCurrency(totals.remainingBudget)}
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <StatCard
                    icon={FileText}
                    label="Transactions"
                    value={`${totals.currentMonthTransactionCount} items`}
                />
            </section>
        </>
    );
}