import React, { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { categories, fundSources, danaDipakaiOptions } from "../constants/options";
import { formatCurrency } from "../utils/formatters";
import { formatDisplayDate, today } from "../utils/date";
import { availableYears, belongsTo, yearSummary } from "../utils/report";
import { sortTimestamp } from "../utils/transactions";
import { colors } from "../theme";
import { reportStyles as rs } from "./MonthlyReportScreen";

// Rincian per kategori dan per sumber dana bisa dibuka isinya, dan setahun
// itu bisa ratusan baris. Dibatasi, dengan sisanya disebut terus terang --
// daftar 400 baris di dalam kartu bukan "lengkap", cuma nggak kebaca.
const MAX_DETAIL = 30;

export default function YearlyReportScreen({ transactions = [], onEditTransaction }) {
  const years = useMemo(() => availableYears(transactions), [transactions]);
  const todayStr = today();
  const thisYear = todayStr.slice(0, 4);

  const [selectedYear, setSelectedYear] = useState(
    () => (years.includes(thisYear) ? thisYear : years[0] || thisYear)
  );

  const summary = useMemo(
    () =>
      yearSummary(transactions, selectedYear, {
        categories,
        fundSources,
        danaDipakaiOptions,
        todayStr,
      }),
    [transactions, selectedYear, todayStr]
  );

  // Daftar transaksi tahun ini, dipakai buat isi rincian yang dibuka.
  //
  // Diurutkan dari nominal TERBESAR, bukan terbaru. Rentangnya setahun: yang
  // dicari waktu membuka "Shopping Rp 2,1 juta" itu belanja apa yang bikin
  // angkanya segitu, bukan yang kebetulan paling baru. Ini juga yang bikin
  // batas 30 baris di bawah masuk akal -- 30 terbesar menjelaskan totalnya,
  // 30 terbaru tidak.
  const expenses = useMemo(
    () =>
      transactions
        .filter((t) => t.type !== "income" && String(t.date).slice(0, 4) === selectedYear)
        .filter((t) => selectedYear !== thisYear || t.paidAt || String(t.date).slice(0, 10) <= todayStr)
        .sort(
          (a, b) =>
            (Number(b.amount) || 0) - (Number(a.amount) || 0) ||
            sortTimestamp(b) - sortTimestamp(a)
        ),
    [transactions, selectedYear, thisYear, todayStr]
  );

  const [openCategory, setOpenCategory] = useState("");
  const [openDana, setOpenDana] = useState("");

  const index = years.indexOf(selectedYear);
  const canOlder = index >= 0 && index < years.length - 1;
  const canNewer = index > 0;

  // Bar per bulan diukur terhadap bulan paling boros, bukan terhadap total
  // setahun. Kalau diukur dari total, dua belas batangnya mentok pendek
  // semua dan bentuk tahunnya justru hilang.
  const peak = summary.byMonth.reduce((max, m) => Math.max(max, m.total), 0);
  const monthsWithData = summary.byMonth.filter((m) => m.total > 0);

  const isCurrentYear = selectedYear === thisYear;

  return (
    <ScrollView contentContainerStyle={rs.content} showsVerticalScrollIndicator={false}>
      <Text style={rs.title}>Laporan Tahunan</Text>

      {years.length > 1 ? (
        <View style={rs.monthSwitcher}>
          <Pressable
            onPress={() => canOlder && setSelectedYear(years[index + 1])}
            style={[rs.monthNav, !canOlder && rs.monthNavDisabled]}
            disabled={!canOlder}
          >
            <Text style={[rs.monthNavText, !canOlder && rs.monthNavTextDisabled]}>‹</Text>
          </Pressable>
          <Text style={rs.monthLabel}>{selectedYear}</Text>
          <Pressable
            onPress={() => canNewer && setSelectedYear(years[index - 1])}
            style={[rs.monthNav, !canNewer && rs.monthNavDisabled]}
            disabled={!canNewer}
          >
            <Text style={[rs.monthNavText, !canNewer && rs.monthNavTextDisabled]}>›</Text>
          </Pressable>
        </View>
      ) : null}

      <LinearGradient
        colors={["#073f63", "#0d6a9c", "#1a93cf"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <Text style={styles.heroLabel}>Uang yang sudah keluar</Text>
        <Text style={styles.heroSubtitle}>
          {isCurrentYear ? `Januari ${selectedYear} - Sekarang` : `Sepanjang ${selectedYear}`}
        </Text>
        <Text style={styles.heroValue}>{formatCurrency(summary.total)}</Text>
        <View style={styles.heroDivider} />
      </LinearGradient>

      <View style={rs.statGrid}>
        <StatBox label="Transaksi" value={`${summary.count}`} meta="pengeluaran" />
        <StatBox
          label="Rata-rata / bulan"
          value={formatCurrency(summary.monthlyAverage)}
          meta={`dari ${monthsWithData.length} bulan`}
        />
        <StatBox
          label="Paling boros"
          value={summary.busiestMonth ? summary.busiestMonth.label : "-"}
          meta={summary.busiestMonth ? formatCurrency(summary.busiestMonth.total) : ""}
        />
      </View>

      <View style={rs.section}>
        <Text style={rs.sectionTitle}>Per Bulan</Text>
        {monthsWithData.length === 0 ? (
          <Text style={rs.emptyText}>Belum ada pengeluaran di {selectedYear}.</Text>
        ) : (
          <View style={rs.list}>
            {summary.byMonth.map((m) => (
              <View key={m.month} style={styles.monthRow}>
                <Text style={styles.monthName}>{m.label}</Text>
                <View style={styles.monthBarArea}>
                  <View style={rs.barTrack}>
                    <View
                      style={[rs.barFill, { width: peak ? `${(m.total / peak) * 100}%` : "0%" }]}
                    />
                  </View>
                </View>
                <Text style={[styles.monthValue, !m.total && styles.monthValueEmpty]}>
                  {m.total ? formatCurrency(m.total) : "-"}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Breakdown
        title="Spending by Category"
        rows={summary.byCategory}
        year={selectedYear}
        openKey={openCategory}
        setOpenKey={setOpenCategory}
        onPressTransaction={onEditTransaction}
        detailFor={(bucket) => expenses.filter((t) => belongsTo(bucket, t.category))}
      />

      <View style={rs.section}>
        <Text style={rs.sectionTitle}>Spending by Sumber Dana</Text>
        {summary.bySource.length === 0 ? (
          <Text style={rs.emptyText}>Belum ada pengeluaran di {selectedYear}.</Text>
        ) : (
          <View style={rs.list}>
            {summary.bySource.map((item) => (
              <View key={item.value} style={rs.simpleRow}>
                <Text style={rs.simpleLabel}>
                  {item.label}
                  {item.unlisted ? <Text style={styles.unlisted}>  di luar daftar</Text> : null}
                </Text>
                <Text style={rs.simpleValue}>{formatCurrency(item.total)}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <Breakdown
        title="Ambil Dari Mana"
        rows={summary.byDana}
        year={selectedYear}
        openKey={openDana}
        setOpenKey={setOpenDana}
        onPressTransaction={onEditTransaction}
        detailFor={(bucket) => expenses.filter((t) => belongsTo(bucket, t.danaDipakai))}
      />

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

function StatBox({ label, value, meta }) {
  return (
    <View style={rs.statCard}>
      <Text style={rs.statLabel}>{label}</Text>
      <Text style={rs.statValue}>{value}</Text>
      {meta ? <Text style={rs.statMeta}>{meta}</Text> : null}
    </View>
  );
}

function Breakdown({ title, rows, year, openKey, setOpenKey, detailFor, onPressTransaction }) {
  return (
    <View style={rs.section}>
      <Text style={rs.sectionTitle}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={rs.emptyText}>Belum ada pengeluaran di {year}.</Text>
      ) : (
        <View style={rs.list}>
          {rows.map((item) => {
            const expanded = openKey === item.value;
            const detail = expanded ? detailFor(item.value) : [];
            return (
              <View key={item.value} style={rs.categoryCard}>
                <Pressable onPress={() => setOpenKey(expanded ? "" : item.value)}>
                  <View style={rs.categoryRow}>
                    <Text style={rs.categoryName}>{item.label}</Text>
                    <View style={rs.danaAmountRow}>
                      <Text style={rs.categoryAmount}>{formatCurrency(item.total)}</Text>
                      <Text style={rs.danaChevron}>{expanded ? "▲" : "▼"}</Text>
                    </View>
                  </View>
                  <Text style={rs.categoryPercent}>
                    {item.percentage}% dari total setahun
                    {item.unlisted ? "  ·  di luar daftar pilihan" : ""}
                  </Text>
                  <View style={rs.barTrack}>
                    <View style={[rs.barFill, { width: `${item.percentage}%` }]} />
                  </View>
                </Pressable>

                {expanded ? (
                  <View style={rs.dayDetail}>
                    {detail.slice(0, MAX_DETAIL).map((t) => (
                      <Pressable
                        key={t.id}
                        style={rs.detailRow}
                        onPress={() => onPressTransaction && onPressTransaction(t)}
                        disabled={!onPressTransaction}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={rs.detailTitle}>{t.title}</Text>
                          <Text style={rs.detailMeta}>
                            {formatDisplayDate(t.date)}
                            {t.time ? ` ${t.time}` : ""} · {t.source}
                            {t.danaDipakai ? ` · ${t.danaDipakai}` : ""}
                          </Text>
                        </View>
                        <Text style={rs.detailAmount}>-{formatCurrency(t.amount)}</Text>
                      </Pressable>
                    ))}
                    {detail.length > MAX_DETAIL ? (
                      <Text style={styles.moreText}>
                        +{detail.length - MAX_DETAIL} transaksi lagi — buka tab Home kalau mau
                        lihat semuanya
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heroCard: { borderRadius: 24, padding: 20, marginBottom: 16 },
  heroLabel: { color: "rgba(255,255,255,0.82)", fontSize: 13, fontWeight: "700" },
  heroSubtitle: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "600", marginTop: 2 },
  heroValue: { color: "#ffffff", fontSize: 32, fontWeight: "900", marginTop: 14, letterSpacing: -0.5 },
  heroDivider: { height: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.25)", marginTop: 16 },

  monthRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  monthName: { width: 74, color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  monthBarArea: { flex: 1 },
  monthValue: { width: 104, textAlign: "right", color: colors.text, fontSize: 12, fontWeight: "800" },
  monthValueEmpty: { color: colors.textFaint, fontWeight: "600" },

  unlisted: { color: "#fbbf24", fontSize: 11, fontWeight: "700" },
  moreText: { color: colors.textFaint, fontSize: 11, fontWeight: "600", paddingTop: 8, paddingHorizontal: 4 },
});
