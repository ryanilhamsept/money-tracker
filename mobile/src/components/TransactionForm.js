import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Switch,
} from "react-native";
import { formatCurrency, formatThousands, parseAmount } from "../utils/formatters";
import { categories, incomeCategories, fundSources, danaDipakaiOptions } from "../constants/options";
import Dropdown from "./Dropdown";
import { colors } from "../theme";

const todayISO = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  type: "expense",
  title: "",
  amount: "",
  category: categories[0],
  source: fundSources[0],
  danaDipakai: danaDipakaiOptions[0],
  date: todayISO(),
  time: "",
};

// Ketik angka polos (misal "1430") otomatis jadi "14:30".
const formatTime = (value) => {
  const raw = String(value || "").replace(/[^\d]/g, "").slice(0, 4);
  if (raw.length <= 2) return raw;
  return `${raw.slice(0, 2)}:${raw.slice(2)}`;
};

function DropdownPicker({ label, options, value, onChange }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <Dropdown
        value={value}
        onChange={onChange}
        options={options.map((option) => ({ label: option, value: option }))}
      />
    </View>
  );
}

export default function TransactionForm({ visible, initial, onClose, onSubmit, onDelete }) {
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  
  const [wantsInstallment, setWantsInstallment] = useState(false);
  const [totalLoan, setTotalLoan] = useState("");
  const [remainingTerm, setRemainingTerm] = useState("");
  const [provider, setProvider] = useState("");
  const [dueDate, setDueDate] = useState("");

  const isEdit = Boolean(initial);

  useEffect(() => {
    if (visible) {
      if (initial) {
        setForm({
          type: initial.type === "income" ? "income" : "expense",
          title: initial.title || "",
          amount: formatThousands(initial.amount),
          category:
            initial.category ||
            (initial.type === "income" ? incomeCategories[0] : categories[0]),
          source: initial.source || fundSources[0],
          danaDipakai: initial.danaDipakai || danaDipakaiOptions[0],
          date: initial.date || todayISO(),
          time: initial.time || "",
        });
        setErrorMessage("");
        setWantsInstallment(Boolean(initial.installmentTotalLoan));
        setTotalLoan(initial.installmentTotalLoan ? formatThousands(String(initial.installmentTotalLoan)) : "");
        setRemainingTerm(initial.installmentRemainingTerm ? String(initial.installmentRemainingTerm) : "");
        setProvider(initial.installmentProvider || "");
        setDueDate(initial.installmentDueDate ? String(initial.installmentDueDate) : "");
      } else {
        setForm(emptyForm);
        setWantsInstallment(false);
        setTotalLoan("");
        setRemainingTerm("");
        setProvider("");
        setDueDate("");
      }
    }
  }, [visible, initial]);

  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const setType = (type) => {
    setForm((f) => ({
      ...f,
      type,
      category: type === "income" ? incomeCategories[0] : categories[0],
    }));
  };

  const recalcInstallmentAmount = (loanVal, termVal) => {
    const totalLoanNum = parseAmount(loanVal);
    const termNum = Number(String(termVal || "").replace(/[^\d]/g, ""));
    if (totalLoanNum > 0 && termNum > 0) {
      setForm((f) => ({ ...f, amount: formatThousands(String(Math.ceil(totalLoanNum / termNum))) }));
    }
  };

  const handleTotalLoanChange = (v) => {
    const formatted = formatThousands(v);
    setTotalLoan(formatted);
    recalcInstallmentAmount(formatted, remainingTerm);
  };

  const handleRemainingTermChange = (v) => {
    const digitsOnly = String(v || "").replace(/[^\d]/g, "");
    setRemainingTerm(digitsOnly);
    recalcInstallmentAmount(totalLoan, digitsOnly);
  };

  const handleSubmit = async ({ allowDuplicate = false } = {}) => {
    const amount = parseAmount(form.amount);

    if (!form.title.trim()) {
      setErrorMessage("Judul wajib diisi.");
      return;
    }
    if (!amount) {
      setErrorMessage("Nominal wajib diisi.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) {
      setErrorMessage("Tanggal harus format YYYY-MM-DD.");
      return;
    }
    if (form.time && !/^\d{2}:\d{2}$/.test(form.time)) {
      setErrorMessage("Waktu harus format HH:mm.");
      return;
    }
    if (wantsInstallment) {
        if (!totalLoan) {
            setErrorMessage("Total Harga Barang wajib diisi untuk cicilan.");
            return;
        }
        if (!isEdit && !remainingTerm) {
            setErrorMessage("Tenor cicilan wajib diisi.");
            return;
        }
        if (isEdit && !initial.installmentTotalLoan && !remainingTerm) {
            setErrorMessage("Sisa tenor wajib diisi untuk mengubah ke cicilan.");
            return;
        }
    }

    setErrorMessage("");
    setIsSaving(true);
    try {
      const result = await onSubmit({
        ...form,
        title: form.title.trim(),
        amount,
        danaDipakai: form.type === "income" ? "" : form.danaDipakai,
      }, wantsInstallment, {
          totalLoan: parseAmount(totalLoan),
          remainingTerm: remainingTerm,
          provider: provider,
          dueDate: dueDate,
      }, { allowDuplicate });

      // Transaksi serupa ketahuan: belum ada yang disimpan, keputusannya
      // dibalikin ke yang ngisi -- dua Grab identik dalam sehari itu wajar.
      if (result && result.reason === "duplicate") {
        setDuplicateWarning(result.duplicateOf);
        return;
      }
      setDuplicateWarning(null);
    } catch (err) {
      setErrorMessage(err.message || "Gagal menyimpan transaksi.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsSaving(true);
    setErrorMessage("");
    try {
      await onDelete();
    } catch (err) {
      setErrorMessage(err.message || "Gagal menghapus transaksi.");
      setIsSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.sheetWrap}
        >
          <View style={styles.sheet}>
            <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
              <Text style={styles.title}>
                {isEdit ? "Edit Transaksi" : "Tambah Transaksi"}
              </Text>

              <View style={styles.typeToggle}>
                <Pressable
                  style={[
                    styles.typeToggleButton,
                    form.type === "expense" && styles.typeToggleButtonActiveExpense,
                  ]}
                  onPress={() => setType("expense")}
                >
                  <Text
                    style={[
                      styles.typeToggleText,
                      form.type === "expense" && styles.typeToggleTextActive,
                    ]}
                  >
                    Pengeluaran
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.typeToggleButton,
                    form.type === "income" && styles.typeToggleButtonActiveIncome,
                  ]}
                  onPress={() => setType("income")}
                >
                  <Text
                    style={[
                      styles.typeToggleText,
                      form.type === "income" && styles.typeToggleTextActive,
                    ]}
                  >
                    Pemasukan
                  </Text>
                </Pressable>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Judul</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Misal: Makan Siang"
                  placeholderTextColor="#94a3b8"
                  value={form.title}
                  onChangeText={setField("title")}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nominal (Rp)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={form.amount}
                  onChangeText={(v) => setField("amount")(formatThousands(v))}
                />
              </View>

              <View style={styles.rowGroup}>
                <View style={[styles.inputGroup, { flex: 1 }]}>
                  <Text style={styles.label}>Tanggal (YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="2026-08-17"
                    placeholderTextColor="#94a3b8"
                    value={form.date}
                    onChangeText={setField("date")}
                  />
                </View>
                <View style={[styles.inputGroup, { width: 100 }]}>
                  <Text style={styles.label}>Waktu</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="14:30"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={form.time}
                    onChangeText={(v) => setField("time")(formatTime(v))}
                  />
                </View>
              </View>

              <DropdownPicker
                label="Kategori"
                options={form.type === "income" ? incomeCategories : categories}
                value={form.category}
                onChange={setField("category")}
              />
              <DropdownPicker
                label={form.type === "income" ? "Masuk Ke" : "Sumber Dana"}
                options={fundSources}
                value={form.source}
                onChange={setField("source")}
              />
              {form.type === "expense" ? (
                <>
                  <DropdownPicker
                    label="Dana Dipakai"
                    options={danaDipakaiOptions}
                    value={form.danaDipakai}
                    onChange={setField("danaDipakai")}
                  />
                  
                  {form.danaDipakai === "Spend CC" && (
                    <>
                      <View style={styles.installmentToggleRow}>
                        <Text style={styles.installmentToggleLabel}>Ini cicilan?</Text>
                        <Switch
                            value={wantsInstallment}
                            onValueChange={setWantsInstallment}
                            trackColor={{ false: "#e2e8f0", true: "#ec4899" }}
                            disabled={isEdit && Boolean(initial?.installmentTotalLoan)}
                        />
                      </View>
                      
                      {wantsInstallment && (
                        <View style={styles.installmentCard}>
                            <Text style={styles.installmentInfoText}>
                              Amount di atas dicatat sebagai cicilan bulanan.
                            </Text>
                            <View style={styles.inputGroup}>
                              <TextInput
                                style={styles.input}
                                placeholder="Provider (opsional)"
                                placeholderTextColor="#94a3b8"
                                value={provider}
                                onChangeText={setProvider}
                              />
                            </View>
                            <View style={styles.inputGroup}>
                              <TextInput
                                style={styles.input}
                                placeholder="Total Harga Barang (Rp)"
                                placeholderTextColor="#94a3b8"
                                keyboardType="numeric"
                                value={totalLoan}
                                onChangeText={handleTotalLoanChange}
                                editable={!(isEdit && Boolean(initial?.installmentTotalLoan))}
                              />
                            </View>
                            {!(isEdit && Boolean(initial?.installmentTotalLoan)) && (
                                <View style={styles.installmentRow}>
                                    <View style={[styles.inputGroup, { flex: 1 }]}>
                                        <TextInput
                                          style={styles.input}
                                          placeholder="Sisa Tenor (Bulan)"
                                          placeholderTextColor="#94a3b8"
                                          keyboardType="numeric"
                                          value={remainingTerm}
                                          onChangeText={handleRemainingTermChange}
                                        />
                                    </View>
                                    <View style={[styles.inputGroup, { flex: 1 }]}>
                                        <TextInput
                                          style={styles.input}
                                          placeholder="Tgl Jatuh Tempo"
                                          placeholderTextColor="#94a3b8"
                                          keyboardType="numeric"
                                          value={dueDate}
                                          onChangeText={(v) => setDueDate(v.replace(/[^\d]/g, "").slice(0, 2))}
                                        />
                                    </View>
                                </View>
                            )}
                        </View>
                      )}
                    </>
                  )}
                </>
              ) : null}

              {errorMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              {duplicateWarning ? (
                <View style={styles.duplicateBox}>
                  <Text style={styles.duplicateTitle}>Transaksi serupa sudah ada</Text>
                  <Text style={styles.duplicateDetail}>
                    {duplicateWarning.title}
                    {" \u2022 "}
                    {formatCurrency(duplicateWarning.amount)}
                    {" \u2022 "}
                    {duplicateWarning.date}
                    {duplicateWarning.time ? ` ${duplicateWarning.time}` : ""}
                    {" \u2022 "}
                    {duplicateWarning.source}
                  </Text>
                  <Text style={styles.duplicateHint}>
                    Kalau ini memang pembelian yang berbeda, tetap simpan.
                  </Text>
                  <View style={styles.duplicateActions}>
                    <Pressable
                      style={[styles.duplicateKeep, isSaving && styles.disabled]}
                      onPress={() => handleSubmit({ allowDuplicate: true })}
                      disabled={isSaving}
                    >
                      <Text style={styles.duplicateKeepText}>Tetap simpan</Text>
                    </Pressable>
                    <Pressable
                      style={styles.duplicateCancel}
                      onPress={() => setDuplicateWarning(null)}
                      disabled={isSaving}
                    >
                      <Text style={styles.duplicateCancelText}>Batal</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <Pressable
                style={[styles.saveButton, isSaving && styles.disabled]}
                onPress={() => handleSubmit()}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {isEdit ? "Simpan Perubahan" : "Tambah Transaksi"}
                  </Text>
                )}
              </Pressable>

              {isEdit && onDelete ? (
                <Pressable
                  style={[styles.deleteButton, isSaving && styles.disabled]}
                  onPress={handleDelete}
                  disabled={isSaving}
                >
                  <Text style={styles.deleteButtonText}>Hapus Transaksi</Text>
                </Pressable>
              ) : null}

              <Pressable style={styles.cancelButton} onPress={onClose} disabled={isSaving}>
                <Text style={styles.cancelButtonText}>Batal</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    justifyContent: "flex-end",
  },
  sheetWrap: {
    maxHeight: "88%",
    flexShrink: 1,
  },
  sheet: {
    backgroundColor: "#083c5a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    flexShrink: 1,
  },
  title: {
    color: "#e8f3fb",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 16,
  },
  typeToggle: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 16,
    padding: 4,
    gap: 4,
    marginBottom: 18,
  },
  typeToggleButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 12,
    paddingVertical: 10,
  },
  typeToggleButtonActiveExpense: {
    backgroundColor: "#0ea5e9",
  },
  typeToggleButtonActiveIncome: {
    backgroundColor: "#10b981",
  },
  typeToggleText: {
    color: "#9cbed4",
    fontSize: 13,
    fontWeight: "800",
  },
  typeToggleTextActive: {
    color: "#ffffff",
  },
  rowGroup: {
    flexDirection: "row",
    gap: 12,
  },
  installmentInfoText: {
    fontSize: 12,
    color: "#9cbed4",
    marginBottom: 12,
    fontWeight: "500",
  },
  installmentRow: {
    flexDirection: "row",
    gap: 12,
  },
  inputGroup: {
    gap: 8,
    marginBottom: 16,
  },
  label: {
    color: "#9cbed4",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderColor: "#0f5479",
    borderRadius: 16,
    borderWidth: 1,
    color: "#e8f3fb",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  duplicateBox: {
    backgroundColor: "rgba(251,191,36,0.12)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.24)",
    marginBottom: 12,
    padding: 12,
  },
  duplicateTitle: {
    color: "#fcd34d",
    fontSize: 13,
    fontWeight: "800",
  },
  duplicateDetail: {
    color: "#fcd34d",
    fontSize: 13,
    marginTop: 6,
  },
  duplicateHint: {
    color: "#fcd34d",
    fontSize: 11,
    marginTop: 6,
  },
  duplicateActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  duplicateKeep: {
    alignItems: "center",
    backgroundColor: "#d97706",
    borderRadius: 16,
    flex: 1,
    paddingVertical: 10,
  },
  duplicateKeepText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  duplicateCancel: {
    alignItems: "center",
    backgroundColor: "#083c5a",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(251,191,36,0.28)",
    flex: 1,
    paddingVertical: 10,
  },
  duplicateCancelText: {
    color: "#fcd34d",
    fontSize: 13,
    fontWeight: "800",
  },
  errorBox: {
    backgroundColor: "rgba(251,113,133,0.16)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.22)",
    marginBottom: 12,
    padding: 12,
  },
  errorText: {
    color: "#fda4af",
    fontSize: 13,
    fontWeight: "700",
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#0ea5e9",
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 4,
    paddingVertical: 15,
  },
  saveButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  deleteButton: {
    alignItems: "center",
    backgroundColor: "rgba(251,113,133,0.16)",
    borderColor: "rgba(251,113,133,0.22)",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 10,
    paddingVertical: 15,
  },
  deleteButtonText: {
    color: "#fda4af",
    fontSize: 15,
    fontWeight: "800",
  },
  cancelButton: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: "#9cbed4",
    fontSize: 14,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.6,
  },
  installmentToggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  installmentToggleLabel: {
    color: "#e8f3fb",
    fontSize: 15,
    fontWeight: "700",
  },
  installmentCard: {
    backgroundColor: "rgba(251,113,133,0.12)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(251,113,133,0.22)",
    padding: 16,
    marginBottom: 16,
  },
});
