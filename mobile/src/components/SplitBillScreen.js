import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Share,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { formatCurrency } from "../utils/formatters";
import { formatDisplayDate, today } from "../utils/date";
import { scanReceipt } from "../services/gemini";

const generateId = () =>
  `split-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const formatThousands = (value) => {
  const raw = String(value || "").replace(/[^\d]/g, "");
  return raw ? new Intl.NumberFormat("id-ID").format(Number(raw)) : "";
};

const parseAmount = (value) => Number(String(value || "").replace(/[^\d]/g, "")) || 0;

// Ringkasan teks buat native share sheet -- nggak ada link/hosting, cukup
// dikirim langsung ke grup WA/dsb biar semua orang tau siapa bayar berapa.
const buildShareText = (bill) => {
  const lines = [`🧾 ${bill.title}`, `📅 ${formatDisplayDate(bill.date)}`, ""];

  bill.participants.forEach((p) => {
    lines.push(`${p.paid ? "✅" : "⬜"} ${p.name}: ${formatCurrency(p.amount)}`);
  });

  if (bill.items && bill.items.length > 0) {
    lines.push("", "Rincian Item:");
    bill.items.forEach((item) => {
      const owner =
        item.assignedTo != null && bill.participants[item.assignedTo]
          ? ` (${bill.participants[item.assignedTo].name})`
          : "";
      lines.push(`- ${item.name}${owner}: ${formatCurrency(item.price)}`);
    });
  }

  lines.push("", `Total: ${formatCurrency(bill.totalAmount)}`);
  return lines.join("\n");
};

// Bagi `total` proporsional ke tiap `weights`, tapi jumlah akhirnya selalu
// pas sama `total` (sisa pembulatan dibebanin ke yang sisa desimalnya paling
// gede dulu, bukan dibulatin ke atas semua).
const distributeProportional = (total, weights) => {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) return weights.map(() => 0);

  const raw = weights.map((w) => (total * w) / weightSum);
  const floors = raw.map(Math.floor);
  const remainder = total - floors.reduce((a, b) => a + b, 0);

  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac);

  const result = [...floors];
  for (let k = 0; k < remainder; k++) {
    result[order[k % order.length].i] += 1;
  }
  return result;
};

const emptyForm = {
  title: "",
  totalAmount: "",
  date: today(),
  splitMethod: "equal",
  participants: [
    { name: "", amount: "" },
    { name: "", amount: "" },
  ],
  items: [],
  subtotal: 0,
  serviceCharge: 0,
  tax: 0,
};

export default function SplitBillScreen({ bills, onAdd, onUpdate, onDelete, onBack }) {
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [expandedId, setExpandedId] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  const totalAmountValue = parseAmount(form.totalAmount);
  const equalShares = useMemo(() => {
    const n = form.participants.length;
    if (n === 0) return [];
    return distributeProportional(totalAmountValue, Array.from({ length: n }, () => 1));
  }, [totalAmountValue, form.participants.length]);
  const customSum = form.participants.reduce((sum, p) => sum + parseAmount(p.amount), 0);

  // Total tiap item yang udah di-assign ke masing-masing peserta, lalu sisa
  // tagihan (pajak/service/dsb) dibagi proporsional sesuai porsi item mereka.
  const itemSubtotals = useMemo(() => {
    return form.participants.map((_, pi) =>
      form.items
        .filter((it) => it.assignedTo === pi)
        .reduce((sum, it) => sum + it.price, 0)
    );
  }, [form.items, form.participants.length]);
  const byItemShares = useMemo(
    () => distributeProportional(totalAmountValue, itemSubtotals),
    [totalAmountValue, itemSubtotals]
  );
  const unassignedItemsCount = form.items.filter((it) => it.assignedTo === null).length;

  const openAddForm = () => {
    setForm(emptyForm);
    setScanError("");
    setFormVisible(true);
  };

  const closeForm = () => {
    setFormVisible(false);
    setForm(emptyForm);
    setScanError("");
  };

  const handleScanReceipt = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setScanError("Izin akses foto ditolak.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.5,
    });

    if (result.canceled || !result.assets?.[0]?.base64) return;

    setIsScanning(true);
    setScanError("");
    try {
      const asset = result.assets[0];
      const mimeType = asset.mimeType || "image/jpeg";
      const scanned = await scanReceipt(asset.base64, mimeType);
      const items = scanned.items.map((it) => ({ ...it, assignedTo: null }));
      setForm((f) => ({
        ...f,
        title: scanned.title,
        totalAmount: formatThousands(String(scanned.totalAmount)),
        items,
        subtotal: scanned.subtotal,
        serviceCharge: scanned.serviceCharge,
        tax: scanned.tax,
        splitMethod: items.length > 0 ? "byItem" : f.splitMethod,
      }));
    } catch (err) {
      setScanError(
        err.message === "QUOTA_EXCEEDED"
          ? "Kuota AI harian sudah penuh, coba lagi besok ya."
          : err.message || "Gagal scan struk."
      );
    } finally {
      setIsScanning(false);
    }
  };

  const setParticipantField = (index, key) => (value) => {
    setForm((f) => {
      const next = [...f.participants];
      next[index] = { ...next[index], [key]: value };
      return { ...f, participants: next };
    });
  };

  const addParticipantRow = () => {
    setForm((f) => ({ ...f, participants: [...f.participants, { name: "", amount: "" }] }));
  };

  const removeParticipantRow = (index) => {
    setForm((f) => {
      if (f.participants.length <= 1) return f;
      const nextItems = f.items.map((it) => {
        if (it.assignedTo === index) return { ...it, assignedTo: null };
        if (it.assignedTo != null && it.assignedTo > index) {
          return { ...it, assignedTo: it.assignedTo - 1 };
        }
        return it;
      });
      return {
        ...f,
        participants: f.participants.filter((_, i) => i !== index),
        items: nextItems,
      };
    });
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    if (!totalAmountValue) return;
    const names = form.participants.map((p) => p.name.trim()).filter(Boolean);
    if (names.length === 0) return;

    setIsSaving(true);
    try {
      const participants = form.participants
        .map((p, i) => ({
          name: p.name.trim(),
          amount:
            form.splitMethod === "equal"
              ? equalShares[i]
              : form.splitMethod === "byItem"
              ? byItemShares[i]
              : parseAmount(p.amount),
          paid: false,
        }))
        .filter((p) => p.name);

      await onAdd({
        id: generateId(),
        title: form.title.trim(),
        totalAmount: totalAmountValue,
        date: form.date,
        participants,
        items: form.splitMethod === "byItem" ? form.items : [],
      });
      closeForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = (bill) => {
    Share.share({ message: buildShareText(bill) }).catch(() => {});
  };

  const toggleParticipantPaid = async (bill, index) => {
    const nextParticipants = bill.participants.map((p, i) =>
      i === index ? { ...p, paid: !p.paid } : p
    );
    await onUpdate({ ...bill, participants: nextParticipants });
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Split Bill</Text>
          <Text style={styles.subtitle}>Patungan bareng temen, catat siapa udah bayar.</Text>
        </View>
        <Pressable style={styles.addButton} onPress={openAddForm}>
          <Text style={styles.addButtonText}>+ Tambah</Text>
        </Pressable>
      </View>

      {bills.length === 0 ? (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyText}>
            Belum ada patungan. Tap "+ Tambah" untuk bikin split bill pertamamu.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {bills.map((bill) => {
            const expanded = expandedId === bill.id;
            const unpaidCount = bill.participants.filter((p) => !p.paid).length;

            return (
              <View key={bill.id} style={styles.billCard}>
                <Pressable
                  style={styles.billHeader}
                  onPress={() => setExpandedId(expanded ? "" : bill.id)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.billTitle} numberOfLines={1}>{bill.title}</Text>
                    <Text style={styles.billMeta}>
                      {formatDisplayDate(bill.date)} · {bill.participants.length} orang ·{" "}
                      {unpaidCount === 0 ? "Semua lunas" : `${unpaidCount} belum lunas`}
                    </Text>
                  </View>
                  <Text style={styles.billTotal}>{formatCurrency(bill.totalAmount)}</Text>
                </Pressable>

                {expanded ? (
                  <View style={styles.participantList}>
                    {bill.participants.map((p, i) => (
                      <View key={`${p.name}-${i}`} style={styles.participantRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.participantName}>{p.name}</Text>
                          <Text style={styles.participantAmount}>{formatCurrency(p.amount)}</Text>
                        </View>
                        <Pressable
                          style={[styles.paidBadge, p.paid && styles.paidBadgeActive]}
                          onPress={() => toggleParticipantPaid(bill, i)}
                        >
                          <Text style={[styles.paidBadgeText, p.paid && styles.paidBadgeTextActive]}>
                            {p.paid ? "✓ Lunas" : "Belum"}
                          </Text>
                        </Pressable>
                      </View>
                    ))}

                    {bill.items && bill.items.length > 0 ? (
                      <View style={styles.savedItemsBox}>
                        <Text style={styles.savedItemsTitle}>Rincian Item</Text>
                        {bill.items.map((item, ii) => (
                          <View key={ii} style={styles.savedItemRow}>
                            <Text style={styles.savedItemName} numberOfLines={1}>
                              {item.name}
                              {item.assignedTo != null && bill.participants[item.assignedTo]
                                ? ` (${bill.participants[item.assignedTo].name})`
                                : ""}
                            </Text>
                            <Text style={styles.savedItemPrice}>{formatCurrency(item.price)}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <Pressable style={styles.shareBillButton} onPress={() => handleShare(bill)}>
                      <Text style={styles.shareBillButtonText}>📤 Share Ringkasan</Text>
                    </Pressable>

                    <Pressable style={styles.deleteBillButton} onPress={() => onDelete(bill.id)}>
                      <Text style={styles.deleteBillButtonText}>Hapus Split Bill</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}

      <Modal visible={formVisible} animationType="slide" transparent onRequestClose={closeForm}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.sheet}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>Split Bill Baru</Text>

                <Pressable
                  style={[styles.scanButton, isScanning && styles.disabled]}
                  onPress={handleScanReceipt}
                  disabled={isScanning}
                >
                  {isScanning ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.scanButtonText}>📷 Scan Struk (Isi Otomatis)</Text>
                  )}
                </Pressable>
                {scanError ? <Text style={styles.scanErrorText}>{scanError}</Text> : null}

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Judul</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Makan Malam Reuni"
                    placeholderTextColor="#94a3b8"
                    value={form.title}
                    onChangeText={(v) => setForm((f) => ({ ...f, title: v }))}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Total Tagihan (Rp)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="500000"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={form.totalAmount}
                    onChangeText={(v) => setForm((f) => ({ ...f, totalAmount: formatThousands(v) }))}
                  />
                </View>

                {form.subtotal || form.serviceCharge || form.tax ? (
                  <View style={styles.receiptBreakdown}>
                    {form.subtotal ? (
                      <View style={styles.receiptBreakdownRow}>
                        <Text style={styles.receiptBreakdownLabel}>Subtotal</Text>
                        <Text style={styles.receiptBreakdownValue}>{formatCurrency(form.subtotal)}</Text>
                      </View>
                    ) : null}
                    {form.serviceCharge ? (
                      <View style={styles.receiptBreakdownRow}>
                        <Text style={styles.receiptBreakdownLabel}>Service Charge</Text>
                        <Text style={styles.receiptBreakdownValue}>{formatCurrency(form.serviceCharge)}</Text>
                      </View>
                    ) : null}
                    {form.tax ? (
                      <View style={styles.receiptBreakdownRow}>
                        <Text style={styles.receiptBreakdownLabel}>Pajak</Text>
                        <Text style={styles.receiptBreakdownValue}>{formatCurrency(form.tax)}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.receiptBreakdownHint}>
                      Hasil scan -- dobel cek ke struk aslinya, service/pajak udah kefaktorin proporsional ke tiap orang.
                    </Text>
                  </View>
                ) : null}

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Tanggal (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    value={form.date}
                    onChangeText={(v) => setForm((f) => ({ ...f, date: v }))}
                  />
                </View>

                <View style={styles.typeToggle}>
                  <Pressable
                    style={[
                      styles.typeToggleButton,
                      form.splitMethod === "equal" && styles.typeToggleButtonActive,
                    ]}
                    onPress={() => setForm((f) => ({ ...f, splitMethod: "equal" }))}
                  >
                    <Text
                      style={[
                        styles.typeToggleText,
                        form.splitMethod === "equal" && styles.typeToggleTextActive,
                      ]}
                    >
                      Rata
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.typeToggleButton,
                      form.splitMethod === "custom" && styles.typeToggleButtonActive,
                    ]}
                    onPress={() => setForm((f) => ({ ...f, splitMethod: "custom" }))}
                  >
                    <Text
                      style={[
                        styles.typeToggleText,
                        form.splitMethod === "custom" && styles.typeToggleTextActive,
                      ]}
                    >
                      Custom
                    </Text>
                  </Pressable>
                  {form.items.length > 0 ? (
                    <Pressable
                      style={[
                        styles.typeToggleButton,
                        form.splitMethod === "byItem" && styles.typeToggleButtonActive,
                      ]}
                      onPress={() => setForm((f) => ({ ...f, splitMethod: "byItem" }))}
                    >
                      <Text
                        style={[
                          styles.typeToggleText,
                          form.splitMethod === "byItem" && styles.typeToggleTextActive,
                        ]}
                      >
                        Per Item
                      </Text>
                    </Pressable>
                  ) : null}
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Peserta</Text>
                  {form.participants.map((p, i) => (
                    <View key={i} style={styles.participantInputRow}>
                      <TextInput
                        style={[styles.input, { flex: 1 }]}
                        placeholder={`Nama ${i + 1}`}
                        placeholderTextColor="#94a3b8"
                        value={p.name}
                        onChangeText={setParticipantField(i, "name")}
                      />
                      {form.splitMethod === "custom" ? (
                        <TextInput
                          style={[styles.input, { width: 110 }]}
                          placeholder="Rp"
                          placeholderTextColor="#94a3b8"
                          keyboardType="numeric"
                          value={p.amount}
                          onChangeText={(v) =>
                            setParticipantField(i, "amount")(formatThousands(v))
                          }
                        />
                      ) : (
                        <View style={[styles.input, styles.equalShareBox]}>
                          <Text style={styles.equalShareText}>
                            {formatCurrency(
                              (form.splitMethod === "byItem" ? byItemShares : equalShares)[i] || 0
                            )}
                          </Text>
                        </View>
                      )}
                      <Pressable
                        style={styles.removeRowButton}
                        onPress={() => removeParticipantRow(i)}
                      >
                        <Text style={styles.removeRowButtonText}>✕</Text>
                      </Pressable>
                    </View>
                  ))}

                  <Pressable style={styles.addRowButton} onPress={addParticipantRow}>
                    <Text style={styles.addRowButtonText}>+ Tambah Peserta</Text>
                  </Pressable>

                  {form.splitMethod === "custom" && totalAmountValue > 0 ? (
                    <Text
                      style={[
                        styles.splitHint,
                        customSum !== totalAmountValue && styles.splitHintWarn,
                      ]}
                    >
                      Total dialokasikan {formatCurrency(customSum)} dari {formatCurrency(totalAmountValue)}
                    </Text>
                  ) : null}
                </View>

                {form.splitMethod === "byItem" ? (
                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>
                      Rincian Item -- tap nama buat assign
                      {unassignedItemsCount > 0 ? ` (${unassignedItemsCount} belum dibagi)` : ""}
                    </Text>
                    {form.items.map((item, ii) => (
                      <View key={ii} style={styles.itemRow}>
                        <View style={styles.itemHeaderRow}>
                          <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.itemPrice}>{formatCurrency(item.price)}</Text>
                        </View>
                        <View style={styles.itemChipRow}>
                          {form.participants.map((p, pi) => {
                            if (!p.name.trim()) return null;
                            const active = item.assignedTo === pi;
                            return (
                              <Pressable
                                key={pi}
                                style={[styles.itemChip, active && styles.itemChipActive]}
                                onPress={() =>
                                  setForm((f) => {
                                    const nextItems = [...f.items];
                                    nextItems[ii] = {
                                      ...nextItems[ii],
                                      assignedTo: active ? null : pi,
                                    };
                                    return { ...f, items: nextItems };
                                  })
                                }
                              >
                                <Text style={[styles.itemChipText, active && styles.itemChipTextActive]}>
                                  {p.name.trim()}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}

                <Pressable
                  style={[styles.saveButton, isSaving && styles.disabled]}
                  onPress={handleSubmit}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.saveButtonText}>Simpan Split Bill</Text>
                  )}
                </Pressable>

                <Pressable style={styles.cancelButton} onPress={closeForm}>
                  <Text style={styles.cancelButtonText}>Batal</Text>
                </Pressable>
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
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
  addButton: { backgroundColor: "#0f172a", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  addButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  emptyPanel: { backgroundColor: "#ffffff", borderRadius: 16, padding: 24, alignItems: "center" },
  emptyText: { color: "#64748b", fontSize: 13, fontWeight: "600", textAlign: "center" },
  list: { gap: 12 },
  billCard: { backgroundColor: "#ffffff", borderRadius: 20, padding: 16 },
  billHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  billTitle: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  billMeta: { color: "#94a3b8", fontSize: 11, fontWeight: "600", marginTop: 3 },
  billTotal: { color: "#0f172a", fontSize: 14, fontWeight: "900" },
  participantList: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: "#f1f5f9", gap: 8 },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f4f7fb",
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  participantName: { color: "#0f172a", fontSize: 13, fontWeight: "800" },
  participantAmount: { color: "#64748b", fontSize: 12, fontWeight: "700", marginTop: 2 },
  paidBadge: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  paidBadgeActive: { backgroundColor: "#dcfce7", borderColor: "#bbf7d0" },
  paidBadgeText: { color: "#64748b", fontSize: 11, fontWeight: "800" },
  paidBadgeTextActive: { color: "#15803d" },
  shareBillButton: {
    alignItems: "center",
    backgroundColor: "#f4f7fb",
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  shareBillButtonText: { color: "#0f172a", fontSize: 12, fontWeight: "800" },
  deleteBillButton: { alignItems: "center", paddingVertical: 10, marginTop: 4 },
  deleteBillButtonText: { color: "#be123c", fontSize: 12, fontWeight: "800" },
  backdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.55)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    maxHeight: "88%",
  },
  sheetTitle: { color: "#0f172a", fontSize: 20, fontWeight: "900", marginBottom: 16 },
  scanButton: {
    alignItems: "center",
    backgroundColor: "#8b5cf6",
    borderRadius: 14,
    justifyContent: "center",
    marginBottom: 12,
    paddingVertical: 14,
  },
  scanButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  scanErrorText: { color: "#e11d48", fontSize: 12, fontWeight: "700", marginBottom: 12, textAlign: "center" },
  receiptBreakdown: {
    backgroundColor: "#f4f7fb",
    borderRadius: 12,
    padding: 12,
    marginTop: -8,
    marginBottom: 16,
    gap: 4,
  },
  receiptBreakdownRow: { flexDirection: "row", justifyContent: "space-between" },
  receiptBreakdownLabel: { color: "#64748b", fontSize: 12, fontWeight: "700" },
  receiptBreakdownValue: { color: "#0f172a", fontSize: 12, fontWeight: "800" },
  receiptBreakdownHint: { color: "#94a3b8", fontSize: 10, fontWeight: "600", marginTop: 4 },
  inputGroup: { gap: 8, marginBottom: 16 },
  label: { color: "#64748b", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  input: {
    backgroundColor: "#f4f7fb",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 12,
    color: "#0f172a",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  typeToggle: {
    flexDirection: "row",
    backgroundColor: "#f4f7fb",
    borderRadius: 14,
    padding: 4,
    gap: 4,
    marginBottom: 16,
  },
  typeToggleButton: { flex: 1, alignItems: "center", borderRadius: 10, paddingVertical: 10 },
  typeToggleButtonActive: { backgroundColor: "#0f172a" },
  typeToggleText: { color: "#64748b", fontSize: 13, fontWeight: "800" },
  typeToggleTextActive: { color: "#ffffff" },
  participantInputRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  equalShareBox: { alignItems: "center", justifyContent: "center", width: 110 },
  equalShareText: { color: "#0f172a", fontSize: 12, fontWeight: "800" },
  removeRowButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#fecdd3",
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
  },
  removeRowButtonText: { color: "#be123c", fontSize: 13, fontWeight: "900" },
  addRowButton: { alignItems: "center", paddingVertical: 8 },
  addRowButtonText: { color: "#334155", fontSize: 12, fontWeight: "800" },
  splitHint: { color: "#64748b", fontSize: 11, fontWeight: "700", marginTop: 4 },
  splitHintWarn: { color: "#e11d48" },
  itemRow: { backgroundColor: "#f4f7fb", borderRadius: 12, padding: 10, marginBottom: 8 },
  itemHeaderRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  itemName: { color: "#0f172a", fontSize: 13, fontWeight: "800", flex: 1 },
  itemPrice: { color: "#0f172a", fontSize: 13, fontWeight: "800" },
  itemChipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  itemChip: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  itemChipActive: { backgroundColor: "#0f172a", borderColor: "#0f172a" },
  itemChipText: { color: "#64748b", fontSize: 11, fontWeight: "700" },
  itemChipTextActive: { color: "#ffffff" },
  savedItemsBox: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    gap: 6,
  },
  savedItemsTitle: { color: "#94a3b8", fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  savedItemRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  savedItemName: { color: "#334155", fontSize: 12, fontWeight: "700", flex: 1 },
  savedItemPrice: { color: "#64748b", fontSize: 12, fontWeight: "700" },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#ec4899",
    borderRadius: 14,
    justifyContent: "center",
    paddingVertical: 15,
  },
  saveButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  cancelButton: { alignItems: "center", justifyContent: "center", marginTop: 10, paddingVertical: 12 },
  cancelButtonText: { color: "#64748b", fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.6 },
});
