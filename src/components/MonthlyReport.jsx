import { useMemo, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { categories, danaDipakaiOptions, fundSources } from "../constants/options";
import { currentMonth, formatDisplayDate, getTransactionMonth } from "../utils/date";
import { formatCurrency } from "../utils/currency";

export default function MonthlyReport({ transactions }) {
    const [selectedMonth, setSelectedMonth] = useState(currentMonth());
    const [monthlyDanaFilter, setMonthlyDanaFilter] = useState("Spend Bulanan");
    const [expandedMonthlyCategory, setExpandedMonthlyCategory] = useState("");

    const monthlyTransactions = useMemo(() => {
        return transactions.filter((item) => {
            const matchesMonth = getTransactionMonth(item.date) === selectedMonth;
            const matchesDana =
                monthlyDanaFilter === "all" || item.danaDipakai === monthlyDanaFilter;
            return matchesMonth && matchesDana;
        });
    }, [transactions, selectedMonth, monthlyDanaFilter]);

    const monthlyTotal = useMemo(() => {
        return monthlyTransactions.reduce((sum, item) => sum + Number(item.amount), 0);
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
                    percentage: monthlyTotal ? Math.round((total / monthlyTotal) * 100) : 0,
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
        if (!categoryReport.length) return "conic-gradient(#e5e7eb 0deg 360deg)";

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
            const degrees = monthlyTotal ? (item.total / monthlyTotal) * 360 : 0;
            const slice = `${colors[index % colors.length]} ${start}deg ${start + degrees}deg`;
            start += degrees;
            return slice;
        });

        return `conic-gradient(${slices.join(", ")})`;
    }, [categoryReport, monthlyTotal]);

    return (
        <section className="grid gap-6 lg:grid-cols-[380px_1fr]">
            <Card className="rounded-2xl shadow-sm">
                <CardContent className="space-y-5 p-5">
                    <div>
                        <h2 className="text-xl font-semibold">Monthly Report</h2>
                        <p className="text-sm text-muted-foreground">
                            See spending summary by month and category.
                        </p>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="block space-y-2">
                            <span className="text-sm font-medium">Month</span>
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={(event) => setSelectedMonth(event.target.value)}
                                className="w-full rounded-2xl border bg-background px-4 py-3 outline-none focus:ring-2"
                            />
                        </label>

                        <label className="block space-y-2">
                            <span className="text-sm font-medium">Dana Dipakai</span>
                            <select
                                value={monthlyDanaFilter}
                                onChange={(event) => setMonthlyDanaFilter(event.target.value)}
                                className="w-full rounded-2xl border bg-background px-4 py-3 outline-none focus:ring-2"
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

                    <div className="flex justify-center">
                        <div
                            className="h-56 w-56 rounded-full border shadow-inner"
                            style={{ background: pieChart }}
                            aria-label="Spending pie chart"
                        />
                    </div>

                    <div className="rounded-2xl bg-muted p-4 text-center">
                        <p className="text-sm text-muted-foreground">
                            Total this month · {monthlyDanaFilter === "all" ? "All" : monthlyDanaFilter}
                        </p>
                        <p className="text-2xl font-bold">{formatCurrency(monthlyTotal)}</p>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-6">
                <Card className="rounded-2xl shadow-sm">
                    <CardContent className="p-5">
                        <h3 className="mb-4 text-lg font-semibold">Spending by Category</h3>
                        {categoryReport.length === 0 ? (
                            <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                                No spending data for this month.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {categoryReport.map((item) => {
                                    const detailTransactions = monthlyTransactions.filter(
                                        (transaction) => transaction.category === item.category
                                    );

                                    return (
                                        <div key={item.category} className="space-y-2 rounded-2xl border p-4">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setExpandedMonthlyCategory((current) =>
                                                        current === item.category ? "" : item.category
                                                    )
                                                }
                                                className="w-full text-left"
                                            >
                                                <div className="flex items-center justify-between gap-4">
                                                    <div>
                                                        <p className="font-semibold">{item.category}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            {item.percentage}% of monthly spending
                                                        </p>
                                                    </div>
                                                    <p className="font-bold">{formatCurrency(item.total)}</p>
                                                </div>

                                                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                                                    <div
                                                        className="h-full rounded-full bg-foreground"
                                                        style={{ width: `${item.percentage}%` }}
                                                    />
                                                </div>
                                            </button>

                                            {expandedMonthlyCategory === item.category && (
                                                <div className="space-y-2 border-t pt-3">
                                                    {detailTransactions.map((transaction) => (
                                                        <div
                                                            key={transaction.id}
                                                            className="flex items-center justify-between rounded-xl bg-muted p-3"
                                                        >
                                                            <div>
                                                                <p className="font-medium">{transaction.title}</p>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {formatDisplayDate(transaction.date)} • {transaction.source}
                                                                </p>
                                                            </div>
                                                            <p className="font-bold text-rose-600">
                                                                -{formatCurrency(transaction.amount)}
                                                            </p>
                                                        </div>
                                                    ))}
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
                        <h3 className="mb-4 text-lg font-semibold">Spending by Sumber Dana</h3>
                        {sourceReport.length === 0 ? (
                            <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">
                                No fund source data for this month.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {sourceReport.map((item) => (
                                    <div
                                        key={item.source}
                                        className="flex items-center justify-between rounded-2xl border p-4"
                                    >
                                        <p className="font-semibold">{item.source}</p>
                                        <p className="font-bold">{formatCurrency(item.total)}</p>
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