import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from "react-native";
import { LinearGradient as ExpoLinearGradient } from "expo-linear-gradient";
import Svg, { Path, Defs, LinearGradient, Stop, Circle } from "react-native-svg";
import { categories, fundSources, danaDipakaiOptions } from "../constants/options";
import { formatCurrency } from "../utils/formatters";
import { reviewSpending } from "../services/gemini";
import {
  currentMonth,
  formatDisplayDate,
  formatMonthLabel,
  getTransactionMonth,
  normalizeDate,
  shiftMonth,
} from "../utils/date";

function StatCard({ label, value, meta, tone }) {
  return (
    <View style={[styles.statCard, tone === "rose" && styles.statCardRose, tone === "emerald" && styles.statCardEmerald]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {meta ? <Text style={styles.statMeta}>{meta}</Text> : null}
    </View>
  );
}

const CHART_WIDTH = 300;
const CHART_HEIGHT = 110;
const CHART_TOP = 10;
const CHART_BOTTOM = 100;

function buildSmoothPath(points) {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function TrendLineChart({ points, maxValue }) {
  const chartPoints = points.map((p, i) => ({
    x: points.length > 1 ? (i / (points.length - 1)) * CHART_WIDTH : CHART_WIDTH / 2,
    y: CHART_TOP + (1 - p.total / maxValue) * (CHART_BOTTOM - CHART_TOP),
  }));
  const linePath = buildSmoothPath(chartPoints);
  const lastPoint = chartPoints[chartPoints.length - 1];
  const areaPath = chartPoints.length
    ? `${linePath} L ${lastPoint.x} ${CHART_BOTTOM} L ${chartPoints[0].x} ${CHART_BOTTOM} Z`
    : "";

  return (
    <View>
      <Svg width="100%" height={CHART_HEIGHT} viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}>
        <Defs>
          <LinearGradient id="weeklyAreaGradient" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#c4b5fd" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#c4b5fd" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        {areaPath ? <Path d={areaPath} fill="url(#weeklyAreaGradient)" /> : null}
        {linePath ? (
          <Path d={linePath} stroke="#8b5cf6" strokeWidth={3} strokeLinecap="round" fill="none" />
        ) : null}
        {lastPoint ? (
          <>
            <Circle cx={lastPoint.x} cy={lastPoint.y} r={7} fill="#ffffff" />
            <Circle cx={lastPoint.x} cy={lastPoint.y} r={5} fill="#ec4899" />
          </>
        ) : null}
      </Svg>
      <View style={styles.weeklyAxisRow}>
        {points.map((p, i) => (
          <Text key={`${p.label}-${i}`} style={styles.weeklyAxisLabel}>
            {p.label}
          </Text>
        ))}
      </View>
    </View>
  );
}

const formatCompact = (amount) => {
  if (amount >= 1000000) return `Rp${(amount / 1000000).toFixed(1).replace(/\.0$/, "")}jt`;
  if (amount >= 1000) return `Rp${Math.round(amount / 1000)}rb`;
  return `Rp${Math.round(amount)}`;
};

const DAILY_CHART_WIDTH = 300;
const DAILY_CHART_HEIGHT = 90;

function DailySparkline({ values }) {
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;

  const coords = values.map((v, i) => ({
    x: values.length > 1 ? (i / (values.length - 1)) * DAILY_CHART_WIDTH : DAILY_CHART_WIDTH / 2,
    y: 8 + (1 - (v - min) / range) * (DAILY_CHART_HEIGHT - 16),
  }));

  const d = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");

  return (
    <Svg width="100%" height={DAILY_CHART_HEIGHT} viewBox={`0 0 ${DAILY_CHART_WIDTH} ${DAILY_CHART_HEIGHT}`}>
      {d ? (
        <Path d={d} stroke="#ffffff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : null}
    </Svg>
  );
}

export default function MonthlyReportScreen({ transactions, budget = 0 }) {
  const [month, setMonth] = useState(currentMonth());
  const [expandedCategory, setExpandedCategory] = useState("");
  const [expandedDate, setExpandedDate] = useState("");

  // Nggak boleh maju ke bulan yang belum ada datanya sama sekali -- kecuali
  // emang udah ada transaksi tercatat di bulan depan (misal cicilan CC).
  const maxAvailableMonth = useMemo(() => {
    return transactions.reduce((max, t) => {
      const m = getTransactionMonth(t.date);
      return m > max ? m : max;
    }, currentMonth());
  }, [transactions]);

  const canGoNext = month < maxAvailableMonth;

  const monthTransactions = useMemo(
    () => transactions.filter((t) => getTransactionMonth(t.date) === month),
    [transactions, month]
  );

  // Semua laporan/statistik di bawah ini soal pengeluaran -- pemasukan
  // dipisah biar nggak ngaco-in angka "Total bulan ini" dkk.
  const monthExpenses = useMemo(
    () => monthTransactions.filter((t) => t.type !== "income"),
    [monthTransactions]
  );

  const monthIncomeTotal = useMemo(
    () =>
      monthTransactions
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + Number(t.amount), 0),
    [monthTransactions]
  );

  const monthlyTotal = useMemo(
    () => monthExpenses.reduce((sum, t) => sum + Number(t.amount), 0),
    [monthExpenses]
  );

  const monthSpendBulanan = useMemo(
    () =>
      monthTransactions
        .filter((t) => t.danaDipakai === "Spend Bulanan")
        .reduce((sum, t) => sum + Number(t.amount), 0),
    [monthTransactions]
  );

  const monthLeftBudget = Math.max(0, budget - monthSpendBulanan);

  const spendingActivity = useMemo(() => {
    const [yearStr, monthStr] = month.split("-");
    const totalDays = new Date(Number(yearStr), Number(monthStr), 0).getDate();
    const isCurrent = month === currentMonth();
    const activeDays = isCurrent ? Math.min(new Date().getDate(), totalDays) : totalDays;

    const byDay = {};
    monthExpenses.forEach((t) => {
      const day = Number(normalizeDate(t.date).split("-")[2]);
      byDay[day] = (byDay[day] || 0) + Number(t.amount);
    });

    const values = Array.from({ length: activeDays }, (_, i) => byDay[i + 1] || 0);
    const maxValue = Math.max(1, ...values);

    return {
      values,
      maxValue,
      startLabel: `1 ${formatMonthLabel(month).split(" ")[0].slice(0, 3)}`,
      endLabel: `${activeDays} ${formatMonthLabel(month).split(" ")[0].slice(0, 3)}`,
    };
  }, [monthExpenses, month]);

  const dailyData = useMemo(() => {
    const grouped = {};
    monthTransactions.forEach((t) => {
      const key = normalizeDate(t.date);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
    });

    return Object.entries(grouped)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, list]) => ({
        date,
        transactions: list.sort(
          (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        ),
        amount: list
          .filter((t) => t.type !== "income")
          .reduce((sum, t) => sum + Number(t.amount), 0),
      }));
  }, [monthTransactions]);

  const MONTHS_BACK = 6;
  const monthlyAnalytics = useMemo(() => {
    const points = Array.from({ length: MONTHS_BACK }, (_, i) => {
      const m = shiftMonth(month, -(MONTHS_BACK - 1 - i));
      const total = transactions
        .filter((t) => getTransactionMonth(t.date) === m && t.type !== "income")
        .reduce((sum, t) => sum + Number(t.amount), 0);
      return { label: formatMonthLabel(m).slice(0, 3), total };
    });

    const maxValue = Math.max(1, ...points.map((p) => p.total));

    const lastPoint = points[points.length - 1];
    const prevPoint = points[points.length - 2];
    const trend =
      prevPoint && prevPoint.total > 0
        ? {
            percent: Math.abs(Math.round(((lastPoint.total - prevPoint.total) / prevPoint.total) * 100)),
            isIncrease: lastPoint.total > prevPoint.total,
          }
        : null;

    return { points, maxValue, lastPoint, trend };
  }, [transactions, month]);

  const activeDaysCount = useMemo(() => {
    const [yearStr, monthStr] = month.split("-");
    const totalDays = new Date(Number(yearStr), Number(monthStr), 0).getDate();
    const isCurrent = month === currentMonth();
    return isCurrent ? Math.min(new Date().getDate(), totalDays) : totalDays;
  }, [month]);

  const dailyAverage = monthlyTotal === 0 ? 0 : monthlyTotal / (activeDaysCount || 1);

  const prevMonth = useMemo(() => shiftMonth(month, -1), [month]);
  const prevMonthTotal = useMemo(
    () =>
      transactions
        .filter((t) => getTransactionMonth(t.date) === prevMonth && t.type !== "income")
        .reduce((sum, t) => sum + Number(t.amount), 0),
    [transactions, prevMonth]
  );

  const comparison = useMemo(() => {
    if (prevMonthTotal === 0) return null;
    const diff = monthlyTotal - prevMonthTotal;
    return {
      percent: Math.abs(Math.round((diff / prevMonthTotal) * 100)),
      isIncrease: diff > 0,
      diff: Math.abs(diff),
    };
  }, [monthlyTotal, prevMonthTotal]);

  const highestTransaction = useMemo(() => {
    if (monthExpenses.length === 0) return null;
    return monthExpenses.reduce(
      (max, t) => (Number(t.amount) > Number(max.amount) ? t : max),
      monthExpenses[0]
    );
  }, [monthExpenses]);

  const highestSpendingDay = useMemo(() => {
    if (monthExpenses.length === 0) return null;
    const byDay = {};
    monthExpenses.forEach((t) => {
      const key = normalizeDate(t.date);
      byDay[key] = (byDay[key] || 0) + Number(t.amount);
    });
    let maxDay = "";
    let maxAmount = 0;
    Object.entries(byDay).forEach(([day, amount]) => {
      if (amount > maxAmount) {
        maxAmount = amount;
        maxDay = day;
      }
    });
    return { day: maxDay, amount: maxAmount };
  }, [monthExpenses]);

  const categoryReport = useMemo(() => {
    return categories
      .map((category) => {
        const total = monthExpenses
          .filter((t) => t.category === category)
          .reduce((sum, t) => sum + Number(t.amount), 0);
        return {
          category,
          total,
          percentage: monthlyTotal ? Math.round((total / monthlyTotal) * 100) : 0,
        };
      })
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [monthExpenses, monthlyTotal]);

  const sourceReport = useMemo(() => {
    return fundSources
      .map((source) => ({
        source,
        total: monthExpenses
          .filter((t) => t.source === source)
          .reduce((sum, t) => sum + Number(t.amount), 0),
      }))
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [monthExpenses]);

  const danaReport = useMemo(() => {
    return danaDipakaiOptions
      .map((dana) => ({
        dana,
        total: monthExpenses
          .filter((t) => t.danaDipakai === dana)
          .reduce((sum, t) => sum + Number(t.amount), 0),
      }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [monthExpenses]);

  const [aiReview, setAiReview] = useState("");
  const [isReviewLoading, setIsReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const reviewCacheRef = useRef({});

  const generateReview = async (forceRefresh) => {
    if (monthTransactions.length === 0) {
      setAiReview("");
      setReviewError("");
      return;
    }
    if (!forceRefresh && reviewCacheRef.current[month]) {
      setAiReview(reviewCacheRef.current[month]);
      setReviewError("");
      return;
    }

    setIsReviewLoading(true);
    setReviewError("");
    try {
      const text = await reviewSpending({
        monthLabel: formatMonthLabel(month),
        total: formatCurrency(monthlyTotal),
        budget: budget > 0 ? formatCurrency(budget) : "belum di-set",
        leftBudget: budget > 0 ? formatCurrency(monthLeftBudget) : "-",
        categoryBreakdown: categoryReport
          .map((c) => `${c.category} ${formatCurrency(c.total)} (${c.percentage}%)`)
          .join(", "),
        highestTransaction: highestTransaction
          ? `${highestTransaction.title} ${formatCurrency(highestTransaction.amount)}`
          : "-",
        comparisonText: comparison
          ? `${comparison.isIncrease ? "naik" : "turun"} ${comparison.percent}% (${formatCurrency(comparison.diff)})`
          : "belum ada data bulan lalu",
      });
      reviewCacheRef.current[month] = text;
      setAiReview(text);
    } catch (err) {
      setReviewError(
        err.message === "QUOTA_EXCEEDED"
          ? "Kuota AI Review harian sudah penuh, coba lagi besok ya."
          : err.message || "Gagal generate review."
      );
    } finally {
      setIsReviewLoading(false);
    }
  };

  useEffect(() => {
    generateReview(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, monthTransactions.length, budget]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Monthly</Text>

      <View style={styles.monthSwitcher}>
        <Pressable style={styles.monthNav} onPress={() => setMonth((m) => shiftMonth(m, -1))}>
          <Text style={styles.monthNavText}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{formatMonthLabel(month)}</Text>
        <Pressable
          style={[styles.monthNav, !canGoNext && styles.monthNavDisabled]}
          onPress={() => canGoNext && setMonth((m) => shiftMonth(m, 1))}
          disabled={!canGoNext}
        >
          <Text style={[styles.monthNavText, !canGoNext && styles.monthNavTextDisabled]}>
            ›
          </Text>
        </Pressable>
      </View>

      <View style={styles.totalPanel}>
        <Text style={styles.totalLabel}>Total bulan ini</Text>
        <Text style={styles.totalValue}>{formatCurrency(monthlyTotal)}</Text>
        <View style={styles.totalMetaRow}>
          <Text style={styles.totalMeta}>{monthTransactions.length} transaksi</Text>
          {monthIncomeTotal > 0 ? (
            <Text style={styles.totalIncomeMeta}>+{formatCurrency(monthIncomeTotal)} masuk</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.weeklyCard}>
        <View style={styles.weeklyHeader}>
          <View>
            <Text style={styles.weeklyTitle}>Analitik Bulanan</Text>
            <View style={styles.weeklyValueRow}>
              <Text style={styles.weeklyValue}>{formatCurrency(monthlyAnalytics.lastPoint.total)}</Text>
              {monthlyAnalytics.trend ? (
                <View
                  style={[
                    styles.weeklyTrendBadge,
                    monthlyAnalytics.trend.isIncrease
                      ? styles.weeklyTrendBadgeUp
                      : styles.weeklyTrendBadgeDown,
                  ]}
                >
                  <Text style={styles.weeklyTrendText}>
                    {monthlyAnalytics.trend.isIncrease ? "▲" : "▼"} {monthlyAnalytics.trend.percent}%
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <TrendLineChart points={monthlyAnalytics.points} maxValue={monthlyAnalytics.maxValue} />
      </View>

      {monthTransactions.length > 0 ? (
        <View style={styles.aiCard}>
          <View style={styles.aiCardHeader}>
            <Text style={styles.aiCardTitle}>✨ AI Review</Text>
            <Pressable
              onPress={() => generateReview(true)}
              disabled={isReviewLoading}
              style={styles.aiRefreshButton}
            >
              <Text style={styles.aiRefreshText}>{isReviewLoading ? "..." : "↻ Ulangi"}</Text>
            </Pressable>
          </View>

          {isReviewLoading ? (
            <View style={styles.aiLoadingRow}>
              <ActivityIndicator color="#ec4899" size="small" />
              <Text style={styles.aiLoadingText}>Lagi nganalisa pengeluaran kamu...</Text>
            </View>
          ) : reviewError ? (
            <Text style={styles.aiErrorText}>{reviewError}</Text>
          ) : aiReview ? (
            <Text style={styles.aiReviewText}>{aiReview}</Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.statGrid}>
        <StatCard label="Rata-rata Harian" value={formatCurrency(dailyAverage)} meta={`${activeDaysCount} hari aktif`} />
        <StatCard
          label="vs Bulan Lalu"
          value={comparison ? `${comparison.isIncrease ? "+" : "-"}${comparison.percent}%` : "-"}
          meta={
            comparison
              ? `${comparison.isIncrease ? "Naik" : "Hemat"} ${formatCurrency(comparison.diff)}`
              : "Belum ada pembanding"
          }
          tone={comparison ? (comparison.isIncrease ? "rose" : "emerald") : undefined}
        />
        <StatCard
          label="Transaksi Terbesar"
          value={highestTransaction ? formatCurrency(highestTransaction.amount) : "-"}
          meta={highestTransaction ? highestTransaction.title : "Tidak ada transaksi"}
        />
        <StatCard
          label="Hari Terboros"
          value={highestSpendingDay ? formatCurrency(highestSpendingDay.amount) : "-"}
          meta={highestSpendingDay ? formatDisplayDate(highestSpendingDay.day) : "Tidak ada transaksi"}
        />
      </View>

      <ExpoLinearGradient
        colors={["#0f3d2e", "#1c7c52"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.activityCard}
      >
        <Text style={styles.activityEyebrow}>Spending Activity</Text>
        <Text style={styles.activityTitle}>Ringkasan Pengeluaran Harian</Text>

        <View style={styles.chartRow}>
          <View style={styles.chartYAxis}>
            <Text style={styles.activityYLabel}>{formatCompact(spendingActivity.maxValue)}</Text>
            <Text style={styles.activityYLabel}>{formatCompact(spendingActivity.maxValue / 2)}</Text>
          </View>
          <View style={styles.chartArea}>
            <DailySparkline values={spendingActivity.values} />
          </View>
        </View>

        <View style={styles.activityAxisRow}>
          <Text style={styles.activityAxisLabel}>{spendingActivity.startLabel}</Text>
          <Text style={styles.activityAxisLabel}>{spendingActivity.endLabel}</Text>
        </View>
      </ExpoLinearGradient>

      {dailyData.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rincian Harian</Text>
          <View style={styles.list}>
            {dailyData.map((item) => {
              const expanded = expandedDate === item.date;
              return (
                <View key={item.date} style={styles.dayCard}>
                  <Pressable
                    style={styles.dayHeader}
                    onPress={() => setExpandedDate(expanded ? "" : item.date)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.dayDate}>{formatDisplayDate(item.date)}</Text>
                      <Text style={styles.dayCount}>{item.transactions.length} transaksi</Text>
                    </View>
                    <Text style={styles.dayAmount}>-{formatCurrency(item.amount)}</Text>
                  </Pressable>

                  {expanded ? (
                    <View style={styles.dayDetail}>
                      {item.transactions.map((t) => {
                        const isIncome = t.type === "income";
                        return (
                          <View key={t.id} style={styles.detailRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.detailTitle}>{t.title}</Text>
                              <Text style={styles.detailMeta}>
                                {t.category} · {t.source}
                                {t.danaDipakai ? ` · ${t.danaDipakai}` : ""}
                              </Text>
                            </View>
                            <Text
                              style={[
                                styles.detailAmount,
                                isIncome && styles.detailAmountIncome,
                              ]}
                            >
                              {isIncome ? "+" : "-"}
                              {formatCurrency(t.amount)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spending by Category</Text>
        {categoryReport.length === 0 ? (
          <Text style={styles.emptyText}>Belum ada data bulan ini.</Text>
        ) : (
          <View style={styles.list}>
            {categoryReport.map((item) => {
              const expanded = expandedCategory === item.category;
              const detail = monthExpenses.filter((t) => t.category === item.category);
              return (
                <View key={item.category} style={styles.categoryCard}>
                  <Pressable onPress={() => setExpandedCategory(expanded ? "" : item.category)}>
                    <View style={styles.categoryRow}>
                      <Text style={styles.categoryName}>{item.category}</Text>
                      <Text style={styles.categoryAmount}>{formatCurrency(item.total)}</Text>
                    </View>
                    <Text style={styles.categoryPercent}>{item.percentage}% dari total</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${item.percentage}%` }]} />
                    </View>
                  </Pressable>

                  {expanded ? (
                    <View style={styles.dayDetail}>
                      {detail.map((t) => (
                        <View key={t.id} style={styles.detailRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.detailTitle}>{t.title}</Text>
                            <Text style={styles.detailMeta}>
                              {formatDisplayDate(t.date)} · {t.source}
                            </Text>
                          </View>
                          <Text style={styles.detailAmount}>-{formatCurrency(t.amount)}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spending by Sumber Dana</Text>
        {sourceReport.length === 0 ? (
          <Text style={styles.emptyText}>Belum ada data bulan ini.</Text>
        ) : (
          <View style={styles.list}>
            {sourceReport.map((item) => (
              <View key={item.source} style={styles.simpleRow}>
                <Text style={styles.simpleLabel}>{item.source}</Text>
                <Text style={styles.simpleValue}>{formatCurrency(item.total)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ambil Dari Mana</Text>
        {danaReport.length === 0 ? (
          <Text style={styles.emptyText}>Belum ada data bulan ini.</Text>
        ) : (
          <View style={styles.list}>
            {danaReport.map((item) => (
              <View key={item.dana} style={styles.simpleRow}>
                <Text style={styles.simpleLabel}>{item.dana}</Text>
                <Text style={styles.simpleValue}>{formatCurrency(item.total)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 100, gap: 16 },
  title: { color: "#0f172a", fontSize: 28, fontWeight: "900" },
  monthSwitcher: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#ffffff", borderRadius: 16, padding: 10 },
  monthNav: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#f4f7fb", alignItems: "center", justifyContent: "center" },
  monthNavText: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  monthNavDisabled: { opacity: 0.35 },
  monthNavTextDisabled: { color: "#94a3b8" },
  monthLabel: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  totalPanel: { backgroundColor: "#0f172a", borderRadius: 20, padding: 20 },
  weeklyCard: { backgroundColor: "#ffffff", borderRadius: 16, padding: 16 },
  weeklyHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  weeklyTitle: { color: "#64748b", fontSize: 12, fontWeight: "700" },
  weeklyValueRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  weeklyValue: { color: "#0f172a", fontSize: 22, fontWeight: "900" },
  weeklyTrendBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  weeklyTrendBadgeUp: { backgroundColor: "#ffe4e6" },
  weeklyTrendBadgeDown: { backgroundColor: "#dcfce7" },
  weeklyTrendText: { fontSize: 11, fontWeight: "800", color: "#0f172a" },
  weeklyAxisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  weeklyAxisLabel: { color: "#94a3b8", fontSize: 10, fontWeight: "700" },
  activityCard: { borderRadius: 24, padding: 20 },
  activityEyebrow: { color: "#bbf7d0", fontSize: 12, fontWeight: "700" },
  activityTitle: { color: "#ffffff", fontSize: 20, fontWeight: "900", marginTop: 4 },
  chartRow: { flexDirection: "row", marginTop: 22 },
  chartYAxis: { justifyContent: "space-between", paddingBottom: 16, marginRight: 8 },
  activityYLabel: { color: "#bbf7d0", fontSize: 11, fontWeight: "700" },
  chartArea: { flex: 1 },
  activityAxisRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  activityAxisLabel: { color: "#bbf7d0", fontSize: 11, fontWeight: "700" },
  dayCard: { backgroundColor: "#ffffff", borderRadius: 16, padding: 14 },
  dayHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  dayDate: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  dayCount: { color: "#64748b", fontSize: 12, fontWeight: "600", marginTop: 2 },
  dayAmount: { color: "#e11d48", fontSize: 16, fontWeight: "900" },
  detailAmountIncome: { color: "#16a34a" },
  aiCard: {
    backgroundColor: "#fdf2f8",
    borderColor: "#fbcfe8",
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
  },
  aiCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  aiCardTitle: { color: "#be185d", fontSize: 14, fontWeight: "900" },
  aiRefreshButton: {
    backgroundColor: "#ffffff",
    borderColor: "#fbcfe8",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  aiRefreshText: { color: "#be185d", fontSize: 11, fontWeight: "800" },
  aiLoadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  aiLoadingText: { color: "#9d174d", fontSize: 13, fontWeight: "600" },
  aiReviewText: { color: "#831843", fontSize: 14, fontWeight: "600", lineHeight: 21 },
  aiErrorText: { color: "#be123c", fontSize: 13, fontWeight: "700" },
  totalLabel: { color: "#94a3b8", fontSize: 13, fontWeight: "700" },
  totalValue: { color: "#ffffff", fontSize: 30, fontWeight: "900", marginTop: 8 },
  totalMeta: { color: "#cbd5e1", fontSize: 13, fontWeight: "700" },
  totalMetaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  totalIncomeMeta: { color: "#4ade80", fontSize: 13, fontWeight: "800" },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  statCard: { flexGrow: 1, flexBasis: "47%", backgroundColor: "#ffffff", borderRadius: 16, padding: 14 },
  statCardRose: { backgroundColor: "#fff1f2" },
  statCardEmerald: { backgroundColor: "#ecfdf5" },
  statLabel: { color: "#64748b", fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  statValue: { color: "#0f172a", fontSize: 17, fontWeight: "900", marginTop: 8 },
  statMeta: { color: "#94a3b8", fontSize: 11, fontWeight: "600", marginTop: 4 },
  section: { gap: 12 },
  sectionTitle: { color: "#0f172a", fontSize: 18, fontWeight: "900" },
  emptyText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  list: { gap: 10 },
  categoryCard: { backgroundColor: "#ffffff", borderRadius: 16, padding: 14 },
  categoryRow: { flexDirection: "row", justifyContent: "space-between" },
  categoryName: { color: "#0f172a", fontSize: 14, fontWeight: "900" },
  categoryAmount: { color: "#0f172a", fontSize: 14, fontWeight: "900" },
  categoryPercent: { color: "#94a3b8", fontSize: 11, fontWeight: "700", marginTop: 4 },
  barTrack: { height: 6, backgroundColor: "#f1f5f9", borderRadius: 3, marginTop: 8, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#ec4899", borderRadius: 3 },
  dayDetail: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#f1f5f9", gap: 8 },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#f4f7fb", borderRadius: 12, padding: 10, gap: 10 },
  detailTitle: { color: "#0f172a", fontSize: 13, fontWeight: "800" },
  detailMeta: { color: "#64748b", fontSize: 11, fontWeight: "600", marginTop: 2 },
  detailAmount: { color: "#e11d48", fontSize: 13, fontWeight: "900" },
  simpleRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#ffffff", borderRadius: 14, padding: 14 },
  simpleLabel: { color: "#0f172a", fontSize: 14, fontWeight: "900" },
  simpleValue: { color: "#0f172a", fontSize: 14, fontWeight: "900" },
});
