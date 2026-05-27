import { useMemo, useState } from "react";
import {
    ArrowLeftRight,
    UtensilsCrossed,
    Car,
    ShoppingCart,
    Zap,
    Gamepad2,
    Wifi,
    ShoppingBag,
    HeartPulse,
    GraduationCap,
    Receipt,
} from "lucide-react";

import { Card, CardContent } from "./ui/card";
import { formatCurrency } from "../utils/currency";

import {
    currentMonth,
    formatDisplayDate,
    getTransactionMonth,
    normalizeDate,
} from "../utils/date";

const categoryIcons = {
    "Account Transfer": {
        icon: ArrowLeftRight,
        bg: "bg-green-100",
        color: "text-green-700",
    },

    Food: {
        icon: UtensilsCrossed,
        bg: "bg-orange-100",
        color: "text-orange-600",
    },

    Transportation: {
        icon: Car,
        bg: "bg-blue-100",
        color: "text-blue-600",
    },

    Groceries: {
        icon: ShoppingCart,
        bg: "bg-yellow-100",
        color: "text-yellow-700",
    },

    Utilities: {
        icon: Zap,
        bg: "bg-amber-100",
        color: "text-amber-600",
    },

    Entertainment: {
        icon: Gamepad2,
        bg: "bg-pink-100",
        color: "text-pink-600",
    },

    Internet: {
        icon: Wifi,
        bg: "bg-cyan-100",
        color: "text-cyan-600",
    },

    Shopping: {
        icon: ShoppingBag,
        bg: "bg-violet-100",
        color: "text-violet-600",
    },

    Health: {
        icon: HeartPulse,
        bg: "bg-rose-100",
        color: "text-rose-600",
    },

    Education: {
        icon: GraduationCap,
        bg: "bg-indigo-100",
        color: "text-indigo-600",
    },

    Miscellaneous: {
        icon: Receipt,
        bg: "bg-gray-100",
        color: "text-gray-600",
    },
};

export default function DailyReport({ transactions }) {
    const [dailyReportMonth, setDailyReportMonth] = useState(currentMonth());
    const [expandedDailyReportDate, setExpandedDailyReportDate] = useState("");

    const dailyReportTransactions = useMemo(() => {
        return transactions.filter(
            (item) => getTransactionMonth(item.date) === dailyReportMonth
        );
    }, [transactions, dailyReportMonth]);

    const dailySpendingData = useMemo(() => {
        const grouped = dailyReportTransactions.reduce((acc, item) => {
            const key = normalizeDate(item.date);

            if (!acc[key]) {
                acc[key] = [];
            }

            acc[key].push(item);

            return acc;
        }, {});

        return Object.entries(grouped)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, list]) => ({
                date,
                transactions: list.sort(
                    (a, b) =>
                        Number(b.rowNumber || 0) -
                        Number(a.rowNumber || 0)
                ),
                amount: list.reduce(
                    (sum, item) => sum + Number(item.amount),
                    0
                ),
            }));
    }, [dailyReportTransactions]);

    return (
        <section className="space-y-6 overflow-hidden">
            <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-5">
                    <div className="flex min-w-0 flex-col gap-4 overflow-hidden md:flex-row md:items-end md:justify-between">
                        <div className="min-w-0">
                            <h2 className="text-xl font-semibold">
                                Daily
                            </h2>

                            <p className="text-sm text-muted-foreground">
                                Klik tanggal untuk melihat detail transaksi hari itu.
                            </p>
                        </div>

                        <label className="block min-w-0 max-w-full space-y-2 md:w-64">
                            <span className="text-sm font-medium">
                                Month
                            </span>

                            <input
                                type="month"
                                value={dailyReportMonth}
                                onChange={(event) =>
                                    setDailyReportMonth(event.target.value)
                                }
                                style={{ WebkitAppearance: "none" }}
                                className="w-full min-w-0 max-w-full appearance-none rounded-2xl border bg-background px-4 py-3 outline-none focus:ring-2"
                            />
                        </label>
                    </div>
                </CardContent>
            </Card>

            <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-5">
                    {dailySpendingData.length === 0 ? (
                        <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                            No daily spending data for this month.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {dailySpendingData.map((item) => (
                                <div
                                    key={item.date}
                                    className="rounded-2xl border p-4"
                                >
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setExpandedDailyReportDate((current) =>
                                                current === item.date
                                                    ? ""
                                                    : item.date
                                            )
                                        }
                                        className="flex w-full min-w-0 items-center justify-between gap-4 text-left"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-semibold">
                                                {formatDisplayDate(item.date)}
                                            </p>

                                            <p className="text-sm text-muted-foreground">
                                                {item.transactions.length} transaksi
                                            </p>
                                        </div>

                                        <p className="shrink-0 text-lg font-bold text-rose-600">
                                            -{formatCurrency(item.amount)}
                                        </p>
                                    </button>

                                    {expandedDailyReportDate === item.date && (
                                        <div className="mt-4 space-y-2 border-t pt-4">
                                            {item.transactions.map((transaction) => {
                                                const categoryData =
                                                    categoryIcons[
                                                        transaction.category
                                                    ] ||
                                                    categoryIcons[
                                                        "Miscellaneous"
                                                    ];

                                                const Icon = categoryData.icon;

                                                return (
                                                    <div
                                                        key={transaction.id}
                                                        className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-muted p-3"
                                                    >
                                                        <div className="flex min-w-0 items-center gap-3">
                                                            <div
                                                                className={`shrink-0 rounded-full p-2 ${categoryData.bg}`}
                                                            >
                                                                <Icon
                                                                    className={`h-4 w-4 ${categoryData.color}`}
                                                                />
                                                            </div>

                                                            <div className="min-w-0">
                                                                <p className="truncate font-medium">
                                                                    {transaction.title}
                                                                </p>

                                                                <p className="text-xs text-muted-foreground">
                                                                    {transaction.category} •{" "}
                                                                    {transaction.source} •{" "}
                                                                    {transaction.danaDipakai}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <p className="shrink-0 font-bold text-rose-600">
                                                            -{formatCurrency(
                                                                transaction.amount
                                                            )}
                                                        </p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    );
}