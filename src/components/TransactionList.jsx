import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
    Check,
    Pencil,
    Trash2,
    X,
    ChevronDown,
    Package,
} from "lucide-react";

import { Button } from "./ui/button";
import { formatCurrency } from "../utils/currency";
import { formatDisplayDate, normalizeDate } from "../utils/date";
import { findCreditCardForSource } from "../utils/accountBalance";
import {
    formatInstallmentTitle,
    getInstallmentBaseTitle,
} from "../utils/installmentTitle";

import {
    categories,
    danaDipakaiOptions,
    fundSources,
} from "../constants/options";

// Emoji + warna disamain persis sama mobile app (mobile/App.js CATEGORY_ICONS)
// biar tampilan list transaksi konsisten di web & mobile.
const categoryIcons = {
    "Account Transfer": { emoji: "🔁", bg: "#dcfce7" },
    Food: { emoji: "🍔", bg: "#ffedd5" },
    Transportation: { emoji: "🚗", bg: "#dbeafe" },
    Groceries: { emoji: "🛒", bg: "#fef9c3" },
    Utilities: { emoji: "💡", bg: "#fef3c7" },
    Entertainment: { emoji: "🎮", bg: "#fce7f3" },
    Internet: { emoji: "🌐", bg: "#cffafe" },
    Shopping: { emoji: "🛍️", bg: "#ede9fe" },
    Health: { emoji: "❤️", bg: "#ffe4e6" },
    Education: { emoji: "📚", bg: "#e0e7ff" },
    Miscellaneous: { emoji: "✨", bg: "#f1f5f9" },
};

const WEEKDAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const formatDayHeader = (dateStr) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return `${WEEKDAYS[dow]}, ${formatDisplayDate(dateStr)}`;
};

const emptyInstallmentDetails = {
    provider: "",
    totalLoan: "",
    remainingTerm: "",
    dueDate: "",
};

