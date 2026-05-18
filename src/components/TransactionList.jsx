import { motion } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { formatCurrency } from "../utils/currency";
import { formatDisplayDate } from "../utils/date";

export default function TransactionList({
    transactions,
    deleteTransaction,
}) {
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
                    {/* TOP */}
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

                        <div className="text-right">
                            <p className="text-2xl font-bold text-rose-500">
                                -{formatCurrency(item.amount)}
                            </p>
                        </div>
                    </div>

                    {/* BOTTOM */}
                    <div className="mt-4 flex items-center justify-between">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">
                                {formatDisplayDate(item.date)}
                            </p>

                            <button className="flex items-center gap-1 text-sm">
                                <Pencil className="h-4 w-4" />
                                Edit
                            </button>
                        </div>

                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteTransaction(item.id)}
                            className="rounded-full"
                        >
                            <Trash2 className="h-5 w-5" />
                        </Button>
                    </div>
                </motion.div>
            ))}
        </div>
    );
}