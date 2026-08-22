import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { formatCurrency } from "../utils/formatters";
import {
  currentMonth,
  formatDisplayDate,
  formatMonthLabel,
  getTransactionMonth,
  normalizeDate,
  shiftMonth,
} from "../utils/date";

export default function DailyReportScreen({ transactions }) {
  const [month, setMonth] = useState(currentMonth());
  const [expandedDate, setExpandedDate] = useState("");

  const monthTransactions = useMemo(
    () => transactions.filter((t) => getTransactionMonth(t.date) === month),
    [transactions, month]
  );

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
        amount: list.reduce((sum, t) => sum + Number(t.amount), 0),
      }));
  }, [monthTransactions]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Daily</Text>
      <Text style={styles.subtitle}>Tap tanggal untuk lihat detail transaksi hari itu.</Text>

      <View style={styles.monthSwitcher}>
        <Pressable style={styles.monthNav} onPress={() => setMonth((m) => shiftMonth(m, -1))}>
          <Text style={styles.monthNavText}>‹</Text>
        </Pressable>
        <Text style={styles.monthLabel}>{formatMonthLabel(month)}</Text>
        <Pressable style={styles.monthNav} onPress={() => setMonth((m) => shiftMonth(m, 1))}>
          <Text style={styles.monthNavText}>›</Text>
        </Pressable>
      </View>

      {dailyData.length === 0 ? (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyText}>Belum ada pengeluaran bulan ini.</Text>
        </View>
      ) : (
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
                    {item.transactions.map((t) => (
                      <View key={t.id} style={styles.detailRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.detailTitle}>{t.title}</Text>
                          <Text style={styles.detailMeta}>
                            {t.category} · {t.source} · {t.danaDipakai}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 100, gap: 16 },
  title: { color: "#0f172a", fontSize: 28, fontWeight: "900" },
  subtitle: { color: "#64748b", fontSize: 13, fontWeight: "600", marginTop: -12 },
  monthSwitcher: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#ffffff", borderRadius: 16, padding: 10 },
  monthNav: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#f4f7fb", alignItems: "center", justifyContent: "center" },
  monthNavText: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  monthLabel: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  emptyPanel: { backgroundColor: "#ffffff", borderRadius: 16, padding: 24, alignItems: "center" },
  emptyText: { color: "#64748b", fontSize: 13, fontWeight: "600" },
  list: { gap: 10 },
  dayCard: { backgroundColor: "#ffffff", borderRadius: 16, padding: 14 },
  dayHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  dayDate: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  dayCount: { color: "#64748b", fontSize: 12, fontWeight: "600", marginTop: 2 },
  dayAmount: { color: "#e11d48", fontSize: 16, fontWeight: "900" },
  dayDetail: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#f1f5f9", gap: 8 },
  detailRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#f4f7fb", borderRadius: 12, padding: 10, gap: 10 },
  detailTitle: { color: "#0f172a", fontSize: 13, fontWeight: "800" },
  detailMeta: { color: "#64748b", fontSize: 11, fontWeight: "600", marginTop: 2 },
  detailAmount: { color: "#e11d48", fontSize: 13, fontWeight: "900" },
});
