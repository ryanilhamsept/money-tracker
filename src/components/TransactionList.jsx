import { useState } from "react";
import { motion } from "framer-motion";
import {
    ArrowLeftRight,
    Utensils,
    Car,
    Store,
    Lightbulb,
    Gamepad2,
    Globe,
    ShoppingBag,
    Heart,
    BookOpen,
    Coins,
    CalendarDays,
    Check,
    Pencil,
    Trash2,
    X,
} from "lucide-react";

import { Button } from "./ui/button";
import { formatCurrency } from "../utils/currency";
import { formatDisplayDate, normalizeDate } from "../utils/date";

import {
    categories,
    danaDipakaiOptions,
    fundSources,
} from "../constants/options";

const categoryIcons = {
    "Account Transfer": {
        icon: ArrowLeftRight,
        bg: "bg-green-100",
        color: "text-green-700",
    },
    Food: {
        icon: Utensils,
        bg: "bg-orange-100",
        color: "text-orange-600",
    },
    Transportation: {
        icon: Car,
        bg: "bg-blue-100",
        color: "text-blue-600",
    },
    Groceries: {
        icon: Store,
        bg: "bg-yellow-100",
        color: "text-yellow-700",
    },
    Utilities: {
        icon: Lightbulb,
        bg: "bg-amber-100",
        color: "text-amber-600",
    },
    Entertainment: {
        icon: Gamepad2,
        bg: "bg-pink-100",
        color: "text-pink-600",
    },
    Internet: {
        icon: Globe,
        bg: "bg-cyan-100",
        color: "text-cyan-600",
    },
    Shopping: {
        icon: ShoppingBag,
        bg: "bg-violet-100",
        color: "text-violet-600",
    },
    Health: {
        icon: Heart,
        bg: "bg-rose-100",
        color: "text-rose-600",
    },
    Education: {
        icon: BookOpen,
        bg: "bg-indigo-100",
        color: "text-indigo-600",
    },
    Miscellaneous: {
        icon: Coins,
        bg: "bg-gray-100",
        color: "text-gray-600",
    },
};

export default function TransactionList({
    transactions,
    deleteTransaction,
    updateTransaction,
}) {
    const [editingId, setEditingId] = useState("");

    const [editForm, setEditForm] = useState({
        title: "",
        amount: "",
        category: "Food",
        source: "Mandiri",
        danaDipakai: "Spend Bulanan",
        date: "",
    });

    const openEdit = (item) => {
        setEditingId(item.id);

        setEditForm({
            title: item.title,
            amount: String(item.amount),
            category: item.category,
            source: item.source,
            danaDipakai: item.danaDipakai,
            date: normalizeDate(item.date),
        });
    };

    const closeEdit = () => {
        setEditingId("");

        setEditForm({
            title: "",
            amount: "",
            category: "Food",
            source: "Mandiri",
            danaDipakai: "Spend Bulanan",
            date: "",
        });
    };

    const saveEdit = async (id) => {
        const wasSaved = await updateTransaction(id, editForm);
        if (wasSaved) {
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
            {transactions.map((item) => {
                const isEditing = editingId === item.id;

                const categoryData =
                    categoryIcons[item.category] ||
                    categoryIcons["Miscellaneous"];

                const Icon = categoryData.icon;

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
                                            className={`shrink-0 rounded-[1.4rem] p-4 ${categoryData.bg}`}
                                        >
                                            <Icon
                                                className={`h-6 w-6 ${categoryData.color}`}
                                            />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <h3 className="truncate text-xl font-black text-slate-950">
                                                        {item.title}
                                                    </h3>

                                                    <p className="mt-2 text-sm font-semibold text-slate-500">
                                                        {item.category} • {item.source} •{" "}
                                                        {item.danaDipakai}
                                                    </p>
                                                </div>

                                                <p className="shrink-0 text-right text-xl font-black text-rose-500 sm:text-2xl">
                                                    -{formatCurrency(item.amount)}
                                                </p>
                                            </div>

                                            <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-slate-500">
                                                <CalendarDays className="h-4 w-4 text-indigo-500" />
                                                {formatDisplayDate(item.date)}
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
                                    onChange={(event) =>
                                        setEditForm((prev) => ({
                                            ...prev,
                                            danaDipakai: event.target.value,
                                        }))
                                    }
                                    className="w-full min-w-0 max-w-full rounded-2xl border-2 border-slate-100 bg-white px-3 py-2 outline-none focus:border-pink-400"
                                >
                                    {danaDipakaiOptions.map((item) => (
                                        <option key={item} value={item}>
                                            {item}
                                        </option>
                                    ))}
                                </select>

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
    );
}
