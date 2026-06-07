import { useMemo, useState, useRef, useEffect } from "react";
import {
    PlusCircle,
    Search,
    Wallet,
    FileText,
    PiggyBank,
    Pencil,
    Check,
    X,
    AlertTriangle,
    Tag,
    CreditCard,
    CalendarDays,
    Banknote,
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
    leftBudget,
    budgetInput,
    setBudgetInput,
    saveBudget,
}) {
    const [query, setQuery] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [sourceFilter, setSourceFilter] = useState("all");
    const [historyPage, setHistoryPage] = useState(1);
    const [isEditingBudget, setIsEditingBudget] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const isSubmittingRef = useRef(false);

    useEffect(() => {
        if (!isSubmitting) {
            isSubmittingRef.current = false;
        }
    }, [isSubmitting]);

    const historyPageSize = 20;
    const DAILY_LIMIT = 300000;

    const activeFundSources = fundSources;

    const [form, setForm] = useState({
        title: "",
        amount: "",
        category: "Food",
        source: activeFundSources[0] || "Mandiri",
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

    const selectedDateTotalAfterInput = selectedDateSpending + previewAmount;

    const isNearDailyLimit =
        selectedDateTotalAfterInput >= DAILY_LIMIT * 0.8 &&
        selectedDateTotalAfterInput < DAILY_LIMIT;

    const isOverDailyLimit = selectedDateTotalAfterInput >= DAILY_LIMIT;

    const totals = useMemo(() => {
        const totalSpending = currentMonthTransactions.reduce(
            (sum, item) => sum + Number(item.amount),
            0
        );

        return {
            totalSpending,
            remainingBudget: Number(leftBudget) || 0,
            currentMonthTransactionCount: currentMonthTransactions.length,
        };
    }, [currentMonthTransactions, leftBudget]);

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

        if (isSubmittingRef.current) return;

        const amount = Number(String(form.amount || "").replace(/[^\d]/g, ""));
        if (!form.title.trim() || !amount) return;

        isSubmittingRef.current = true;
        setIsSubmitting(true);

        const activeSource = activeFundSources.includes(form.source)
            ? form.source
            : (activeFundSources[0] || "Mandiri");

        try {
            await addTransaction({
                ...form,
                source: activeSource,
            });

            setForm({
                title: "",
                amount: "",
                category: "Food",
                source: activeFundSources[0] || "Mandiri",
                danaDipakai: "Spend Bulanan",
                date: today(),
            });
        } catch (error) {
            console.error("Failed to add transaction:", error);
        } finally {
            setIsSubmitting(false);
        }
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
                    className={`rounded-[1.5rem] border p-4 text-sm font-semibold shadow-sm ${isOverDailyLimit
                            ? "border-rose-200 bg-rose-100 text-rose-700"
                            : "border-yellow-200 bg-yellow-100 text-yellow-700"
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

            <section className="grid gap-4 xl:grid-cols-3">
                <StatCard
                    icon={Wallet}
                    label="Total Spending"
                    value={formatCurrency(totals.totalSpending)}
                />

                <Card className="overflow-hidden rounded-[1.75rem] border-white/70 bg-white/85 shadow-xl backdrop-blur">
                    <CardContent className="space-y-5 p-5">
                        <div className="flex min-w-0 items-start gap-4">
                            <div className="shrink-0 rounded-2xl bg-pink-100 p-3 text-pink-600">
                                <PiggyBank className="h-6 w-6" />
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="mb-2 flex items-center justify-between gap-3">
                                    <p className="text-sm font-semibold text-slate-500">
                                        Budget Manual
                                    </p>

                                    {!isEditingBudget && (
                                        <button
                                            type="button"
                                            onClick={handleBudgetEditOpen}
                                            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white transition hover:bg-slate-50"
                                        >
                                            <Pencil className="h-5 w-5 text-slate-600" />
                                        </button>
                                    )}
                                </div>

                                {!isEditingBudget ? (
                                    <p className="break-words text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
                                        {formatCurrency(budget)}
                                    </p>
                                ) : (
                                    <form
                                        onSubmit={handleBudgetSave}
                                        className="grid min-w-0 gap-2 sm:grid-cols-[1fr_auto_auto]"
                                    >
                                        <div className="flex min-w-0 w-full items-center overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3">
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
                                            className="inline-flex h-11 w-full items-center justify-center rounded-full bg-slate-950 text-white sm:w-11"
                                        >
                                            <Check className="h-4 w-4" />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleBudgetCancel}
                                            className="inline-flex h-11 w-full items-center justify-center rounded-full border border-slate-200 bg-white sm:w-11"
                                        >
                                            <X className="h-4 w-4" />
                                        </button>
                                    </form>
                                )}
                            </div>
                        </div>

                        <div className="border-t border-slate-200 pt-5">
                            <div className="flex min-w-0 items-center justify-between gap-3">
                                <p className="text-base font-semibold text-slate-500">
                                    Sisa Budget
                                </p>

                                <p
                                    className={`shrink-0 text-2xl font-black tracking-tight md:text-3xl ${totals.remainingBudget < 0
                                            ? "text-rose-600"
                                            : "text-slate-950"
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

            <section className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
                <Card className="w-full min-w-0 overflow-hidden rounded-[1.75rem] border-white/70 bg-white/85 shadow-xl backdrop-blur">
                    <CardContent className="p-5">
                        <h2 className="mb-4 text-xl font-black text-slate-950">
                            Add transaction
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <label className="block min-w-0 space-y-2">
                                <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                                    <Pencil className="h-4 w-4 text-pink-500" />
                                    Title
                                </span>

                                <input
                                    value={form.title}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            title: event.target.value,
                                        }))
                                    }
                                    placeholder="e.g. Groceries"
                                    className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-pink-200"
                                />
                            </label>

                            <label className="block min-w-0 space-y-2">
                                <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                                    <Banknote className="h-4 w-4 text-indigo-500" />
                                    Amount
                                </span>

                                <input
                                    value={form.amount}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            amount: event.target.value,
                                        }))
                                    }
                                    inputMode="numeric"
                                    placeholder="50000"
                                    className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-pink-200"
                                />
                            </label>

                            <div className="grid min-w-0 gap-3 md:grid-cols-3 xl:grid-cols-1">
                                <div className="space-y-2">
                                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                                        <Tag className="h-4 w-4 text-purple-500" />
                                        Category
                                    </span>

                                    <SelectField
                                        label=""
                                        value={form.category}
                                        options={categories}
                                        onChange={(value) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                category: value,
                                            }))
                                        }
                                    />
                                </div>

                                <div className="space-y-2">
                                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                                        <CreditCard className="h-4 w-4 text-blue-500" />
                                        Sumber Dana
                                    </span>

                                    <SelectField
                                        label=""
                                        value={activeFundSources.includes(form.source) ? form.source : (activeFundSources[0] || "")}
                                        options={activeFundSources}
                                        onChange={(value) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                source: value,
                                            }))
                                        }
                                    />
                                </div>

                                <div className="space-y-2">
                                    <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                                        <Wallet className="h-4 w-4 text-pink-500" />
                                        Dana Dipakai
                                    </span>

                                    <SelectField
                                        label=""
                                        value={form.danaDipakai}
                                        options={danaDipakaiOptions}
                                        onChange={(value) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                danaDipakai: value,
                                            }))
                                        }
                                    />
                                </div>
                            </div>

                            <label className="block min-w-0 space-y-2">
                                <span className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                                    <CalendarDays className="h-4 w-4 text-indigo-500" />
                                    Tanggal
                                </span>

                                <input
                                    value={form.date}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            date: event.target.value,
                                        }))
                                    }
                                    type="date"
                                    style={{ WebkitAppearance: "none" }}
                                    className="w-full min-w-0 max-w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none focus:ring-2 focus:ring-pink-200"
                                />
                            </label>

                            <Button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-500 py-6 text-base font-bold text-white shadow-lg hover:opacity-95"
                            >
                                <PlusCircle className="mr-2 h-5 w-5" />
                                {isSubmitting ? "Adding..." : "Add transaction"}
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <Card className="w-full min-w-0 min-h-[750px] overflow-hidden rounded-[1.75rem] border-white/70 bg-white/85 shadow-xl backdrop-blur">
                    <CardContent className="p-5">
                        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <h2 className="text-xl font-black text-slate-950">
                                Transactions
                            </h2>

                            <div className="grid w-full gap-2 md:grid-cols-[1fr_180px_180px]">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                                    <input
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        placeholder="Search"
                                        className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white py-2 pl-9 pr-3 outline-none focus:ring-2 focus:ring-pink-200"
                                    />
                                </div>

                                <select
                                    value={categoryFilter}
                                    onChange={(event) =>
                                        setCategoryFilter(event.target.value)
                                    }
                                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-pink-200"
                                >
                                    <option value="all">All categories</option>

                                    {categories.map((category) => (
                                        <option key={category} value={category}>
                                            {category}
                                        </option>
                                    ))}
                                </select>

                                <select
                                    value={sourceFilter}
                                    onChange={(event) =>
                                        setSourceFilter(event.target.value)
                                    }
                                    className="rounded-2xl border border-slate-200 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-pink-200"
                                >
                                    <option value="all">All sources</option>

                                    {activeFundSources.map((source) => (
                                        <option key={source} value={source}>
                                            {source}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <TransactionList
                            transactions={paginatedTransactions}
                            deleteTransaction={deleteTransaction}
                            updateTransaction={updateTransaction}
                        />

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/70 p-3 text-sm">
                            <p className="font-medium text-slate-500">
                                Showing {paginatedTransactions.length} of{" "}
                                {filteredTransactions.length} current month transactions
                            </p>

                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-xl border-slate-200"
                                    disabled={historyPage === 1}
                                    onClick={() =>
                                        setHistoryPage((page) => Math.max(1, page - 1))
                                    }
                                >
                                    Previous
                                </Button>

                                <span className="text-slate-500">
                                    Page {historyPage} / {totalHistoryPages}
                                </span>

                                <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-xl border-slate-200"
                                    disabled={historyPage === totalHistoryPages}
                                    onClick={() =>
                                        setHistoryPage((page) =>
                                            Math.min(totalHistoryPages, page + 1)
                                        )
                                    }
                                >
                                    Next
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </section>
        </>
    );
}