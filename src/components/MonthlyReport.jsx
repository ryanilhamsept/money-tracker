import { useMemo, useState } from "react";

import {
    FileText,
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

import {
    categories,
    danaDipakaiOptions,
    fundSources,
} from "../constants/options";

import {
    currentMonth,
    formatDisplayDate,
    getTransactionMonth,
} from "../utils/date";

import { formatCurrency } from "../utils/currency";

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

export default function MonthlyReport({ transactions }) {
    const [selectedMonth, setSelectedMonth] = useState(currentMonth());
    const [monthlyDanaFilter, setMonthlyDanaFilter] = useState("all");
    const [expandedMonthlyCategory, setExpandedMonthlyCategory] = useState("");

    const monthlyTransactions = useMemo(() => {
        return transactions.filter((item) => {
            const matchesMonth =
                getTransactionMonth(item.date) === selectedMonth;

            const matchesDana =
                monthlyDanaFilter === "all" ||
                item.danaDipakai === monthlyDanaFilter;

            return matchesMonth && matchesDana;
        });
    }, [transactions, selectedMonth, monthlyDanaFilter]);

    const monthlyTotal = useMemo(() => {
        return monthlyTransactions.reduce(
            (sum, item) => sum + Number(item.amount),
            0
        );
    }, [monthlyTransactions]);

    const categoryReport = useMemo(() => {
        return categories
            .map((category) => {
                const total = monthlyTransactions
                    .filter((item) => item.category === category)
                    .reduce((sum, item) => sum + Number(item.amount), 0);

                return {
                    category,
                    total,
                    percentage: monthlyTotal
                        ? Math.round((total / monthlyTotal) * 100)
                        : 0,
                };
            })
            .filter((item) => item.total > 0)
            .sort((a, b) => b.total - a.total);
    }, [monthlyTransactions, monthlyTotal]);

    const sourceReport = useMemo(() => {
        return fundSources
            .map((source) => {
                const total = monthlyTransactions
                    .filter((item) => item.source === source)
                    .reduce((sum, item) => sum + Number(item.amount), 0);

                return { source, total };
            })
            .filter((item) => item.total > 0)
            .sort((a, b) => b.total - a.total);
    }, [monthlyTransactions]);

    const pieChart = useMemo(() => {
        if (!categoryReport.length) {
            return "conic-gradient(#e5e7eb 0deg 360deg)";
        }

        let start = 0;

        const colors = [
            "#ef4444",
            "#f97316",
            "#eab308",
            "#22c55e",
            "#06b6d4",
            "#3b82f6",
            "#8b5cf6",
            "#ec4899",
        ];

        const slices = categoryReport.map((item, index) => {
            const degrees = monthlyTotal
                ? (item.total / monthlyTotal) * 360
                : 0;

            const slice = `${
                colors[index % colors.length]
            } ${start}deg ${start + degrees}deg`;

            start += degrees;

            return slice;
        });

        return `conic-gradient(${slices.join(", ")})`;
    }, [categoryReport, monthlyTotal]);

    return (
        <section className="grid min-w-0 gap-6 overflow-hidden lg:grid-cols-[380px_1fr]">
            <Card className="rounded-2xl shadow-sm">
                <CardContent className="space-y-5 p-5">
                    <div className="min-w-0">
                        <h2 className="text-xl font-semibold">
                            Monthly
                        </h2>

                        <p className="text-sm text-muted-foreground">
                            See spending summary by month and category.
                        </p>
                    </div>

                    <div className="grid min-w-0 gap-3 overflow-hidden md:grid-cols-2">
                        <label className="block min-w-0 max-w-full space-y-2">
                            <span className="text-sm font-medium">
                                Month
                            </span>

                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={(event) =>
                                    setSelectedMonth(event.target.value)
                                }
                                style={{ WebkitAppearance: "none" }}
                                className="w-full min-w-0 max-w-full appearance-none rounded-2xl border bg-background px-4 py-3 outline-none focus:ring-2"
                            />
                        </label>

                        <label className="block min-w-0 max-w-full space-y-2">
                            <span className="text-sm font-medium">
                                Dana Dipakai
                            </span>

                            <select
                                value={monthlyDanaFilter}
                                onChange={(event) =>
                                    setMonthlyDanaFilter(
                                        event.target.value
                                    )
                                }
                                className="w-full min-w-0 max-w-full rounded-2xl border bg-background px-4 py-3 outline-none focus:ring-2"
                            >
                                <option value="all">All</option>

                                {danaDipakaiOptions.map((item) => (
                                    <option key={item} value={item}>
                                        {item}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="flex justify-center overflow-hidden">
                        <div
                            className="h-56 w-56 shrink-0 rounded-full border shadow-inner"
                            style={{ background: pieChart }}
                            aria-label="Spending pie chart"
                        />
                    </div>

                    <div className="rounded-2xl border p-5">
                        <div className="flex items-start gap-4">
                            <div className="rounded-2xl bg-muted p-3">
                                <FileText className="h-6 w-6" />
                            </div>

                            <div className="min-w-0">
                                <p className="text-sm text-muted-foreground">
                                    Total this month ·{" "}
                                    {monthlyDanaFilter === "all"
                                        ? "All"
                                        : monthlyDanaFilter}
                                </p>

                                <p className="mt-1 text-2xl font-bold">
                                    {formatCurrency(monthlyTotal)}
                                </p>

                                <p className="mt-2 text-lg font-bold">
                                    {monthlyTransactions.length} items
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <div className="min-w-0 space-y-6 overflow-hidden">
                <Card className="rounded-2xl shadow-sm">
                    <CardContent className="p-5">
                        <h3 className="mb-4 text-lg font-semibold">
                            Spending by Category
                        </h3>

                        {categoryReport.length === 0 ? (
                            <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                                No spending data for this month.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {categoryReport.map((item) => {
                                    const detailTransactions =
                                        monthlyTransactions.filter(
                                            (transaction) =>
                                                transaction.category ===
                                                item.category
                                        );

                                    const categoryData =
                                        categoryIcons[item.category] ||
                                        categoryIcons["Miscellaneous"];

                                    const Icon = categoryData.icon;

                                    return (
                                        <div
                                            key={item.category}
                                            className="space-y-2 rounded-2xl border p-4"
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setExpandedMonthlyCategory(
                                                        (current) =>
                                                            current ===
                                                            item.category
                                                                ? ""
                                                                : item.category
                                                    )
                                                }
                                                className="w-full min-w-0 text-left"
                                            >
                                                <div className="flex min-w-0 items-center justify-between gap-4">
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <div
                                                            className={`shrink-0 rounded-full p-3 ${categoryData.bg}`}
                                                        >
                                                            <Icon
                                                                className={`h-5 w-5 ${categoryData.color}`}
                                                            />
                                                        </div>

                                                        <div className="min-w-0">
                                                            <p className="truncate font-semibold">
                                                                {item.category}
                                                            </p>

                                                            <p className="text-sm text-muted-foreground">
                                                                {
                                                                    item.percentage
                                                                }
                                                                % of monthly spending
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <p className="shrink-0 font-bold">
                                                        {formatCurrency(
                                                            item.total
                                                        )}
                                                    </p>
                                                </div>

                                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                                                    <div
                                                        className="h-full rounded-full bg-foreground"
                                                        style={{
                                                            width: `${item.percentage}%`,
                                                        }}
                                                    />
                                                </div>
                                            </button>

                                            {expandedMonthlyCategory ===
                                                item.category && (
                                                <div className="space-y-2 border-t pt-3">
                                                    {detailTransactions.map(
                                                        (transaction) => {
                                                            const detailCategoryData =
                                                                categoryIcons[
                                                                    transaction
                                                                        .category
                                                                ] ||
                                                                categoryIcons[
                                                                    "Miscellaneous"
                                                                ];

                                                            const DetailIcon =
                                                                detailCategoryData.icon;

                                                            return (
                                                                <div
                                                                    key={
                                                                        transaction.id
                                                                    }
                                                                    className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-muted p-3"
                                                                >
                                                                    <div className="flex min-w-0 items-center gap-3">
                                                                        <div
                                                                            className={`shrink-0 rounded-full p-2 ${detailCategoryData.bg}`}
                                                                        >
                                                                            <DetailIcon
                                                                                className={`h-4 w-4 ${detailCategoryData.color}`}
                                                                            />
                                                                        </div>

                                                                        <div className="min-w-0">
                                                                            <p className="truncate font-medium">
                                                                                {
                                                                                    transaction.title
                                                                                }
                                                                            </p>

                                                                            <p className="text-xs text-muted-foreground">
                                                                                {formatDisplayDate(
                                                                                    transaction.date
                                                                                )}{" "}
                                                                                •{" "}
                                                                                {
                                                                                    transaction.source
                                                                                }
                                                                            </p>
                                                                        </div>
                                                                    </div>

                                                                    <p className="shrink-0 font-bold text-rose-600">
                                                                        -
                                                                        {formatCurrency(
                                                                            transaction.amount
                                                                        )}
                                                                    </p>
                                                                </div>
                                                            );
                                                        }
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="rounded-2xl shadow-sm">
                    <CardContent className="p-5">
                        <h3 className="mb-4 text-lg font-semibold">
                            Spending by Sumber Dana
                        </h3>

                        {sourceReport.length === 0 ? (
                            <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                                No fund source data for this month.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {sourceReport.map((item) => (
                                    <div
                                        key={item.source}
                                        className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border p-4"
                                    >
                                        <p className="truncate font-semibold">
                                            {item.source}
                                        </p>

                                        <p className="shrink-0 font-bold">
                                            {formatCurrency(item.total)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </section>
    );
}