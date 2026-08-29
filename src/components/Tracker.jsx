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
import { findCreditCardForSource } from "../utils/accountBalance";
import {
    getFirstInstallmentMonthOffset,
    getStatementDay,
} from "../utils/billingCycle";

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
    accounts = [],
    addInstallment,
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
        time: "",
    });

    const [isInstallment, setIsInstallment] = useState(false);
    const [installmentDetails, setInstallmentDetails] = useState({
        provider: "",
        totalLoan: "",
        remainingTerm: "",
        dueDate: "",
    });

    const isSpendCC = form.danaDipakai === "Spend CC";

    // Amount = cicilan bulanan; begitu Total Harga Barang & Sisa Tenor keisi,
    // hitung otomatis (dibulatkan ke atas) biar konsisten.
    const recalcInstallmentAmount = (totalLoanVal, remainingTermVal) => {
        const totalLoanNum = Number(String(totalLoanVal || "").replace(/[^\d]/g, ""));
        const termNum = Number(remainingTermVal || "");
        if (totalLoanNum > 0 && termNum > 0) {
            setForm((prev) => ({ ...prev, amount: String(Math.ceil(totalLoanNum / termNum)) }));
        }
    };

    const currentMonthTransactions = useMemo(() => {
        return transactions.filter(
            (item) => getTransactionMonth(item.date) === currentMonth()
        );
    }, [transactions]);

    const selectedDateSpending = useMemo(() => {
        const selectedDate = normalizeDate(form.date);

        return transactions
            .filter((item) => normalizeDate(item.date) === selectedDate && item.type !== "income")
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
        const totalSpending = currentMonthTransactions
            .filter((item) => item.type !== "income")
            .reduce((sum, item) => sum + Number(item.amount), 0);

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
            .sort((a, b) => {
                const dateCompare = normalizeDate(b.date).localeCompare(normalizeDate(a.date));
                if (dateCompare !== 0) return dateCompare;

                const timeCompare = String(b.time || "").localeCompare(String(a.time || ""));
                if (timeCompare !== 0) return timeCompare;

                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            });
    }, [currentMonthTransactions, query, categoryFilter, sourceFilter]);

    // Dikelompokkan per tanggal dulu sebelum dipaginasi, biar transaksi di satu
    // tanggal nggak pernah kepotong jadi dua grup terpisah di dua halaman
    // (mirror dari mobile app: mobile/App.js dateGroupsAll/transactionPages).
    const dateGroupsAll = useMemo(() => {
        const groups = {};
        filteredTransactions.forEach((item) => {
            const key = normalizeDate(item.date);
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });
        return Object.entries(groups)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, items]) => ({
                date,
                items,
                total: items
                    .filter((item) => item.type !== "income")
                    .reduce((sum, item) => sum + Number(item.amount), 0),
            }));
    }, [filteredTransactions]);

    const historyPages = useMemo(() => {
        const pages = [];
        let current = [];
        let currentCount = 0;
        dateGroupsAll.forEach((group) => {
            if (currentCount > 0 && currentCount + group.items.length > historyPageSize) {
                pages.push(current);
                current = [];
                currentCount = 0;
            }
            current.push(group);
            currentCount += group.items.length;
        });
        if (current.length > 0) pages.push(current);
        return pages.length > 0 ? pages : [[]];
    }, [dateGroupsAll]);

    const totalHistoryPages = historyPages.length;

    // Derive the in-range page during render instead of syncing it back via an
    // effect (avoids the extra render pass react-hooks/set-state-in-effect warns about).
    const safeHistoryPage = Math.min(Math.max(historyPage, 1), totalHistoryPages);

    const groupedPageTransactions = historyPages[safeHistoryPage - 1] || [];

    const paginatedTransactions = groupedPageTransactions.flatMap(
        (group) => group.items
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

        const wantsInstallment = isSpendCC && isInstallment;
        const totalLoan = Number(String(installmentDetails.totalLoan || "").replace(/[^\d]/g, ""));

        if (wantsInstallment && !totalLoan) {
            isSubmittingRef.current = false;
            setIsSubmitting(false);
            return;
        }

        try {
            let firstTransactionId = null;
            const matchedCard = findCreditCardForSource(accounts, activeSource);

            if (wantsInstallment) {
                const term = Number(installmentDetails.remainingTerm) || 1;
                const [yearStr, monthStr, dayStr] = form.date.split('-');
                const y = parseInt(yearStr, 10);
                const m = parseInt(monthStr, 10) - 1;
                const d = parseInt(dayStr, 10);

                // Cicilan pertama nempel di tagihan pertama setelah belanja.
                // Kartu tutup buku tiap tanggal `statementDay`, jadi belanja
                // pada/sesudah tanggal itu baru ditagih bulan berikutnya --
                // belanja 29 Agu (tutup buku 25) jatuh di Sep, Okt, Nov.
                const statementDay = getStatementDay(matchedCard);
                const monthOffset = getFirstInstallmentMonthOffset(d, statementDay);

                for (let i = 0; i < term; i++) {
                    const nextDate = new Date(y, m + i + monthOffset, d);
                    const outY = nextDate.getFullYear();
                    const outM = String(nextDate.getMonth() + 1).padStart(2, '0');
                    const outD = String(nextDate.getDate()).padStart(2, '0');
                    const dateString = `${outY}-${outM}-${outD}`;

                    const currentTxId = crypto.randomUUID();
                    if (i === 0) firstTransactionId = currentTxId;

                    await addTransaction({
                        ...form,
                        title: form.title.trim(),
                        amount: amount,
                        date: dateString,
                        id: currentTxId,
                        source: activeSource,
                        installmentTotalLoan: i === 0 ? totalLoan : 0,
                    });
                }
            } else {
                firstTransactionId = crypto.randomUUID();
                await addTransaction({
                    ...form,
                    title: form.title.trim(),
                    amount: amount,
                    id: firstTransactionId,
                    source: activeSource,
                    installmentTotalLoan: null,
                });
            }

            if (wantsInstallment && firstTransactionId) {
                if (matchedCard && addInstallment) {
                    await addInstallment({
                        accountId: matchedCard.id,
                        transactionId: firstTransactionId,
                        name: form.title.trim(),
                        provider: installmentDetails.provider.trim(),
                        totalLoan,
                        remainingBalance: totalLoan - amount,
                        monthlyInstallment: amount,
                        remainingTerm: installmentDetails.remainingTerm
                            ? Number(installmentDetails.remainingTerm)
                            : null,
                        dueDate: installmentDetails.dueDate
                            ? Number(installmentDetails.dueDate)
                            : null,
                    });
                }
            }

            setForm({
                title: "",
                amount: "",
                category: "Food",
                source: activeFundSources[0] || "Mandiri",
                danaDipakai: "Spend Bulanan",
                date: today(),
                time: "",
            });
            setIsInstallment(false);
            setInstallmentDetails({ provider: "", totalLoan: "", remainingTerm: "", dueDate: "" });
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
                                        onChange={(value) => {
                                            setForm((prev) => ({
                                                ...prev,
                                                danaDipakai: value,
                                            }));
                                            if (value !== "Spend CC") {
                                                setIsInstallment(false);
                                            }
                                        }}
                                    />
                                </div>
                            </div>

                            {isSpendCC && (
                                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={isInstallment}
                                            onChange={(event) => setIsInstallment(event.target.checked)}
                                            className="h-4 w-4 rounded border-slate-300 text-pink-500 focus:ring-pink-200"
                                        />
                                        Ini cicilan?
                                    </label>

                                    {isInstallment && (
                                        <>
                                            <p className="text-xs font-medium text-slate-500">
                                                Transaksi akan otomatis dibuat untuk sisa tenor (bulan) ke depan. Limit kartu akan terpotong per bulan sebesar cicilan.
                                            </p>

                                            <div className="space-y-2">
                                                <span className="text-xs font-bold text-slate-600">Provider (opsional)</span>
                                                <input
                                                    value={installmentDetails.provider}
                                                    onChange={(event) =>
                                                        setInstallmentDetails((prev) => ({
                                                            ...prev,
                                                            provider: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="Home Credit"
                                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-200"
                                                />
                                            </div>

                                            <div className="space-y-2">
                                                <span className="text-xs font-bold text-slate-600">Total Harga Barang (Rp)</span>
                                                <input
                                                    value={installmentDetails.totalLoan}
                                                    onChange={(event) => {
                                                        const value = event.target.value;
                                                        setInstallmentDetails((prev) => ({
                                                            ...prev,
                                                            totalLoan: value,
                                                        }));
                                                        recalcInstallmentAmount(value, installmentDetails.remainingTerm);
                                                    }}
                                                    inputMode="numeric"
                                                    placeholder="3000000"
                                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-200"
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-2">
                                                    <span className="text-xs font-bold text-slate-600">Sisa Tenor (bulan)</span>
                                                    <input
                                                        value={installmentDetails.remainingTerm}
                                                        onChange={(event) => {
                                                            const value = event.target.value.replace(/[^\d]/g, "");
                                                            setInstallmentDetails((prev) => ({
                                                                ...prev,
                                                                remainingTerm: value,
                                                            }));
                                                            recalcInstallmentAmount(installmentDetails.totalLoan, value);
                                                        }}
                                                        inputMode="numeric"
                                                        placeholder="6"
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-200"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <span className="text-xs font-bold text-slate-600">Tanggal Jatuh Tempo</span>
                                                    <input
                                                        value={installmentDetails.dueDate}
                                                        onChange={(event) =>
                                                            setInstallmentDetails((prev) => ({
                                                                ...prev,
                                                                dueDate: event.target.value.replace(/[^\d]/g, "").slice(0, 2),
                                                            }))
                                                        }
                                                        inputMode="numeric"
                                                        placeholder="10"
                                                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-200"
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            <div className="grid min-w-0 grid-cols-[1fr_120px] gap-3">
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

                                <label className="block min-w-0 space-y-2">
                                    <span className="text-sm font-semibold text-slate-600">
                                        Waktu
                                    </span>

                                    <input
                                        value={form.time}
                                        onChange={(event) =>
                                            setForm((prev) => ({
                                                ...prev,
                                                time: event.target.value,
                                            }))
                                        }
                                        type="time"
                                        style={{ WebkitAppearance: "none" }}
                                        className="w-full min-w-0 max-w-full appearance-none rounded-2xl border border-slate-200 bg-white px-3 py-3 text-base outline-none focus:ring-2 focus:ring-pink-200"
                                    />
                                </label>
                            </div>

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
                                        onChange={(event) => {
                                            setQuery(event.target.value);
                                            setHistoryPage(1);
                                        }}
                                        placeholder="Search"
                                        className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white py-2 pl-9 pr-3 outline-none focus:ring-2 focus:ring-pink-200"
                                    />
                                </div>

                                <select
                                    value={categoryFilter}
                                    onChange={(event) => {
                                        setCategoryFilter(event.target.value);
                                        setHistoryPage(1);
                                    }}
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
                                    onChange={(event) => {
                                        setSourceFilter(event.target.value);
                                        setHistoryPage(1);
                                    }}
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
                            dateGroups={groupedPageTransactions}
                            deleteTransaction={deleteTransaction}
                            updateTransaction={updateTransaction}
                            accounts={accounts}
                            addInstallment={addInstallment}
                            addTransaction={addTransaction}
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
                                    disabled={safeHistoryPage === 1}
                                    onClick={() => setHistoryPage(safeHistoryPage - 1)}
                                >
                                    Previous
                                </Button>

                                <span className="text-slate-500">
                                    Page {safeHistoryPage} / {totalHistoryPages}
                                </span>

                                <Button
                                    type="button"
                                    variant="outline"
                                    className="rounded-xl border-slate-200"
                                    disabled={safeHistoryPage === totalHistoryPages}
                                    onClick={() => setHistoryPage(safeHistoryPage + 1)}
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
