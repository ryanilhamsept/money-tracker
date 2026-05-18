import { useMemo, useState } from "react";
import { Card, CardContent } from "./ui/card";
import { formatCurrency } from "../utils/currency";
import { currentMonth, formatDisplayDate, getTransactionMonth, normalizeDate } from "../utils/date";

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
            if (!acc[key]) acc[key] = [];
            acc[key].push(item);
            return acc;
        }, {});

        return Object.entries(grouped)
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, list]) => ({
                date,
                transactions: list.sort((a, b) => Number(b.amount) - Number(a.amount)),
                amount: list.reduce((sum, item) => sum + Number(item.amount), 0),
            }));
    }, [dailyReportTransactions]);

    return (
        <section className="space-y-6">
            <Card className="rounded-2xl shadow-sm">
                <CardContent className="p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h2 className="text-xl font-semibold">Daily Report</h2>
                            <p className="text-sm text-muted-foreground">
                                Klik tanggal untuk melihat detail transaksi hari itu.
                            </p>
                        </div>
                        <label className="block space-y-2 md:w-64">
                            <span className="text-sm font-medium">Month</span>
                            <input
                                type="month"
                                value={dailyReportMonth}
                                onChange={(event) => setDailyReportMonth(event.target.value)}
                                className="w-full rounded-2xl border bg-background px-4 py-3 outline-none focus:ring-2"
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
                                <div key={item.date} className="rounded-2xl border p-4">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setExpandedDailyReportDate((current) =>
                                                current === item.date ? "" : item.date
                                            )
                                        }
                                        className="flex w-full items-center justify-between gap-4 text-left"
                                    >
                                        <div>
                                            <p className="font-semibold">{formatDisplayDate(item.date)}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {item.transactions.length} transaksi
                                            </p>
                                        </div>
                                        <p className="text-lg font-bold text-rose-600">
                                            -{formatCurrency(item.amount)}
                                        </p>
                                    </button>

                                    {expandedDailyReportDate === item.date && (
                                        <div className="mt-4 space-y-2 border-t pt-4">
                                            {item.transactions.map((transaction) => (
                                                <div
                                                    key={transaction.id}
                                                    className="flex items-center justify-between gap-3 rounded-xl bg-muted p-3"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="truncate font-medium">{transaction.title}</p>
                                                        <p className="text-xs text-muted-foreground">
                                                            {transaction.category} • {transaction.source} • {transaction.danaDipakai}
                                                        </p>
                                                    </div>
                                                    <p className="shrink-0 font-bold text-rose-600">
                                                        -{formatCurrency(transaction.amount)}
                                                    </p>
                                                </div>
                                            ))}
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