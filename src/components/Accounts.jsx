import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Search,
    Plus,
    Trash2,
    Landmark,
    PiggyBank,
    CreditCard,
    Wallet,
    Pencil,
    Check,
    X,
    SlidersHorizontal,
    Banknote,
} from "lucide-react";

import { formatCurrency } from "../utils/currency";
import { findCreditCardForSource } from "../utils/accountBalance";
import { getCurrentCycleStart, getStatementDay } from "../utils/billingCycle";
import { getInstallmentBaseTitle } from "../utils/installmentTitle";

const CARD_COLORS = ["#0f172a", "#1e293b", "#1d4ed8", "#78350f", "#1e3a8a"];

export default function Accounts({
    accounts,
    error,
    addAccount,
    deleteAccount,
    updateStartingBalance,
    updateAccountFields,
    installments = [],
    deleteInstallment,
    transactions = [],
    deleteTransaction,
}) {
    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState("all");
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editBalanceVal, setEditBalanceVal] = useState("");
    const [editCardVal, setEditCardVal] = useState({ startingBalance: "", totalLimit: "", dueDate: "" });
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [paymentAccountId, setPaymentAccountId] = useState(null);
    const [paymentForm, setPaymentForm] = useState({ amount: "", date: new Date().toISOString().split("T")[0] });
    const [paymentLoading, setPaymentLoading] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState({});

    // Modal form state
    const emptyNewAccount = {
        name: "",
        type: "Bank",
        startingBalance: "",
        issuer: "",
        productName: "",
        sharesLimit: false,
        totalLimit: "",
        dueDate: "",
        color: CARD_COLORS[0],
    };
    const [newAccount, setNewAccount] = useState(emptyNewAccount);
    const isCreditCardForm = newAccount.type === "Kartu Kredit";

    // Display balances exactly as stored in Google Sheets.
    const accountsWithBalances = useMemo(() => {
        return accounts.map((account) => ({
            ...account,
            balance: Number(account.startingBalance) || 0,
        }));
    }, [accounts]);

    const totalAccountBalance = useMemo(() => {
        // Kartu kredit nyimpen "saldo terpakai" (utang), bukan saldo yang dimiliki --
        // jangan ikut dijumlah ke Total Saldo Akun.
        return accountsWithBalances
            .filter((acc) => acc.type !== "Kartu Kredit")
            .reduce((sum, acc) => sum + acc.balance, 0);
    }, [accountsWithBalances]);

    // Filter accounts based on query and type filter
    const filteredAccounts = useMemo(() => {
        return accountsWithBalances.filter((acc) => {
            const matchesSearch = acc.name
                .toLowerCase()
                .includes(searchQuery.toLowerCase());
            const matchesType =
                filterType === "all" ||
                acc.type.toLowerCase() === filterType.toLowerCase();
            return matchesSearch && matchesType;
        });
    }, [accountsWithBalances, searchQuery, filterType]);

    const regularAccounts = useMemo(
        () => filteredAccounts.filter((acc) => acc.type !== "Kartu Kredit"),
        [filteredAccounts]
    );

    const creditCardAccounts = useMemo(
        () => filteredAccounts.filter((acc) => acc.type === "Kartu Kredit"),
        [filteredAccounts]
    );

    const creditCardTotals = useMemo(() => {
        const totalLimit = creditCardAccounts.reduce((sum, acc) => sum + (Number(acc.totalLimit) || 0), 0);
        // acc.balance sudah mencerminkan cicilan (transaksi "... ke N" nambah ke
        // balance kartu lewat jalur normal) -- jangan tambah installments.remainingBalance
        // lagi di sini, itu bikin double-count (lihat widget per-kartu di bawah yang
        // cuma pakai acc.balance).
        const used = creditCardAccounts.reduce((sum, acc) => sum + (Number(acc.balance) || 0), 0);
        const utilization = totalLimit > 0 ? (used / totalLimit) * 100 : 0;
        return { totalLimit, used, remaining: totalLimit - used, utilization };
    }, [creditCardAccounts, installments]);

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        if (!newAccount.name.trim()) return;

        const wasSaved = await addAccount({
            name: newAccount.name,
            type: newAccount.type,
            startingBalance: Number(newAccount.startingBalance.replace(/[^\d-]/g, "")) || 0,
            ...(isCreditCardForm && {
                issuer: newAccount.issuer.trim(),
                productName: newAccount.productName.trim(),
                sharesLimit: newAccount.sharesLimit,
                totalLimit: Number(String(newAccount.totalLimit).replace(/[^\d]/g, "")) || 0,
                dueDate: newAccount.dueDate ? Number(newAccount.dueDate) : null,
                color: newAccount.color,
            }),
        });

        if (!wasSaved) return;

        // Reset
        setNewAccount(emptyNewAccount);
        setShowAddModal(false);
    };

    const handleEditClick = (acc) => {
        setEditingId(acc.id);
        if (acc.type === "Kartu Kredit") {
            setEditCardVal({
                startingBalance: String(acc.balance),
                totalLimit: acc.totalLimit ? String(acc.totalLimit) : "",
                dueDate: acc.dueDate ? String(acc.dueDate) : "",
            });
        } else {
            setEditBalanceVal(String(acc.balance));
        }
    };

    const handleEditSave = async (acc) => {
        if (acc.type === "Kartu Kredit") {
            const wasSaved = await updateAccountFields(acc.id, {
                startingBalance: Number(String(editCardVal.startingBalance).replace(/[^\d-]/g, "")) || 0,
                totalLimit: Number(String(editCardVal.totalLimit).replace(/[^\d]/g, "")) || 0,
                dueDate: editCardVal.dueDate ? Number(editCardVal.dueDate) : null,
            });
            if (wasSaved) {
                setEditingId(null);
            }
            return;
        }

        const parsedVal = Number(String(editBalanceVal).replace(/[^\d-]/g, "")) || 0;
        const wasSaved = await updateStartingBalance(acc.id, parsedVal);
        if (wasSaved) {
            setEditingId(null);
        }
    };

    const handleEditCancel = () => {
        setEditingId(null);
    };

    const handlePaymentSubmit = async (e) => {
        e.preventDefault();
        if (!paymentAccountId || !paymentForm.amount || !paymentForm.date) return;

        const amount = Number(String(paymentForm.amount).replace(/[^\d-]/g, "")) || 0;
        if (amount <= 0) return;

        setPaymentLoading(true);
        try {
            const response = await fetch(`/api/accounts/${paymentAccountId}/pay-cc`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount, date: paymentForm.date }),
            });

            if (response.ok) {
                // Refresh account list
                const refreshResp = await fetch("/api/accounts");
                if (refreshResp.ok) {
                    const data = await refreshResp.json();
                    // Trigger parent to re-fetch accounts (via callback)
                    // For now, just close modal and let parent handle refresh
                }
                setShowPaymentModal(false);
                setPaymentForm({ amount: "", date: new Date().toISOString().split("T")[0] });
                setPaymentAccountId(null);
            } else {
                const err = await response.json();
                alert("Error: " + (err.error || "Payment failed"));
            }
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            setPaymentLoading(false);
        }
    };

    // Helper to get corresponding icon for account type
    const getAccountIcon = (type, name) => {
        const lowerName = name.toLowerCase();
        const lowerType = type.toLowerCase();

        if (lowerType === "savings" || lowerType === "tabungan" || lowerName.includes("saving")) {
            return PiggyBank;
        }
        if (lowerType === "credit card" || lowerType === "kartu kredit" || lowerName.includes("credit")) {
            return CreditCard;
        }
        if (lowerType === "e-wallet" || lowerName.includes("gopay") || lowerName.includes("ovo") || lowerName.includes("dana") || lowerName.includes("shopeepay")) {
            return Wallet;
        }
        if (lowerType === "cash" || lowerType === "tunai" || lowerName.includes("cash") || lowerName.includes("tunai")) {
            return Banknote;
        }
        return Landmark;
    };

    // Helper to get soft color class for the icon background
    const getAccountColorClass = (name, type) => {
        const lowerName = name.toLowerCase();
        const lowerType = type.toLowerCase();

        if (lowerName.includes("bca")) {
            return "bg-blue-100 text-blue-600";
        }
        if (lowerName.includes("mandiri")) {
            return "bg-amber-100 text-amber-600";
        }
        if (lowerName.includes("blu")) {
            return "bg-cyan-100 text-cyan-600";
        }
        if (lowerName.includes("superbank")) {
            return "bg-indigo-100 text-indigo-600";
        }
        if (lowerType === "savings" || lowerType === "tabungan") {
            return "bg-emerald-100 text-emerald-600";
        }
        if (lowerType === "credit card") {
            return "bg-rose-100 text-rose-600";
        }
        if (lowerType === "cash" || lowerType === "tunai") {
            return "bg-green-100 text-green-600";
        }
        return "bg-slate-100 text-slate-600";
    };

    // Format number formatting on typing starting balance
    const handleBalanceChange = (val, setter) => {
        const isNegative = String(val).startsWith('-');
        const cleanNumber = String(val).replace(/[^\d]/g, "");
        if (cleanNumber === "") {
            setter(isNegative ? "-" : "");
            return;
        }
        const formatted = new Intl.NumberFormat("id-ID").format(Number(cleanNumber));
        setter(isNegative ? "-" + formatted : formatted);
    };

    const renderAccountItem = (account) => {
        const IconComponent = getAccountIcon(account.type, account.name);
        const isEditing = editingId === account.id;
        const isCard = account.type === "Kartu Kredit";
        const isCardEditing = isEditing && isCard;

        return (
            <motion.div
                key={account.id}
                layout
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-2xl border border-white/70 bg-white/85 p-4 shadow-md backdrop-blur transition hover:shadow-lg"
            >
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${getAccountColorClass(account.name, account.type)}`}>
                            <IconComponent className="h-6 w-6" />
                        </div>

                        <div className="min-w-0">
                            <p className="text-base font-bold text-slate-900 truncate">
                                {account.name}
                            </p>
                            <p className="text-xs font-semibold text-slate-500">
                                {account.type} • IDR
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                        {isCardEditing ? (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => handleEditSave(account)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 transition"
                                >
                                    <Check className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={handleEditCancel}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ) : isEditing ? (
                            <div className="flex items-center gap-2">
                                <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-bold">
                                    <span className="mr-1 text-slate-500">Rp</span>
                                    <input
                                        value={editBalanceVal}
                                        onChange={(e) => handleBalanceChange(e.target.value, setEditBalanceVal)}
                                        className="w-28 outline-none"
                                        autoFocus
                                    />
                                </div>
                                <button
                                    onClick={() => handleEditSave(account)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white hover:bg-slate-800 transition"
                                >
                                    <Check className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={handleEditCancel}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <div className="text-right">
                                <p className="text-base font-black text-slate-900">
                                    {formatCurrency(account.balance)}
                                </p>
                            </div>
                        )}

                        {!isEditing && (
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => handleEditClick(account)}
                                    title="Ubah Saldo Awal"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-500 hover:bg-slate-50 transition"
                                >
                                    <Pencil className="h-4 w-4" />
                                </button>
                                <button
                                    onClick={() => deleteAccount(account.id)}
                                    title="Hapus Akun"
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-100 transition"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {isCardEditing ? (
                    <div className="mt-3 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-600">
                                    Total Limit (Rp)
                                </label>
                                <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
                                    <span className="mr-1 text-slate-500">Rp</span>
                                    <input
                                        value={editCardVal.totalLimit}
                                        onChange={(e) =>
                                            handleBalanceChange(e.target.value, (val) =>
                                                setEditCardVal((prev) => ({ ...prev, totalLimit: val }))
                                            )
                                        }
                                        className="w-full outline-none"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-bold text-slate-600">
                                    Saldo Terpakai (Rp)
                                </label>
                                <div className="flex items-center overflow-hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold">
                                    <span className="mr-1 text-slate-500">Rp</span>
                                    <input
                                        value={editCardVal.startingBalance}
                                        onChange={(e) =>
                                            handleBalanceChange(e.target.value, (val) =>
                                                setEditCardVal((prev) => ({ ...prev, startingBalance: val }))
                                            )
                                        }
                                        className="w-full outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-bold text-slate-600">
                                Tanggal Jatuh Tempo (tanggal di bulan)
                            </label>
                            <input
                                value={editCardVal.dueDate}
                                onChange={(e) =>
                                    setEditCardVal((prev) => ({
                                        ...prev,
                                        dueDate: e.target.value.replace(/[^\d]/g, "").slice(0, 2),
                                    }))
                                }
                                inputMode="numeric"
                                placeholder="25"
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold outline-none"
                            />
                        </div>
                    </div>
                ) : (
                    account.type === "Kartu Kredit" && Number(account.totalLimit) > 0 && (
                        <div
                            className="mt-3 rounded-2xl p-4 text-white"
                            style={{ backgroundColor: account.color || "#0f172a" }}
                        >
                            {(() => {
                                const totalLimit = Number(account.totalLimit) || 0;
                                const used = Number(account.balance) || 0;
                                const remaining = totalLimit - used;
                                const usedPct = totalLimit > 0
                                    ? Math.min(100, Math.max(0, (used / totalLimit) * 100))
                                    : 0;

                                return (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-semibold text-white/70">
                                                Remaining limit
                                            </span>
                                            <span className="text-lg font-black">
                                                {formatCurrency(remaining)}
                                            </span>
                                        </div>
                                        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                                            <div
                                                className="h-full rounded-full bg-white"
                                                style={{ width: `${usedPct}%` }}
                                            />
                                        </div>
                                        <div className="mt-2 flex items-center justify-between text-xs font-semibold text-white/70">
                                            <span>
                                                Used {formatCurrency(used)} / {formatCurrency(totalLimit)}
                                            </span>
                                            {account.dueDate ? (
                                                <span>Due Day {account.dueDate}</span>
                                            ) : null}
                                        </div>
                                        {used > 0 && (
                                            <button
                                                onClick={() => {
                                                    setPaymentAccountId(account.id);
                                                    setPaymentForm({ amount: String(used), date: new Date().toISOString().split("T")[0] });
                                                    setShowPaymentModal(true);
                                                }}
                                                className="mt-3 w-full rounded-lg bg-white/20 px-3 py-2 text-sm font-bold text-white hover:bg-white/30 transition"
                                            >
                                                Bayar Tagihan
                                            </button>
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                    )
                )}

                {isCard && !isEditing && (() => {
                    // Cuma tampilkan transaksi sejak tutup buku terakhir -- yang
                    // sebelum itu sudah masuk tagihan yang lalu.
                    const cycleStart = getCurrentCycleStart(getStatementDay(account));
                    const cardTransactions = transactions.filter(
                        (t) =>
                            t.danaDipakai === "Spend CC" &&
                            t.date >= cycleStart &&
                            findCreditCardForSource(accounts, t.source)?.id === account.id
                    );
                    if (cardTransactions.length === 0) return null;

                    // Cicilan parent (installmentTotalLoan > 0) jadi header kartu,
                    // transaksi lain dengan judul sama = pembayaran cicilannya.
                    const parents = cardTransactions.filter(
                        (t) => Number(t.installmentTotalLoan) > 0
                    );
                    const parentBaseTitles = new Set(
                        parents.map((t) => getInstallmentBaseTitle(t.title))
                    );

                    const cardInstallments = installments.filter(
                        (i) => i.accountId === account.id
                    );

                    const groups = new Map();
                    parents.forEach((parent) => {
                        const baseTitle = getInstallmentBaseTitle(parent.title);
                        groups.set(baseTitle, {
                            parent,
                            // Parent ikut dihitung: dia juga salah satu pembayaran,
                            // cuma kebetulan yang nyimpen total pinjamannya.
                            // Diurut menaik biar kebaca cicilan ke-1, ke-2, dst.
                            children: cardTransactions
                                .filter((t) => getInstallmentBaseTitle(t.title) === baseTitle)
                                .sort((a, b) => String(a.date).localeCompare(String(b.date))),
                            installment: cardInstallments.find(
                                (i) => getInstallmentBaseTitle(i.name) === baseTitle
                            ),
                        });
                    });

                    const ungrouped = cardTransactions.filter(
                        (t) => !parentBaseTitles.has(getInstallmentBaseTitle(t.title))
                    );
                    const toggleGroup = (groupKey) => {
                        setExpandedGroups((prev) => ({
                            ...prev,
                            [groupKey]: !prev[groupKey],
                        }));
                    };

                    return (
                        <div className="mt-3 space-y-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
                                Riwayat Transaksi ({cardTransactions.length})
                            </p>

                            {/* Grouped installments */}
                            {Array.from(groups.entries()).map(([title, { parent, children, installment }]) => {
                                const isExpanded = expandedGroups[title];

                                return (
                                    <div key={title}>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => toggleGroup(title)}
                                                className="min-w-0 flex-1 flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 hover:bg-slate-100 transition text-left"
                                            >
                                                <div className="min-w-0">
                                                    <p className="truncate text-xs font-bold text-slate-700">
                                                        {title}
                                                    </p>
                                                    <p className="text-[11px] font-semibold text-slate-500">
                                                        {installment
                                                            ? `Sisa ${formatCurrency(installment.remainingBalance)} dari ${formatCurrency(installment.totalLoan)}`
                                                            : `Cicilan • ${children.length}x pembayaran`}
                                                        {installment?.remainingTerm ? ` • ${installment.remainingTerm}x` : ""}
                                                        {installment?.dueDate ? ` • Tgl ${installment.dueDate}` : ""}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <p className="text-xs font-bold text-slate-700">
                                                        {formatCurrency(parent.installmentTotalLoan)}
                                                    </p>
                                                    <svg
                                                        className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </div>
                                            </button>
                                            {installment && (
                                                <button
                                                    onClick={() => deleteInstallment?.(installment.id)}
                                                    title="Hapus Cicilan"
                                                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </button>
                                            )}
                                        </div>

                                        {isExpanded && (
                                            <div className="mt-1 ml-4 space-y-1 border-l-2 border-slate-200 pl-3">
                                                {children.map((t) => (
                                                    <div
                                                        key={t.id}
                                                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2"
                                                    >
                                                        <div>
                                                            <p className="text-xs font-bold text-slate-700">
                                                                {t.title}
                                                            </p>
                                                            <p className="text-[11px] font-semibold text-slate-500">
                                                                {t.date}
                                                                {t.time ? ` • ${t.time}` : ""}
                                                            </p>
                                                        </div>
                                                        <div className="flex shrink-0 items-center gap-2">
                                                            <p className="text-xs font-bold text-slate-700">
                                                                {formatCurrency(t.amount)}
                                                            </p>
                                                            <input
                                                                type="checkbox"
                                                                title="Tandai lunas & hapus dari tagihan"
                                                                onChange={() => deleteTransaction?.(t.id)}
                                                                className="h-4 w-4 rounded border-slate-300 text-pink-600"
                                                            />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Ungrouped transactions */}
                            {ungrouped.map((t) => (
                                <div
                                    key={t.id}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-xs font-bold text-slate-700">
                                            {t.title}
                                        </p>
                                        <p className="text-[11px] font-semibold text-slate-500">
                                            {t.date}
                                            {t.time ? ` • ${t.time}` : ""}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        <p className="text-xs font-bold text-slate-700">
                                            {formatCurrency(t.amount)}
                                        </p>
                                        <input
                                            type="checkbox"
                                            title="Tandai lunas & hapus dari tagihan"
                                            onChange={() => deleteTransaction?.(t.id)}
                                            className="h-4 w-4 rounded border-slate-300 text-pink-600"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    );
                })()}
            </motion.div>
        );
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-black tracking-tight text-slate-900">
                Akun
            </h1>

            {/* Total saldo akun */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-[2rem] border border-white/70 bg-gradient-to-br from-zinc-800 to-zinc-900 p-6 text-white shadow-xl backdrop-blur md:p-8"
            >
                <p className="text-sm font-semibold text-white/70">
                    Total Saldo Akun
                </p>

                <p className="mt-2 text-4xl font-black tracking-tight md:text-5xl">
                    {formatCurrency(totalAccountBalance)}
                </p>

                <p className="mt-4 text-xs font-semibold text-white/50">
                    {accounts.length} Akun Terdaftar
                </p>
            </motion.div>

            {/* List Controls */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-black text-slate-950">
                    Akun Saya
                </h2>

                <button
                    onClick={() => setShowAddModal(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition active:scale-95 shrink-0"
                >
                    <Plus className="h-4 w-4 text-slate-600" />
                    Tambah
                </button>
            </div>

            {/* Search and Filter */}
            <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                    <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari akun..."
                        className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 outline-none focus:ring-2 focus:ring-pink-200"
                    />
                </div>

                <div className="relative flex items-center">
                    <SlidersHorizontal className="absolute left-4 h-4 w-4 text-slate-400 pointer-events-none" />
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 rounded-2xl border border-slate-200 bg-white outline-none focus:ring-2 focus:ring-pink-200 appearance-none"
                    >
                        <option value="all">Semua Tipe</option>
                        <option value="bank">Bank</option>
                        <option value="tabungan">Tabungan</option>
                        <option value="e-wallet">E-Wallet</option>
                        <option value="credit card">Kartu Kredit</option>
                        <option value="tunai">Tunai</option>
                    </select>
                </div>
            </div>

            {/* Accounts List */}
            <div className="grid gap-3">
                {regularAccounts.length > 0 ? (
                    regularAccounts.map(renderAccountItem)
                ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                        Tidak ada akun ditemukan. Klik "+ Tambah" untuk menambahkan akun baru.
                    </div>
                )}
            </div>

            {/* Credit Card Section */}
            {creditCardAccounts.length > 0 && (
                <div className="space-y-3">
                    <h2 className="text-xl font-black text-slate-950">
                        Credit Card
                    </h2>

                    <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-gradient-to-br from-zinc-800 to-zinc-900 p-6 text-white shadow-xl backdrop-blur md:p-8">
                        <p className="text-xl font-black">Cards</p>

                        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="rounded-2xl bg-white/10 p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-white/50">
                                    Total Limit
                                </p>
                                <p className="mt-1 truncate text-base font-black sm:text-lg">
                                    {formatCurrency(creditCardTotals.totalLimit)}
                                </p>
                            </div>
                            <div className="rounded-2xl bg-white/10 p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-white/50">
                                    Limit Used
                                </p>
                                <p className="mt-1 truncate text-base font-black sm:text-lg">
                                    {formatCurrency(creditCardTotals.used)}
                                </p>
                            </div>
                            <div className="rounded-2xl bg-white/10 p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-white/50">
                                    Remaining Limit
                                </p>
                                <p className="mt-1 truncate text-base font-black sm:text-lg">
                                    {formatCurrency(creditCardTotals.remaining)}
                                </p>
                            </div>
                            <div className="rounded-2xl bg-white/10 p-4">
                                <p className="text-xs font-bold uppercase tracking-wide text-white/50">
                                    Utilization
                                </p>
                                <p className="mt-1 truncate text-base font-black sm:text-lg">
                                    {creditCardTotals.utilization.toFixed(1)}%
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-3">
                        {creditCardAccounts.map(renderAccountItem)}
                    </div>
                </div>
            )}

            {/* Modal Tambah Akun */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-[2rem] border border-slate-100 bg-white p-6 shadow-2xl"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-black text-slate-950">
                                    Tambah Akun Baru
                                </h3>
                                <button
                                    onClick={() => setShowAddModal(false)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-400 hover:bg-slate-50 transition"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <form onSubmit={handleAddSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">
                                        Nama Akun
                                    </label>
                                    <input
                                        value={newAccount.name}
                                        onChange={(e) =>
                                            setNewAccount((prev) => ({
                                                ...prev,
                                                name: e.target.value,
                                            }))
                                        }
                                        placeholder="e.g. BCA, Tabungan Haji, OVO"
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-pink-200 font-medium text-slate-900"
                                        required
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">
                                        Tipe Akun
                                    </label>
                                    <select
                                        value={newAccount.type}
                                        onChange={(e) =>
                                            setNewAccount((prev) => ({
                                                ...prev,
                                                type: e.target.value,
                                            }))
                                        }
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-pink-200 font-medium text-slate-900"
                                    >
                                        <option value="Bank">Bank</option>
                                        <option value="Tabungan">Tabungan (Savings)</option>
                                        <option value="E-Wallet">E-Wallet</option>
                                        <option value="Kartu Kredit">Kartu Kredit</option>
                                        <option value="Tunai">Tunai (Cash)</option>
                                    </select>
                                </div>

                                {isCreditCardForm ? (
                                    <>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700">
                                                    Bank / Penerbit
                                                </label>
                                                <input
                                                    value={newAccount.issuer}
                                                    onChange={(e) =>
                                                        setNewAccount((prev) => ({
                                                            ...prev,
                                                            issuer: e.target.value,
                                                        }))
                                                    }
                                                    placeholder="Chase"
                                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-pink-200 font-medium text-slate-900"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-bold text-slate-700">
                                                    Nama Produk
                                                </label>
                                                <input
                                                    value={newAccount.productName}
                                                    onChange={(e) =>
                                                        setNewAccount((prev) => ({
                                                            ...prev,
                                                            productName: e.target.value,
                                                        }))
                                                    }
                                                    placeholder="Everyday Card"
                                                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-pink-200 font-medium text-slate-900"
                                                />
                                            </div>
                                        </div>

                                        <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                                            <input
                                                type="checkbox"
                                                checked={newAccount.sharesLimit}
                                                onChange={(e) =>
                                                    setNewAccount((prev) => ({
                                                        ...prev,
                                                        sharesLimit: e.target.checked,
                                                    }))
                                                }
                                                className="h-4 w-4 rounded border-slate-300 text-pink-500 focus:ring-pink-200"
                                            />
                                            Kartu ini berbagi limit dengan kartu lain
                                        </label>

                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-700">
                                                Total Limit (Rp)
                                            </label>
                                            <div className="flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:ring-2 focus-within:ring-pink-200">
                                                <span className="mr-2 text-lg font-bold text-slate-500">Rp</span>
                                                <input
                                                    value={newAccount.totalLimit}
                                                    onChange={(e) =>
                                                        handleBalanceChange(
                                                            e.target.value,
                                                            (val) =>
                                                                setNewAccount((prev) => ({
                                                                    ...prev,
                                                                    totalLimit: val,
                                                                }))
                                                        )
                                                    }
                                                    inputMode="numeric"
                                                    placeholder="20.000.000"
                                                    className="w-full outline-none font-bold text-slate-900 text-lg"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-700">
                                                Saldo Terpakai Saat Ini (Rp)
                                            </label>
                                            <div className="flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:ring-2 focus-within:ring-pink-200">
                                                <span className="mr-2 text-lg font-bold text-slate-500">Rp</span>
                                                <input
                                                    value={newAccount.startingBalance}
                                                    onChange={(e) =>
                                                        handleBalanceChange(
                                                            e.target.value,
                                                            (val) =>
                                                                setNewAccount((prev) => ({
                                                                    ...prev,
                                                                    startingBalance: val,
                                                                }))
                                                        )
                                                    }
                                                    inputMode="numeric"
                                                    placeholder="0"
                                                    className="w-full outline-none font-bold text-slate-900 text-lg"
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-700">
                                                Tanggal Jatuh Tempo (tanggal di bulan)
                                            </label>
                                            <input
                                                value={newAccount.dueDate}
                                                onChange={(e) =>
                                                    setNewAccount((prev) => ({
                                                        ...prev,
                                                        dueDate: e.target.value.replace(/[^\d]/g, "").slice(0, 2),
                                                    }))
                                                }
                                                inputMode="numeric"
                                                placeholder="25"
                                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-pink-200 font-medium text-slate-900"
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-slate-700">
                                                Warna Kartu
                                            </label>
                                            <div className="flex items-center gap-2">
                                                {CARD_COLORS.map((c) => (
                                                    <button
                                                        key={c}
                                                        type="button"
                                                        onClick={() =>
                                                            setNewAccount((prev) => ({ ...prev, color: c }))
                                                        }
                                                        style={{ backgroundColor: c }}
                                                        className={`h-9 w-9 rounded-full border-2 transition ${
                                                            newAccount.color === c
                                                                ? "border-pink-400 ring-2 ring-pink-200"
                                                                : "border-white shadow"
                                                        }`}
                                                    />
                                                ))}
                                                <div className="mx-1 h-7 w-px bg-slate-200" />
                                                <label
                                                    className="relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-white shadow"
                                                    style={{
                                                        background:
                                                            "conic-gradient(red, yellow, lime, cyan, blue, magenta, red)",
                                                    }}
                                                >
                                                    <input
                                                        type="color"
                                                        value={newAccount.color}
                                                        onChange={(e) =>
                                                            setNewAccount((prev) => ({
                                                                ...prev,
                                                                color: e.target.value,
                                                            }))
                                                        }
                                                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                                                    />
                                                </label>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-slate-700">
                                            Saldo Awal
                                        </label>
                                        <div className="flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:ring-2 focus-within:ring-pink-200">
                                            <span className="mr-2 text-lg font-bold text-slate-500">Rp</span>
                                            <input
                                                value={newAccount.startingBalance}
                                                onChange={(e) =>
                                                    handleBalanceChange(
                                                        e.target.value,
                                                        (val) =>
                                                            setNewAccount((prev) => ({
                                                                ...prev,
                                                                startingBalance: val,
                                                            }))
                                                    )
                                                }
                                                inputMode="numeric"
                                                placeholder="10.000.000"
                                                className="w-full outline-none font-bold text-slate-900 text-lg"
                                            />
                                        </div>
                                    </div>
                                )}

                                {error && (
                                    <p className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
                                        {error}
                                    </p>
                                )}

                                <div className="pt-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowAddModal(false)}
                                        className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm font-bold text-slate-500 hover:bg-slate-50 transition"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-500 py-3.5 text-sm font-bold text-white hover:opacity-95 shadow-md hover:shadow-lg transition"
                                    >
                                        Simpan Akun
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}

                {/* Payment Modal */}
                {showPaymentModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-md rounded-[2rem] border border-slate-100 bg-white p-6 shadow-2xl"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-black text-slate-950">
                                    Bayar Tagihan CC
                                </h3>
                                <button
                                    onClick={() => setShowPaymentModal(false)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-400 hover:bg-slate-50 transition"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            <form onSubmit={handlePaymentSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">
                                        Jumlah Pembayaran (Rp)
                                    </label>
                                    <div className="flex items-center overflow-hidden rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:ring-2 focus-within:ring-pink-200">
                                        <span className="mr-2 text-lg font-bold text-slate-500">Rp</span>
                                        <input
                                            value={paymentForm.amount}
                                            onChange={(e) =>
                                                handleBalanceChange(e.target.value, (val) =>
                                                    setPaymentForm((prev) => ({ ...prev, amount: val }))
                                                )
                                            }
                                            inputMode="numeric"
                                            placeholder="0"
                                            className="w-full outline-none font-bold text-slate-900 text-lg"
                                            autoFocus
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-slate-700">
                                        Tanggal Pembayaran
                                    </label>
                                    <input
                                        type="date"
                                        value={paymentForm.date}
                                        onChange={(e) =>
                                            setPaymentForm((prev) => ({ ...prev, date: e.target.value }))
                                        }
                                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-pink-200 font-medium text-slate-900"
                                    />
                                </div>

                                <div className="pt-4 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowPaymentModal(false)}
                                        disabled={paymentLoading}
                                        className="flex-1 rounded-2xl border border-slate-200 py-3.5 text-sm font-bold text-slate-500 hover:bg-slate-50 transition disabled:opacity-50"
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={paymentLoading}
                                        className="flex-1 rounded-2xl bg-gradient-to-r from-pink-500 to-indigo-500 py-3.5 text-sm font-bold text-white hover:opacity-95 shadow-md hover:shadow-lg transition disabled:opacity-50"
                                    >
                                        {paymentLoading ? "Memproses..." : "Bayar"}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