export default function TransactionList({
    dateGroups = [],
    deleteTransaction,
    updateTransaction,
    accounts = [],
    addInstallment,
    addTransaction,
}) {
    const [editingId, setEditingId] = useState("");
    const [expandedGroups, setExpandedGroups] = useState({});
    const [paidInstallments, setPaidInstallments] = useState({});

    const transactions = useMemo(
        () => dateGroups.flatMap((group) => group.items),
        [dateGroups]
    );

    const [editForm, setEditForm] = useState({
        title: "",
        amount: "",
        category: "Food",
        source: "Mandiri",
        danaDipakai: "Spend Bulanan",
        type: "expense",
        date: "",
        time: "",
    });

    const [isInstallment, setIsInstallment] = useState(false);
    const [installmentDetails, setInstallmentDetails] = useState(emptyInstallmentDetails);

    // Simple grouping: if base title (tanpa suffix " ke N") muncul lebih dari
    // sekali = installment group. Tiap baris cicilan dikasih judul beda
    // ("Chakolab ke 1", "ke 2", dst) biar gampang dibedain di list, jadi
    // pencocokan grup harus lewat base title, bukan title persis.
    const groupedTransactions = useMemo(() => {
        const titleCounts = {};
        transactions.forEach(tx => {
            const baseTitle = getInstallmentBaseTitle(tx.title);
            titleCounts[baseTitle] = (titleCounts[baseTitle] || 0) + 1;
        });

        const groups = {};
        const processedIds = new Set();

        // Find primary transactions (ones with installmentTotalLoan)
        transactions.filter(tx => tx.installmentTotalLoan).forEach(primary => {
            const groupKey = getInstallmentBaseTitle(primary.title);
            if (titleCounts[groupKey] > 1) {
                if (!groups[groupKey]) {
                    groups[groupKey] = {
                        key: groupKey,
                        title: groupKey,
                        totalLoan: primary.installmentTotalLoan,
                        transactions: [],
                        primary: primary,
                    };
                }
                processedIds.add(primary.id);
            }
        });

        // Add all transactions with matching base titles to groups
        transactions.forEach(tx => {
            const groupKey = getInstallmentBaseTitle(tx.title);
            if (groups[groupKey]) {
                groups[groupKey].transactions.push(tx);
                processedIds.add(tx.id);
            }
        });

        // Sort by date
        Object.values(groups).forEach(group => {
            group.transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
        });

        const ungrouped = transactions.filter(tx => !processedIds.has(tx.id));

        return { groups: Object.values(groups), ungrouped };
    }, [transactions]);

    // Transaksi cicilan udah ditampilkan sebagai card tersendiri di atas, jadi
    // di sini cuma kelompokin ulang transaksi non-cicilan per tanggal (mirror
    // tampilan mobile app: header tanggal + total pengeluaran hari itu).
    const dayGroupsForDisplay = useMemo(() => {
        const ungroupedIds = new Set(
            groupedTransactions.ungrouped.map((tx) => tx.id)
        );
        return dateGroups
            .map((group) => ({
                ...group,
                items: group.items.filter((item) => ungroupedIds.has(item.id)),
            }))
            .filter((group) => group.items.length > 0);
    }, [dateGroups, groupedTransactions]);

    const toggleGroupExpanded = (groupKey) => {
        setExpandedGroups(prev => ({ ...prev, [groupKey]: !prev[groupKey] }));
    };

    // Amount = cicilan bulanan; begitu Total Harga Barang & Sisa Tenor keisi,
    // hitung otomatis (dibulatkan ke atas) biar konsisten.
    const recalcInstallmentAmount = (totalLoanVal, remainingTermVal) => {
        const totalLoanNum = Number(String(totalLoanVal || "").replace(/[^\d]/g, ""));
        const termNum = Number(remainingTermVal || "");
        if (totalLoanNum > 0 && termNum > 0) {
            setEditForm((prev) => ({ ...prev, amount: String(Math.ceil(totalLoanNum / termNum)) }));
        }
    };

    const openEdit = (item) => {
        setEditingId(item.id);

        setEditForm({
            title: item.title,
            amount: String(item.amount),
            category: item.category,
            source: item.source,
            danaDipakai: item.danaDipakai,
            type: item.type || "expense",
            date: normalizeDate(item.date),
            time: item.time || "",
        });
        setIsInstallment(false);
        setInstallmentDetails(emptyInstallmentDetails);
    };

    const closeEdit = () => {
        setEditingId("");

        setEditForm({
            title: "",
            amount: "",
            category: "Food",
            source: "Mandiri",
            danaDipakai: "Spend Bulanan",
            type: "expense",
            date: "",
            time: "",
        });
        setIsInstallment(false);
        setInstallmentDetails(emptyInstallmentDetails);
    };

    const saveEdit = async (id) => {
        const wantsInstallment = editForm.danaDipakai === "Spend CC" && isInstallment;
        const totalLoan = Number(String(installmentDetails.totalLoan || "").replace(/[^\d]/g, ""));

        if (wantsInstallment && !totalLoan) return;

        const baseTitle = editForm.title.trim();

        const wasSaved = await updateTransaction(id, {
            ...editForm,
            title: wantsInstallment ? formatInstallmentTitle(baseTitle, 1) : editForm.title,
            installmentTotalLoan: wantsInstallment ? totalLoan : null,
        });

        if (wasSaved) {
            if (wantsInstallment && addInstallment) {
                const matchedCard = findCreditCardForSource(accounts, editForm.source);
                if (matchedCard) {
                    const monthlyAmount = Number(String(editForm.amount).replace(/[^\d]/g, ""));
                    await addInstallment({
                        accountId: matchedCard.id,
                        transactionId: id,
                        name: baseTitle,
                        provider: installmentDetails.provider.trim(),
                        totalLoan,
                        remainingBalance: totalLoan,
                        monthlyInstallment: monthlyAmount,
                        remainingTerm: installmentDetails.remainingTerm
                            ? Number(installmentDetails.remainingTerm)
                            : null,
                        dueDate: installmentDetails.dueDate
                            ? Number(installmentDetails.dueDate)
                            : null,
                    });
                }
            }

            if (wantsInstallment && addTransaction) {
                const term = Number(installmentDetails.remainingTerm) || 1;
                const [yearStr, monthStr, dayStr] = editForm.date.split('-');
                const y = parseInt(yearStr, 10);
                const m = parseInt(monthStr, 10) - 1;
                const d = parseInt(dayStr, 10);

                for (let i = 1; i < term; i++) {
                    const nextDate = new Date(y, m + i, d);
                    const outY = nextDate.getFullYear();
                    const outM = String(nextDate.getMonth() + 1).padStart(2, '0');
                    const outD = String(nextDate.getDate()).padStart(2, '0');
                    const dateString = `${outY}-${outM}-${outD}`;

                    addTransaction({
                        ...editForm,
                        title: formatInstallmentTitle(baseTitle, i + 1),
                        date: dateString,
                        installmentTotalLoan: null,
                        type: editForm.type || "expense",
                    });
                }
            }

            closeEdit();
        }
    };

    if (!transactions.length) {
        return (
            <div className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500">
                No transactions yet.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Grouped installments */}
            {groupedTransactions.groups.map((group) => (
                <motion.div
                    key={group.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="overflow-hidden rounded-[2rem] border border-pink-200 bg-gradient-to-br from-pink-50 to-purple-50 shadow-lg"
                >
                    <button
                        onClick={() => toggleGroupExpanded(group.key)}
                        className="w-full p-5 text-left hover:bg-white/50 transition"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 flex-1 items-start gap-4">
                                <div className="shrink-0 rounded-[1.4rem] bg-pink-200 p-4">
                                    <Package className="h-6 w-6 text-pink-600" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <h3 className="truncate text-xl font-black text-slate-950">
                                            {group.title}
                                        </h3>
                                        <span className="shrink-0 rounded-full bg-pink-500 px-3 py-1 text-xs font-bold text-white">
                                            Cicilian {group.transactions.length}x
                                        </span>
                                    </div>
                                    <p className="mt-2 text-sm font-semibold text-slate-500">
                                        Total: {formatCurrency(group.totalLoan)} • {group.transactions.length} pembayaran
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="text-right">
                                    <p className="text-lg font-black text-pink-600">
                                        {formatCurrency(group.transactions[0]?.amount || 0)}
                                    </p>
                                    <p className="text-xs font-medium text-slate-400">per bulan</p>
                                </div>
                                <ChevronDown
                                    className={`h-5 w-5 text-pink-600 shrink-0 transition-transform ${
                                        expandedGroups[group.key] ? 'rotate-180' : ''
                                    }`}
                                />
                            </div>
                        </div>
                    </button>

                    {expandedGroups[group.key] && (
                        <div className="border-t border-pink-200 p-5 space-y-3">
                            {group.transactions.map((tx, idx) => (
                                <div key={tx.id} className="flex items-center justify-between gap-3 rounded-xl bg-white p-4">
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <input
                                            type="checkbox"
                                            checked={paidInstallments[tx.id] || false}
                                            onChange={() => setPaidInstallments(prev => ({ ...prev, [tx.id]: !prev[tx.id] }))}
                                            className="h-5 w-5 rounded border-slate-300 text-pink-600"
                                        />
                                        <div className="min-w-0 flex-1">
                                            <p className="font-bold text-slate-900">
                                                Bayar {idx + 1}: {formatDisplayDate(tx.date)}
                                            </p>
                                            <p className="text-xs font-medium text-slate-400">
                                                {tx.category} • {tx.source}
                                            </p>
                                        </div>
                                    </div>
                                    <p className={`shrink-0 font-black ${paidInstallments[tx.id] ? 'line-through text-slate-400' : 'text-rose-500'}`}>
                                        {formatCurrency(tx.amount)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>
            ))}

            {/* Ungrouped transactions, dikelompokkan per tanggal (mirror mobile app) */}
            {dayGroupsForDisplay.map((dayGroup) => (
                <div key={dayGroup.date} className="space-y-3">
                    <div className="flex items-center justify-between px-1">
                        <h3 className="text-sm font-black text-slate-600">
                            {formatDayHeader(dayGroup.date)}
                        </h3>
                        <span className="text-sm font-bold text-rose-500">
                            Total {formatCurrency(dayGroup.total)}
                        </span>
                    </div>

                    {dayGroup.items.map((item) => {
                        const isEditing = editingId === item.id;

                        const categoryData =
                            categoryIcons[item.category] ||
                            categoryIcons["Miscellaneous"];

                        return (
                            <motion.div
                                key={item.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-lg backdrop-blur"
                            >
                                {!isEditing ? (
                                    <>
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex min-w-0 flex-1 items-start gap-4">
                                                <div
                                                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-2xl"
                                                    style={{
                                                        backgroundColor:
                                                            item.type === "income"
                                                                ? "#dcfce7"
                                                                : categoryData.bg,
                                                    }}
                                                >
                                                    {item.type === "income" ? "💰" : categoryData.emoji}
                                                </div>

                                                <div className="min-w-0 flex-1">
                                                    <div className="flex min-w-0 items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <h3 className="truncate text-xl font-black text-slate-950">
                                                                {item.title}
                                                            </h3>

                                                            <p className="mt-2 text-sm font-semibold text-slate-500">
                                                                {item.source}
                                                                {item.danaDipakai ? ` · ${item.danaDipakai}` : ""}
                                                                {item.time ? ` · ${item.time}` : ""}
                                                            </p>

                                                            {item.syncState === "pending" && (
                                                                <p className="mt-2 inline-flex rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-600">
                                                                    Queued for sync
                                                                </p>
                                                            )}

                                                            {item.syncState === "error" && (
                                                                <p className="mt-2 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">
                                                                    Will retry sync
                                                                </p>
                                                            )}
                                                        </div>

                                                        <p
                                                            className={`shrink-0 text-right text-xl font-black sm:text-2xl ${
                                                                item.type === "income"
                                                                    ? "text-emerald-500"
                                                                    : "text-rose-500"
                                                            }`}
                                                        >
                                                            {item.type === "income" ? "+" : "-"}
                                                            {formatCurrency(item.amount)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="mt-5 border-t border-slate-100 pt-4">
                                            <div className="flex items-center justify-end gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => openEdit(item)}
                                                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 active:scale-95"
                                                    aria-label="Edit transaction"
                                                >
                                                    <Pencil className="h-5 w-5" />
                                                </button>

                                                <button
                                                    type="button"
                                                    onClick={() => deleteTransaction(item.id)}
                                                    className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-100 bg-rose-50 text-rose-500 shadow-sm transition hover:bg-rose-100 active:scale-95"
                                                    aria-label="Delete transaction"
                                                >
                                                    <Trash2 className="h-5 w-5" />
                                                </button>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                            <div className="min-w-0 space-y-3 overflow-hidden">
                                <input
                                    value={editForm.title}
                                    onChange={(event) =>
                                        setEditForm((prev) => ({
                                            ...prev,
                                            title: event.target.value,
                                        }))
                                    }
                                    placeholder="Nama transaksi"
                                    className="w-full min-w-0 max-w-full rounded-2xl border-2 border-slate-100 bg-white px-3 py-2 outline-none focus:border-pink-400"
                                />

                                <input
                                    value={editForm.amount}
                                    onChange={(event) =>
                                        setEditForm((prev) => ({
                                            ...prev,
                                            amount: event.target.value,
                                        }))
                                    }
                                    inputMode="numeric"
                                    placeholder="Nominal"
                                    className="w-full min-w-0 max-w-full rounded-2xl border-2 border-slate-100 bg-white px-3 py-2 outline-none focus:border-pink-400"
                                />

                                <div className="grid min-w-0 grid-cols-[1fr_100px] gap-2">
                                    <input
                                        value={editForm.date}
                                        onChange={(event) =>
                                            setEditForm((prev) => ({
                                                ...prev,
                                                date: event.target.value,
                                            }))
                                        }
                                        type="date"
                                        style={{ WebkitAppearance: "none" }}
                                        className="w-full min-w-0 max-w-full appearance-none rounded-2xl border-2 border-slate-100 bg-white px-3 py-2 text-base outline-none focus:border-pink-400"
                                    />
                                    <input
                                        value={editForm.time}
                                        onChange={(event) =>
                                            setEditForm((prev) => ({
                                                ...prev,
                                                time: event.target.value,
                                            }))
                                        }
                                        type="time"
                                        style={{ WebkitAppearance: "none" }}
                                        className="w-full min-w-0 max-w-full appearance-none rounded-2xl border-2 border-slate-100 bg-white px-3 py-2 text-base outline-none focus:border-pink-400"
                                    />
                                </div>

                                <select
                                    value={editForm.category}
                                    onChange={(event) =>
                                        setEditForm((prev) => ({
                                            ...prev,
                                            category: event.target.value,
                                        }))
                                    }
                                    className="w-full min-w-0 max-w-full rounded-2xl border-2 border-slate-100 bg-white px-3 py-2 outline-none focus:border-pink-400"
                                >
                                    {categories.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>

                                <select
                                    value={editForm.source}
                                    onChange={(event) =>
                                        setEditForm((prev) => ({
                                            ...prev,
                                            source: event.target.value,
                                        }))
                                    }
                                    className="w-full min-w-0 max-w-full rounded-2xl border-2 border-slate-100 bg-white px-3 py-2 outline-none focus:border-pink-400"
                                >
                                    {fundSources.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>

                                <select
                                    value={editForm.danaDipakai}
                                    onChange={(event) => {
                                        setEditForm((prev) => ({
                                            ...prev,
                                            danaDipakai: event.target.value,
                                        }));
                                        if (event.target.value !== "Spend CC") {
                                            setIsInstallment(false);
                                        }
                                    }}
                                    className="w-full min-w-0 max-w-full rounded-2xl border-2 border-slate-100 bg-white px-3 py-2 outline-none focus:border-pink-400"
                                >
                                    {danaDipakaiOptions.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>

                                {editForm.danaDipakai === "Spend CC" && (
                                    <div className="space-y-3 rounded-2xl border-2 border-slate-100 bg-slate-50 p-3">
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
                                                    Amount di atas dicatat sebagai cicilan bulanan. Limit kartu akan kepotong sebesar Total Harga Barang penuh.
                                                </p>

                                                <input
                                                    value={installmentDetails.provider}
                                                    onChange={(event) =>
                                                        setInstallmentDetails((prev) => ({
                                                            ...prev,
                                                            provider: event.target.value,
                                                        }))
                                                    }
                                                    placeholder="Provider (opsional)"
                                                    className="w-full min-w-0 max-w-full rounded-xl border-2 border-slate-100 bg-white px-3 py-2 text-sm outline-none focus:border-pink-400"
                                                />

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
                                                    placeholder="Total Harga Barang (Rp)"
                                                    className="w-full min-w-0 max-w-full rounded-xl border-2 border-slate-100 bg-white px-3 py-2 text-sm outline-none focus:border-pink-400"
                                                />

                                                <div className="grid grid-cols-2 gap-2">
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
                                                        placeholder="Sisa Tenor (bulan)"
                                                        className="w-full min-w-0 max-w-full rounded-xl border-2 border-slate-100 bg-white px-3 py-2 text-sm outline-none focus:border-pink-400"
                                                    />
                                                    <input
                                                        value={installmentDetails.dueDate}
                                                        onChange={(event) =>
                                                            setInstallmentDetails((prev) => ({
                                                                ...prev,
                                                                dueDate: event.target.value.replace(/[^\d]/g, "").slice(0, 2),
                                                            }))
                                                        }
                                                        inputMode="numeric"
                                                        placeholder="Tgl Jatuh Tempo"
                                                        className="w-full min-w-0 max-w-full rounded-xl border-2 border-slate-100 bg-white px-3 py-2 text-sm outline-none focus:border-pink-400"
                                                    />
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                <div className="grid grid-cols-2 gap-2">
                                    <Button
                                        type="button"
                                        onClick={() => saveEdit(item.id)}
                                        className="rounded-2xl bg-gradient-to-r from-pink-500 to-violet-500 font-bold text-white"
                                    >
                                        <Check className="mr-2 h-4 w-4" />
                                        Save
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={closeEdit}
                                        className="rounded-2xl border-slate-200 font-bold"
                                    >
                                        <X className="mr-2 h-4 w-4" />
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
}
