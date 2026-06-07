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
import { today } from "../utils/date";

export default function Accounts({
    transactions = [],
    accounts,
    addAccount,
    deleteAccount,
    updateStartingBalance,
}) {
    const [searchQuery, setSearchQuery] = useState("");
    const [filterType, setFilterType] = useState("all");
    const [showAddModal, setShowAddModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editBalanceVal, setEditBalanceVal] = useState("");

    // Modal form state
    const [newAccount, setNewAccount] = useState({
        name: "",
        type: "Bank",
        startingBalance: "",
    });

    // Calculate current balances dynamically based on starting balance and transaction history
    const accountsWithBalances = useMemo(() => {
        return accounts.map((account) => {
            // Determine account creation date string (YYYY-MM-DD)
            const match = account.id.match(/^acc-(\d+)/);
            let creationDateString = today();
            if (match) {
                const d = new Date(Number(match[1]));
                try {
                    const jakartaDateString = d.toLocaleString("en-US", {
                        timeZone: "Asia/Jakarta",
                    });
                    const jakartaDate = new Date(jakartaDateString);
                    const year = jakartaDate.getFullYear();
                    const month = String(jakartaDate.getMonth() + 1).padStart(2, "0");
                    const day = String(jakartaDate.getDate()).padStart(2, "0");
                    creationDateString = `${year}-${month}-${day}`;
                } catch (e) {
                    creationDateString = today();
                }
            }

            const isTabunganAcc = account.name.toLowerCase() === "tabungan";
            const totalSpent = transactions.reduce((sum, t) => {
                // Ignore transactions older than the creation date of the account
                const tDate = t.date ? t.date.split("T")[0] : "";
                if (tDate < creationDateString) {
                    return sum;
                }

                const amount = Number(t.amount || 0);
                const dana = t.danaDipakai || "";
                const source = (t.source || "").toLowerCase();
                const accName = account.name.toLowerCase();

                // Spend CC does not reduce any account balance
                if (dana === "Spend CC") {
                    return sum;
                }

                // Normal transactions reduce the account whose name matches the source
                const matchesSource = (src, acc) => {
                    const s = src.trim();
                    const a = acc.trim();
                    if (s === a) return true;
                    if (s === "blu" && a.includes("blu")) return true;
                    return false;
                };

                if (matchesSource(source, accName)) {
                    return sum + amount;
                }
                return sum;
            }, 0);

            return {
                ...account,
                balance: account.startingBalance - totalSpent,
            };
        });
    }, [accounts, transactions]);

    // Total Net Worth (Kekayaan Bersih)
    const netWorth = useMemo(() => {
        return accountsWithBalances.reduce((sum, acc) => sum + acc.balance, 0);
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

    const handleAddSubmit = (e) => {
        e.preventDefault();
        if (!newAccount.name.trim()) return;

        addAccount({
            name: newAccount.name,
            type: newAccount.type,
            startingBalance: Number(newAccount.startingBalance.replace(/[^\d]/g, "")) || 0,
        });

        // Reset
        setNewAccount({
            name: "",
            type: "Bank",
            startingBalance: "",
        });
        setShowAddModal(false);
    };

    const handleEditClick = (acc) => {
        setEditingId(acc.id);
        setEditBalanceVal(String(acc.balance));
    };

    const handleEditSave = (id) => {
        const parsedVal = Number(String(editBalanceVal).replace(/[^\d]/g, "")) || 0;
        const account = accounts.find((acc) => acc.id === id);
        if (account) {
            // Determine account creation date string (YYYY-MM-DD)
            const match = account.id.match(/^acc-(\d+)/);
            let creationDateString = today();
            if (match) {
                const d = new Date(Number(match[1]));
                try {
                    const jakartaDateString = d.toLocaleString("en-US", {
                        timeZone: "Asia/Jakarta",
                    });
                    const jakartaDate = new Date(jakartaDateString);
                    const year = jakartaDate.getFullYear();
                    const month = String(jakartaDate.getMonth() + 1).padStart(2, "0");
                    const day = String(jakartaDate.getDate()).padStart(2, "0");
                    creationDateString = `${year}-${month}-${day}`;
                } catch (e) {
                    creationDateString = today();
                }
            }

            const isTabunganAcc = account.name.toLowerCase() === "tabungan";
            const totalSpent = transactions.reduce((sum, t) => {
                // Ignore transactions older than the creation date of the account
                const tDate = t.date ? t.date.split("T")[0] : "";
                if (tDate < creationDateString) {
                    return sum;
                }

                const amount = Number(t.amount || 0);
                const dana = t.danaDipakai || "";
                const source = (t.source || "").toLowerCase();
                const accName = account.name.toLowerCase();

                // Spend CC does not reduce any account balance
                if (dana === "Spend CC") {
                    return sum;
                }

                // Normal transactions reduce the account whose name matches the source
                const matchesSource = (src, acc) => {
                    const s = src.trim();
                    const a = acc.trim();
                    if (s === a) return true;
                    if (s === "blu" && a.includes("blu")) return true;
                    return false;
                };

                if (matchesSource(source, accName)) {
                    return sum + amount;
                }
                return sum;
            }, 0);

            // Set starting balance so that: startingBalance - totalSpent = parsedVal (target balance)
            updateStartingBalance(id, parsedVal + totalSpent);
        }
        setEditingId(null);
    };

    const handleEditCancel = () => {
        setEditingId(null);
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
        const cleanNumber = val.replace(/[^\d]/g, "");
        if (cleanNumber === "") {
            setter("");
            return;
        }
        const formatted = new Intl.NumberFormat("id-ID").format(Number(cleanNumber));
        setter(formatted);
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-black tracking-tight text-slate-900">
                Akun
            </h1>

            {/* Kekayaan Bersih Card */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="overflow-hidden rounded-[2rem] border border-white/70 bg-gradient-to-br from-zinc-800 to-zinc-900 p-6 text-white shadow-xl backdrop-blur md:p-8"
            >
                <p className="text-sm font-semibold text-white/70">
                    Kekayaan Bersih
                </p>

                <p className="mt-2 text-4xl font-black tracking-tight md:text-5xl">
                    {formatCurrency(netWorth)}
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
                {filteredAccounts.length > 0 ? (
                    filteredAccounts.map((account) => {
                        const IconComponent = getAccountIcon(account.type, account.name);
                        const isEditing = editingId === account.id;

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
                                        {isEditing ? (
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
                                                    onClick={() => handleEditSave(account.id)}
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
                            </motion.div>
                        );
                    })
                ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
                        Tidak ada akun ditemukan. Klik "+ Tambah" untuk menambahkan akun baru.
                    </div>
                )}
            </div>

            {/* Modal Tambah Akun */}
            <AnimatePresence>
                {showAddModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-6 shadow-2xl"
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
            </AnimatePresence>
        </div>
    );
}
