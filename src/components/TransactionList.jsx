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

    if (transactions.length === 0) {
        return (
            <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                No transactions found.
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {transactions.map((item) => (
                <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-between gap-4 rounded-2xl border p-4"
                >
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold">{item.title}</h3>
                            <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                {item.category}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                {item.source}
                            </span>
                            <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">
                                {item.danaDipakai}
                            </span>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                            <p className="text-sm text-muted-foreground">
                                {formatDisplayDate(item.date)}
                            </p>

                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 rounded-xl px-2 text-xs"
                                onClick={() =>
                                    setEditingDateId((current) =>
                                        current === item.id ? "" : item.id
                                    )
                                }
                            >
                                <Pencil className="mr-1 h-3 w-3" /> Edit
                            </Button>

                            {editingDateId === item.id && (
                                <input
                                    type="date"
                                    value={normalizeDate(item.date)}
                                    onChange={(event) => {
                                        updateTransactionDate(item.id, event.target.value);
                                        setEditingDateId("");
                                    }}
                                    className="rounded-xl border bg-background px-2 py-1 text-xs outline-none focus:ring-2"
                                />
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <p className="text-right font-bold text-rose-600">
                            -{formatCurrency(Number(item.amount))}
                        </p>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteTransaction(item.id)}
                            className="rounded-2xl"
                            aria-label={`Delete ${item.title}`}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}