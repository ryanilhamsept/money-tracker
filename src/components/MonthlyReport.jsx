import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
    FileText,
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
    Wallet,
    TrendingUp,
    TrendingDown,
    CalendarDays,
    Crown,
    ArrowUpRight,
    ArrowDownRight,
    Percent,
    LineChart,
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
    normalizeDate,
} from "../utils/date";
import { formatCurrency } from "../utils/currency";
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

    const activeDaysCount = useMemo(() => {
        const [yearStr, monthStr] = selectedMonth.split("-");
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const totalDaysInMonth = new Date(year, month, 0).getDate();
        const isCurrentMonth = selectedMonth === currentMonth();
        return isCurrentMonth ? Math.min(new Date().getDate(), totalDaysInMonth) : totalDaysInMonth;
    }, [selectedMonth]);

    const dailyAverage = useMemo(() => {
        if (monthlyTotal === 0) return 0;
        return monthlyTotal / (activeDaysCount || 1);
    }, [monthlyTotal, activeDaysCount]);

    const prevMonth = useMemo(() => {
        const [yearStr, monthStr] = selectedMonth.split("-");
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10);
        const prevDate = new Date(year, month - 2, 1);
        const prevYear = prevDate.getFullYear();
        const prevMonthStr = String(prevDate.getMonth() + 1).padStart(2, "0");
        return `${prevYear}-${prevMonthStr}`;
    }, [selectedMonth]);

    const prevMonthTransactions = useMemo(() => {
        return transactions.filter((item) => {
            const matchesMonth = getTransactionMonth(item.date) === prevMonth;
            const matchesDana =
                monthlyDanaFilter === "all" ||
                item.danaDipakai === monthlyDanaFilter;
            return matchesMonth && matchesDana;
        });
    }, [transactions, prevMonth, monthlyDanaFilter]);

    const prevMonthTotal = useMemo(() => {
        return prevMonthTransactions.reduce(
            (sum, item) => sum + Number(item.amount),
            0
        );
    }, [prevMonthTransactions]);

    const comparisonPercentage = useMemo(() => {
        if (prevMonthTotal === 0) return null;
        const diff = monthlyTotal - prevMonthTotal;
        const percent = (diff / prevMonthTotal) * 100;
        return {
            percent: Math.abs(Math.round(percent)),
            isIncrease: diff > 0,
            diff: Math.abs(diff),
        };
    }, [monthlyTotal, prevMonthTotal]);

    const highestTransaction = useMemo(() => {
        if (monthlyTransactions.length === 0) return null;
        return monthlyTransactions.reduce((max, item) => 
            Number(item.amount) > Number(max.amount) ? item : max
        , monthlyTransactions[0]);
    }, [monthlyTransactions]);

    const highestSpendingDay = useMemo(() => {
        if (monthlyTransactions.length === 0) return null;
        const dailySpending = {};
        monthlyTransactions.forEach((item) => {
            const day = normalizeDate(item.date);
            dailySpending[day] = (dailySpending[day] || 0) + Number(item.amount);
        });
        
        let maxDay = "";
        let maxAmount = 0;
        Object.entries(dailySpending).forEach(([day, amount]) => {
            if (amount > maxAmount) {
                maxAmount = amount;
                maxDay = day;
            }
        });
        return { day: maxDay, amount: maxAmount };
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
    const danaReport = useMemo(() => {
        return danaDipakaiOptions
            .map((dana) => {
                const total = monthlyTransactions
                    .filter((item) => item.danaDipakai === dana)
                    .reduce((sum, item) => sum + Number(item.amount), 0);
                return { dana, total };
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
            <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-xl">
                <CardContent className="space-y-5 p-6">
                    <div className="min-w-0">
                        <h2 className="text-2xl font-black text-slate-900">
                            Monthly
                        </h2>
                        <p className="text-sm font-medium text-slate-500">
                            See spending summary by month and category.
                        </p>
                    </div>
                    <div className="grid min-w-0 gap-3 overflow-hidden md:grid-cols-2">
                        <label className="block min-w-0 max-w-full space-y-2">
                            <span className="text-sm font-semibold text-slate-600">
                                Month
                            </span>
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={(event) =>
                                    setSelectedMonth(event.target.value)
                                }
                                style={{ WebkitAppearance: "none" }}
                                className="w-full min-w-0 max-w-full appearance-none rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 outline-none focus:border-pink-400"
                            />
                        </label>
                        <label className="block min-w-0 max-w-full space-y-2">
                            <span className="text-sm font-semibold text-slate-600">
                                Dana Dipakai
                            </span>
                            <select
                                value={monthlyDanaFilter}
                                onChange={(event) =>
                                    setMonthlyDanaFilter(event.target.value)
                                }
                                className="w-full min-w-0 max-w-full rounded-2xl border-2 border-slate-100 bg-slate-50 px-4 py-3 outline-none focus:border-pink-400"
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
                    <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-5 text-white shadow-xl">
                        <div className="flex items-start gap-4">
                            <div className="rounded-2xl bg-white/10 p-3">
                                <FileText className="h-6 w-6 text-pink-300" />
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm text-slate-300">
                                    Total this month ·{" "}
                                    {monthlyDanaFilter === "all"
                                        ? "All"
                                        : monthlyDanaFilter}
                                </p>
                                <p className="mt-1 text-3xl font-black">
                                    {formatCurrency(monthlyTotal)}
                                </p>
                                <p className="mt-2 text-lg font-bold text-slate-300">
                                    {monthlyTransactions.length} items
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
            <div className="min-w-0 space-y-6 overflow-hidden">
                {/* Monthly Insights / Quick Stats Grid */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Daily Average Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3 }}
                        whileHover={{ y: -4, scale: 1.01 }}
                        className="overflow-hidden rounded-3xl border border-white bg-white/80 p-5 shadow-lg backdrop-blur transition-all duration-300"
                    >
                        <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-blue-100 p-2.5 text-blue-600">
                                <LineChart className="h-5 w-5" />
                            </div>
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Rata-rata Harian
                            </span>
                        </div>
                        <div className="mt-4">
                            <h4 className="text-xl font-black text-slate-950 truncate">
                                {formatCurrency(dailyAverage)}
                            </h4>
                            <p className="mt-1.5 text-xs font-semibold text-slate-400">
                                Dibagi {activeDaysCount} hari aktif
                            </p>
                        </div>
                    </motion.div>

                    {/* Compare Month Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.05 }}
                        whileHover={{ y: -4, scale: 1.01 }}
                        className="overflow-hidden rounded-3xl border border-white bg-white/80 p-5 shadow-lg backdrop-blur transition-all duration-300"
                    >
                        <div className="flex items-center gap-3">
                            <div className={`rounded-2xl p-2.5 ${
                                !comparisonPercentage 
                                    ? "bg-slate-100 text-slate-500" 
                                    : comparisonPercentage.isIncrease 
                                        ? "bg-rose-100 text-rose-600" 
                                        : "bg-emerald-100 text-emerald-600"
                            }`}>
                                {!comparisonPercentage ? (
                                    <Percent className="h-5 w-5" />
                                ) : comparisonPercentage.isIncrease ? (
                                    <TrendingUp className="h-5 w-5" />
                                ) : (
                                    <TrendingDown className="h-5 w-5" />
                                )}
                            </div>
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                vs Bulan Lalu
                            </span>
                        </div>
                        <div className="mt-4">
                            <h4 className={`text-xl font-black truncate flex items-center gap-1 ${
                                !comparisonPercentage 
                                    ? "text-slate-950" 
                                    : comparisonPercentage.isIncrease 
                                        ? "text-rose-600" 
                                        : "text-emerald-600"
                            }`}>
                                {comparisonPercentage ? (
                                    <>
                                        {comparisonPercentage.isIncrease ? "+" : "-"}
                                        {comparisonPercentage.percent}%
                                        {comparisonPercentage.isIncrease ? (
                                            <ArrowUpRight className="h-4 w-4 shrink-0" />
                                        ) : (
                                            <ArrowDownRight className="h-4 w-4 shrink-0" />
                                        )}
                                    </>
                                ) : (
                                    "-"
                                )}
                            </h4>
                            <p className="mt-1.5 text-xs font-semibold text-slate-400 truncate">
                                {comparisonPercentage ? (
                                    comparisonPercentage.isIncrease 
                                        ? `Naik Rp ${formatCurrency(comparisonPercentage.diff)}` 
                                        : `Hemat Rp ${formatCurrency(comparisonPercentage.diff)}`
                                ) : (
                                    "Belum ada data pembanding"
                                )}
                            </p>
                        </div>
                    </motion.div>

                    {/* Highest Single Transaction Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.1 }}
                        whileHover={{ y: -4, scale: 1.01 }}
                        className="overflow-hidden rounded-3xl border border-white bg-white/80 p-5 shadow-lg backdrop-blur transition-all duration-300"
                    >
                        <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-amber-100 p-2.5 text-amber-600">
                                <Crown className="h-5 w-5" />
                            </div>
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Transaksi Terbesar
                            </span>
                        </div>
                        <div className="mt-4">
                            <h4 className="text-xl font-black text-slate-950 truncate">
                                {highestTransaction ? formatCurrency(highestTransaction.amount) : "-"}
                            </h4>
                            <p className="mt-1.5 text-xs font-semibold text-slate-400 truncate">
                                {highestTransaction 
                                    ? `${highestTransaction.title} (${formatDisplayDate(highestTransaction.date).split(" ").slice(0, 2).join(" ")})`
                                    : "Tidak ada transaksi"
                                }
                            </p>
                        </div>
                    </motion.div>

                    {/* Highest Spending Day Card */}
                    <motion.div
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: 0.15 }}
                        whileHover={{ y: -4, scale: 1.01 }}
                        className="overflow-hidden rounded-3xl border border-white bg-white/80 p-5 shadow-lg backdrop-blur transition-all duration-300"
                    >
                        <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-rose-100 p-2.5 text-rose-600">
                                <CalendarDays className="h-5 w-5" />
                            </div>
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                Hari Terboros
                            </span>
                        </div>
                        <div className="mt-4">
                            <h4 className="text-xl font-black text-slate-950 truncate">
                                {highestSpendingDay ? formatCurrency(highestSpendingDay.amount) : "-"}
                            </h4>
                            <p className="mt-1.5 text-xs font-semibold text-slate-400 truncate">
                                {highestSpendingDay 
                                    ? formatDisplayDate(highestSpendingDay.day).split(" ").slice(0, 2).join(" ")
                                    : "Tidak ada transaksi"
                                }
                            </p>
                        </div>
                    </motion.div>
                </div>

                <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-xl">
                    <CardContent className="p-6">
                        <h3 className="mb-5 text-2xl font-black text-slate-900">
                            Spending by Category
                        </h3>
                        {categoryReport.length === 0 ? (
                            <div className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500">
                                No spending data for this month.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {categoryReport.map((item) => {
                                    const detailTransactions =
                                        monthlyTransactions.filter(
                                            (transaction) =>
                                                transaction.category === item.category
                                        );
                                    const categoryData =
                                        categoryIcons[item.category] ||
                                        categoryIcons["Miscellaneous"];
                                    const Icon = categoryData.icon;
                                    return (
                                        <div
                                            key={item.category}
                                            className="space-y-3 rounded-3xl bg-slate-50 p-4"
                                        >
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setExpandedMonthlyCategory(
                                                        (current) =>
                                                            current === item.category
                                                                ? ""
                                                                : item.category
                                                    )
                                                }
                                                className="w-full min-w-0 text-left"
                                            >
                                                <div className="flex min-w-0 items-center justify-between gap-4">
                                                    <div className="flex min-w-0 items-center gap-3">
                                                        <div
                                                            className={`shrink-0 rounded-2xl p-3 ${categoryData.bg}`}
                                                        >
                                                            <Icon
                                                                className={`h-5 w-5 ${categoryData.color}`}
                                                            />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="truncate font-black text-slate-900">
                                                                {item.category}
                                                            </p>
                                                            <p className="text-sm font-medium text-slate-500">
                                                                {item.percentage}% of monthly spending
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <p className="shrink-0 font-black text-slate-900">
                                                        {formatCurrency(item.total)}
                                                    </p>
                                                </div>
                                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                                                    <div
                                                        className="h-full rounded-full bg-gradient-to-r from-pink-500 to-violet-500"
                                                        style={{
                                                            width: `${item.percentage}%`,
                                                        }}
                                                    />
                                                </div>
                                            </button>
                                            {expandedMonthlyCategory ===
                                                item.category && (
                                                <div className="space-y-2 border-t border-slate-200 pt-3">
                                                    {detailTransactions.map(
                                                        (transaction) => {
                                                            const detailCategoryData =
                                                                categoryIcons[
                                                                    transaction.category
                                                                ] ||
                                                                categoryIcons[
                                                                    "Miscellaneous"
                                                                ];
                                                            const DetailIcon =
                                                                detailCategoryData.icon;
                                                            return (
                                                                <div
                                                                    key={transaction.id}
                                                                    className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-white p-3 shadow-sm"
                                                                >
                                                                    <div className="flex min-w-0 items-center gap-3">
                                                                        <div
                                                                            className={`shrink-0 rounded-2xl p-2 ${detailCategoryData.bg}`}
                                                                        >
                                                                            <DetailIcon
                                                                                className={`h-4 w-4 ${detailCategoryData.color}`}
                                                                            />
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <p className="truncate font-bold text-slate-900">
                                                                                {transaction.title}
                                                                            </p>
                                                                            <p className="text-xs font-medium text-slate-500">
                                                                                {formatDisplayDate(
                                                                                    transaction.date
                                                                                )}{" "}
                                                                                •{" "}
                                                                                {transaction.source}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <p className="shrink-0 font-black text-rose-500">
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
                <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-xl">
                    <CardContent className="p-6">
                        <h3 className="mb-5 text-2xl font-black text-slate-900">
                            Spending by Sumber Dana
                        </h3>
                        {sourceReport.length === 0 ? (
                            <div className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500">
                                No fund source data for this month.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {sourceReport.map((item) => (
                                    <div
                                        key={item.source}
                                        className="flex min-w-0 items-center justify-between gap-3 rounded-3xl bg-slate-50 p-4"
                                    >
                                        <p className="truncate font-black text-slate-900">
                                            {item.source}
                                        </p>
                                        <p className="shrink-0 font-black text-slate-900">
                                            {formatCurrency(item.total)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
                <Card className="overflow-hidden rounded-3xl border-0 bg-white shadow-xl">
                    <CardContent className="p-6">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="rounded-2xl bg-pink-100 p-3">
                                <Wallet className="h-5 w-5 text-pink-600" />
                            </div>
                            <h3 className="text-2xl font-black text-slate-900">
                                Ambil Dari Mana
                            </h3>
                        </div>
                        {danaReport.length === 0 ? (
                            <div className="rounded-3xl bg-slate-50 p-8 text-center text-slate-500">
                                No dana data for this month.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {danaReport.map((item) => (
                                    <div
                                        key={item.dana}
                                        className="flex min-w-0 items-center justify-between gap-3 rounded-3xl bg-slate-50 p-4"
                                    >
                                        <p className="truncate font-black text-slate-900">
                                            {item.dana}
                                        </p>
                                        <p className="shrink-0 font-black text-slate-900">
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