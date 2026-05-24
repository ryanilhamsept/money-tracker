import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { Button } from "./ui/button";
import { formatCurrency } from "../utils/currency";
import { formatDisplayDate, normalizeDate } from "../utils/date";
import {
    categories,
    danaDipakaiOptions,
    fundSources,
} from "../constants/options";

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
        await updateTransaction(id, editForm);
        closeEdit();
    };

    if (!transactions.length) {
        return (
            <div className="rounded-2xl border p-6 text-center text-muted-foreground">
                No transactions yet.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {transactions.map((item) => {
                const isEditing = editingId === item.id;

                return (
                    <motion.div
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="overflow-hidden rounded-2xl border p-4"
                    >
                        {!isEditing ? (
                            <>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="truncate text-lg font-semibold">
                                                {item.title}
                                            </h3>

                                            <span className="text-sm text-muted-foreground">
                                                {item.category}
                                            </span>

                                            <span className="text-sm text-muted-foreground">
                                                {item.source}
                                            </span>
                                        </div>

                                        <p className="mt-1 text-sm text-muted-foreground">
                                            {item.danaDipakai}
                                        </p>
                                    </div>

                                    <p className="shrink-0 text-right text-xl font-bold text-rose-500 sm:text-2xl">
                                        -{formatCurrency(item.amount)}
                                    </p>
                                </div>

                                <div className="mt-4 flex items-end justify-between gap-3">
                                    <div className="min-w-0 space-y-2">
                                        <p className="text-sm text-muted-foreground">
                                            {formatDisplayDate(item.date)}
                                        </p>

                                        <button
                                            type="button"
                                            onClick={() => openEdit(item)}
                                            className="flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-muted active:scale-95"
                                        >
                                            <Pencil className="h-4 w-4" />
                                            Edit
                                        </button>
                                    </div>

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => deleteTransaction(item.id)}
                                        className="h-11 w-11 shrink-0 rounded-full"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </Button>
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
                                    className="w-full min-w-0 max-w-full rounded-xl border bg-background px-3 py-2 outline-none focus:ring-2"
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
                                    className="w-full min-w-0 max-w-full rounded-xl border bg-background px-3 py-2 outline-none focus:ring-2"
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
                                    className="w-full min-w-0 max-w-full appearance-none rounded-xl border bg-background px-3 py-2 text-base outline-none focus:ring-2"
                                />

                                <select
                                    value={editForm.category}
                                    onChange={(event) =>
                                        setEditForm((prev) => ({
                                            ...prev,
                                            category: event.target.value,
                                        }))
                                    }
                                    className="w-full min-w-0 max-w-full rounded-xl border bg-background px-3 py-2 outline-none focus:ring-2"
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
                                    className="w-full min-w-0 max-w-full rounded-xl border bg-background px-3 py-2 outline-none focus:ring-2"
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
                                    className="w-full min-w-0 max-w-full rounded-xl border bg-background px-3 py-2 outline-none focus:ring-2"
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
                                        className="rounded-xl"
                                    >
                                        <Check className="mr-2 h-4 w-4" />
                                        Save
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={closeEdit}
                                        className="rounded-xl"
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