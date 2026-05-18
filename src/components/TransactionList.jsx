import { useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { formatCurrency } from "../utils/currency";
import { formatDisplayDate, normalizeDate } from "../utils/date";

export default function TransactionList({
    transactions,
    deleteTransaction,
    updateTransactionDate,
}) {
    const [editingDateId, setEditingDateId] = useState("");

    if (!transactions.length) {
        return (
            <div className="rounded-2xl border p-6 text-center text-muted-foreground">
                No transactions yet.
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {transactions.map((item) => (
                <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border p-4"
                >
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
                                onClick={() =>
                                    setEditingDateId((current) =>
                                        current === item.id ? "" : item.id
                                    )
                                }
                                className="flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition hover:bg-muted active:scale-95"
                            >
                                <Pencil className="h-4 w-4" />
                                Edit
                            </button>

                            {editingDateId === item.id && (
                                <input
                                    type="date"
                                    value={normalizeDate(item.date)}
                                    onChange={(event) => {
                                        updateTransactionDate(item.id, event.target.value);
                                        setEditingDateId("");
                                    }}
                                    className="w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none focus:ring-2"
                                />
                            )}
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
                </motion.div>
            ))}
        </div>
    );
}