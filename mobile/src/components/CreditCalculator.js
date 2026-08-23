import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { formatCurrency } from "../utils/formatters";

const formatThousands = (value) => {
  const raw = String(value || "").replace(/[^\d]/g, "");
  return raw ? new Intl.NumberFormat("id-ID").format(Number(raw)) : "";
};

const parseAmount = (value) => Number(String(value || "").replace(/[^\d]/g, "")) || 0;

function buildSchedule({ principal, annualRate, months, method }) {
  const monthlyRate = annualRate / 100 / 12;
  const schedule = [];
  let balance = principal;
  let monthlyPayment = 0;

  if (method === "effective") {
    monthlyPayment =
      monthlyRate === 0
        ? principal / months
        : (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
          (Math.pow(1 + monthlyRate, months) - 1);

    for (let i = 1; i <= months; i++) {
      const interest = balance * monthlyRate;
      const principalPortion = monthlyPayment - interest;
      balance = Math.max(0, balance - principalPortion);
      schedule.push({ month: i, payment: monthlyPayment, principal: principalPortion, interest, balance });
    }
  } else {
    const totalInterest = principal * (annualRate / 100) * (months / 12);
    const principalPortion = principal / months;
    const interestPortion = totalInterest / months;
    monthlyPayment = principalPortion + interestPortion;

    for (let i = 1; i <= months; i++) {
      balance = Math.max(0, balance - principalPortion);
      schedule.push({ month: i, payment: monthlyPayment, principal: principalPortion, interest: interestPortion, balance });
    }
  }

  const totalPayment = monthlyPayment * months;
  return { monthlyPayment, totalPayment, totalInterest: totalPayment - principal, schedule };
}

export default function CreditCalculator({ onBack }) {
  const [method, setMethod] = useState("effective");
  const [price, setPrice] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [rate, setRate] = useState("");
  const [tenor, setTenor] = useState("");
  const [showSchedule, setShowSchedule] = useState(false);

  const principal = Math.max(0, parseAmount(price) - parseAmount(downPayment));
  const annualRate = Number(String(rate).replace(",", ".")) || 0;
  const months = Number(tenor) || 0;
  const dpPercent = parseAmount(price) > 0 ? Math.round((parseAmount(downPayment) / parseAmount(price)) * 100) : 0;

  const result = useMemo(() => {
    if (principal <= 0 || months <= 0) return null;
    return buildSchedule({ principal, annualRate, months, method });
  }, [principal, annualRate, months, method]);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Kalkulator Kredit</Text>
          <Text style={styles.subtitle}>Simulasi cicilan KPR / kredit kendaraan.</Text>
        </View>
      </View>

      <View style={styles.typeToggle}>
        <Pressable
          style={[styles.typeToggleButton, method === "effective" && styles.typeToggleButtonActive]}
          onPress={() => setMethod("effective")}
        >
          <Text style={[styles.typeToggleText, method === "effective" && styles.typeToggleTextActive]}>
            Efektif/Anuitas
          </Text>
        </Pressable>
        <Pressable
          style={[styles.typeToggleButton, method === "flat" && styles.typeToggleButtonActive]}
          onPress={() => setMethod("flat")}
        >
          <Text style={[styles.typeToggleText, method === "flat" && styles.typeToggleTextActive]}>
            Flat
          </Text>
        </Pressable>
      </View>
      <Text style={styles.methodHint}>
        {method === "effective"
          ? "Biasa dipakai KPR/KTA -- porsi bunga makin lama makin kecil."
          : "Biasa dipakai kredit mobil/motor -- bunga dihitung dari pokok awal terus."}
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Harga Barang (Rp)</Text>
        <TextInput
          style={styles.input}
          placeholder="300000000"
          placeholderTextColor="#94a3b8"
          keyboardType="numeric"
          value={price}
          onChangeText={(v) => setPrice(formatThousands(v))}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>
          Uang Muka / DP (Rp){parseAmount(price) > 0 ? ` -- ${dpPercent}% dari harga` : ""}
        </Text>
        <TextInput
          style={styles.input}
          placeholder="60000000"
          placeholderTextColor="#94a3b8"
          keyboardType="numeric"
          value={downPayment}
          onChangeText={(v) => setDownPayment(formatThousands(v))}
        />
      </View>

      <View style={styles.principalPanel}>
        <Text style={styles.principalLabel}>Jumlah Pinjaman</Text>
        <Text style={styles.principalValue}>{formatCurrency(principal)}</Text>
      </View>

      <View style={styles.rowGroup}>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Bunga /Tahun (%)</Text>
          <TextInput
            style={styles.input}
            placeholder="6.5"
            placeholderTextColor="#94a3b8"
            keyboardType="numeric"
            value={rate}
            onChangeText={setRate}
          />
        </View>
        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Tenor (bulan)</Text>
          <TextInput
            style={styles.input}
            placeholder="60"
            placeholderTextColor="#94a3b8"
            keyboardType="numeric"
            value={tenor}
            onChangeText={setTenor}
          />
        </View>
      </View>

      {result ? (
        <>
          <View style={styles.resultPanel}>
            <Text style={styles.resultLabel}>Cicilan per Bulan</Text>
            <Text style={styles.resultValue}>{formatCurrency(result.monthlyPayment)}</Text>
            <View style={styles.resultMetaRow}>
              <View>
                <Text style={styles.resultMetaLabel}>Total Bunga</Text>
                <Text style={styles.resultMetaValue}>{formatCurrency(result.totalInterest)}</Text>
              </View>
              <View>
                <Text style={styles.resultMetaLabel}>Total Pembayaran</Text>
                <Text style={styles.resultMetaValue}>{formatCurrency(result.totalPayment)}</Text>
              </View>
            </View>
          </View>

          <Pressable style={styles.scheduleToggle} onPress={() => setShowSchedule((s) => !s)}>
            <Text style={styles.scheduleToggleText}>
              {showSchedule ? "Sembunyikan" : "Lihat"} Rincian Angsuran ({months}x)
            </Text>
          </Pressable>

          {showSchedule ? (
            <View style={styles.list}>
              {result.schedule.map((row) => (
                <View key={row.month} style={styles.scheduleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scheduleMonth}>Bulan ke-{row.month}</Text>
                    <Text style={styles.scheduleMeta}>Sisa pokok {formatCurrency(row.balance)}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.schedulePayment}>{formatCurrency(row.payment)}</Text>
                    <Text style={styles.scheduleMeta}>
                      Pokok {formatCurrency(row.principal)} · Bunga {formatCurrency(row.interest)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyText}>Isi harga, DP, bunga, dan tenor buat lihat hasil simulasi.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 100, gap: 16 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  backButtonText: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  title: { color: "#0f172a", fontSize: 22, fontWeight: "900" },
  subtitle: { color: "#64748b", fontSize: 12, fontWeight: "600", marginTop: 2 },
  typeToggle: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  typeToggleButton: { flex: 1, alignItems: "center", borderRadius: 10, paddingVertical: 10 },
  typeToggleButtonActive: { backgroundColor: "#0f172a" },
  typeToggleText: { color: "#64748b", fontSize: 13, fontWeight: "800" },
  typeToggleTextActive: { color: "#ffffff" },
  methodHint: { color: "#94a3b8", fontSize: 11, fontWeight: "600", marginTop: -8 },
  inputGroup: { gap: 8 },
  rowGroup: { flexDirection: "row", gap: 12 },
  label: { color: "#64748b", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 12,
    color: "#0f172a",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  principalPanel: { backgroundColor: "#f4f7fb", borderRadius: 14, padding: 14 },
  principalLabel: { color: "#64748b", fontSize: 11, fontWeight: "700" },
  principalValue: { color: "#0f172a", fontSize: 18, fontWeight: "900", marginTop: 4 },
  resultPanel: { backgroundColor: "#0f172a", borderRadius: 20, padding: 20 },
  resultLabel: { color: "#94a3b8", fontSize: 13, fontWeight: "700" },
  resultValue: { color: "#ffffff", fontSize: 28, fontWeight: "900", marginTop: 6 },
  resultMetaRow: { flexDirection: "row", gap: 24, marginTop: 16 },
  resultMetaLabel: { color: "#94a3b8", fontSize: 11, fontWeight: "700" },
  resultMetaValue: { color: "#ffffff", fontSize: 14, fontWeight: "800", marginTop: 2 },
  scheduleToggle: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
  },
  scheduleToggleText: { color: "#334155", fontSize: 13, fontWeight: "800" },
  list: { gap: 8 },
  scheduleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  scheduleMonth: { color: "#0f172a", fontSize: 13, fontWeight: "800" },
  scheduleMeta: { color: "#94a3b8", fontSize: 10, fontWeight: "600", marginTop: 2 },
  schedulePayment: { color: "#0f172a", fontSize: 13, fontWeight: "900" },
  emptyPanel: { backgroundColor: "#ffffff", borderRadius: 16, padding: 24, alignItems: "center" },
  emptyText: { color: "#64748b", fontSize: 13, fontWeight: "600", textAlign: "center" },
});
