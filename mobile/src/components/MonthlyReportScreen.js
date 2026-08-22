import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { categories, fundSources, danaDipakaiOptions } from "../constants/options";
import { formatCurrency } from "../utils/formatters";
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

export default function MonthlyReportScreen({ transactions }) {
  const [month, setMonth] = useState(currentMonth());
  const [expandedCategory, setExpandedCategory] = useState("");

  const monthTransactions = useMemo(
    () => transactions.filter((t) => getTransactionMonth(t.date) === month),
    [transactions, month]
  );

  const monthlyTotal = useMemo(
    () => monthTransactions.reduce((sum, t) => sum + Number(t.amount), 0),
    [monthTransactions]
  );

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
        .filter((t) => getTransactionMonth(t.date) === prevMonth)
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
    if (monthTransactions.length === 0) return null;
    return monthTransactions.reduce(
      (max, t) => (Number(t.amount) > Number(max.amount) ? t : max),
      monthTransactions[0]
    );
  }, [monthTransactions]);

  const highestSpendingDay = useMemo(() => {
    if (monthTransactions.length === 0) return null;
    const byDay = {};
    monthTransactions.forEach((t) => {
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
  }, [monthTransactions]);

  const categoryReport = useMemo(() => {
    return categories
      .map((category) => {
        const total = monthTransactions
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
  }, [monthTransactions, monthlyTotal]);

  const sourceReport = useMemo(() => {
    return fundSources
      .map((source) => ({
        source,
        total: monthTransactions
          .filter((t) => t.source === source)
          .reduce((sum, t) => sum + Number(t.amount), 0),
      }))
      .filter((s) => s.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [monthTransactions]);

  const danaReport = useMemo(() => {
    return danaDipakaiOptions
      .map((dana) => ({
        dana,
        total: monthTransactions
          .filter((t) => t.danaDipakai === dana)
          .reduce((sum, t) => sum + Number(t.amount), 0),
      }))
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [monthTransactions]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Monthly</Text>

      <View style={styles.monthSwitcher}>
        <Pressable style={styles.monthNav} onPress={() => setMonth((m) => shiftMonth(m, -1))}>
          <Text style={styles.monthNavText}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{formatMonthLabel(month)}</Text>
        <Pressable style={styles.monthNav} onPress={() => setMonth((m) => shiftMonth(m, 1))}>
          <Text style={styles.monthNavText}>›</Text>
        </Pressable>
      </View>

      <View style={styles.totalPanel}>
        <Text style={styles.totalLabel}>Total bulan ini</Text>
        <Text style={styles.totalValue}>{formatCurrency(monthlyTotal)}</Text>
        <Text style={styles.totalMeta}>{monthTransactions.length} transaksi</Text>
      </View>

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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spending by Category</Text>
        {categoryReport.length === 0 ? (
          <Text style={styles.emptyText}>Belum ada data bulan ini.</Text>
        ) : (
          <View style={styles.list}>
            {categoryReport.map((item) => {
              const expanded = expandedCategory === item.category;
              const detail = monthTransactions.filter((t) => t.category === item.category);
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
  monthLabel: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  totalPanel: { backgroundColor: "#0f172a", borderRadius: 20, padding: 20 },
  totalLabel: { color: "#94a3b8", fontSize: 13, fontWeight: "700" },
  totalValue: { color: "#ffffff", fontSize: 30, fontWeight: "900", marginTop: 8 },
  totalMeta: { color: "#cbd5e1", fontSize: 13, fontWeight: "700", marginTop: 8 },
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
