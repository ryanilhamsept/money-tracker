import { useMemo, useState } from "react";
import {
    Plus,
    Search,
    Wallet,
    TrendingDown,
    FileText,
    PiggyBank,
    Pencil,
    Check,
    X,
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
            <section className="grid gap-4 lg:grid-cols-[1fr_1.4fr_1fr_1fr]">
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
                                            aria-label="Save budget"
                                        >
                                            <Check className="h-4 w-4" />
                                        </button>

                                        <button
                                            type="button"
                                            onClick={handleBudgetCancel}
                                            className="inline-flex h-11 w-full items-center justify-center rounded-full border bg-background sm:w-11"
                                            aria-label="Cancel edit budget"
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
                    icon={TrendingDown}
                    label="This Month"
                    value={formatCurrency(totals.totalSpending)}
                />

                <StatCard
                    icon={FileText}
                    label="Transactions"
                    value={`${totals.currentMonthTransactionCount} items`}
                />
            </section>

            <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
                <Card className="rounded-2xl shadow-sm">
                    <CardContent className="p-5">
                        <h2 className="mb-4 text-xl font-semibold">
                            Add transaction
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <label className="block space-y-2">
                                <span className="text-sm font-medium">Title</span>

                                <input
                                    value={form.title}
                                    onChange={(event) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            title: event.target.value,
                                        }))
                                    }
                                    placeholder="e.g. Groceries"
                                    className="w-full rounded-2xl border bg-background px-4 py-3 outline-none focus:ring-2"
                                />
                            </label>

                            <label className="block space-y-2">
                                <span className="text-sm font-medium">Amount</span>

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
                                    className="w-full rounded-2xl border bg-background px-4 py-3 outline-none focus:ring-2"
                                />
                            </label>

                            <div className="grid gap-3 md:grid-cols-3">
                                <SelectField
                                    label="Category"
                                    value={form.category}
                                    options={categories}
                                    onChange={(value) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            category: value,
                                        }))
                                    }
                                />

                                <SelectField
                                    label="Sumber Dana"
                                    value={form.source}
                                    options={fundSources}
                                    onChange={(value) =>
                                        setForm((prev) => ({
                                            ...prev,
                                            source: value,
                                        }))
                                    }
                                />

                                <SelectField
                                    label="Dana Dipakai"
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

                            <label className="block space-y-2">
                                <span className="text-sm font-medium">Tanggal</span>

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
                                    className="w-full min-w-0 max-w-full appearance-none rounded-2xl border bg-background px-4 py-3 text-base outline-none focus:ring-2"
                                />
                            </label>

                            <Button
                                type="submit"
                                className="w-full rounded-2xl py-6 text-base"
                            >
                                <Plus className="mr-2 h-5 w-5" />
                                Add transaction
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm">
                    <CardContent className="p-5">
                        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <h2 className="text-xl font-semibold">Transactions</h2>

                            <div className="flex flex-wrap gap-2">
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                                    <input
                                        value={query}
                                        onChange={(event) => setQuery(event.target.value)}
                                        placeholder="Search"
                                        className="w-full rounded-2xl border bg-background py-2 pl-9 pr-3 outline-none focus:ring-2 md:w-48"
                                    />
                                </div>

                                <select
                                    value={categoryFilter}
                                    onChange={(event) =>
                                        setCategoryFilter(event.target.value)
                                    }
                                    className="rounded-2xl border bg-background px-3 py-2 outline-none focus:ring-2"
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
                                    className="rounded-2xl border bg-background px-3 py-2 outline-none focus:ring-2"
                                >
                                    <option value="all">All sources</option>

                                    {fundSources.map((source) => (
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

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3 text-sm">
                            <p className="text-muted-foreground">
                                Showing {paginatedTransactions.length} of{" "}
                                {filteredTransactions.length} current month transactions
                            </p>

                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-xl"
                                    disabled={historyPage === 1}
                                    onClick={() =>
                                        setHistoryPage((page) => Math.max(1, page - 1))
                                    }
                                >
                                    Previous
                                </Button>

                                <span className="text-muted-foreground">
                                    Page {historyPage} / {totalHistoryPages}
                                </span>

                                <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-xl"
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