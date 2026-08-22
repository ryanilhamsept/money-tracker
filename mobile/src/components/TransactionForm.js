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
} from "react-native";
import { categories, fundSources, danaDipakaiOptions } from "../constants/options";
import Dropdown from "./Dropdown";

const todayISO = () => new Date().toISOString().slice(0, 10);

// Format tampilan sambil ngetik: titik = pemisah ribuan, koma = pemisah desimal (sen).
// Bagian desimal dibiarin apa adanya dulu (belum dibulatin) selagi masih diketik.
const formatThousands = (value) => {
  const raw = String(value || "");
  const commaIndex = raw.indexOf(",");
  const intRaw = (commaIndex === -1 ? raw : raw.slice(0, commaIndex)).replace(/[^\d]/g, "");
  const formattedInt = intRaw ? new Intl.NumberFormat("id-ID").format(Number(intRaw)) : "";

  if (commaIndex === -1) return formattedInt;

  const decRaw = raw.slice(commaIndex + 1).replace(/[^\d]/g, "").slice(0, 2);
  return `${formattedInt || "0"},${decRaw}`;
};

// Buat nilai final yang disimpan: gabung bagian bulat + desimal, lalu dibulatin ke atas
// (Rupiah nggak punya pecahan yang beredar, jadi sen dibulatin bukan dibuang).
const parseAmountRounded = (value) => {
  const raw = String(value || "");
  const commaIndex = raw.indexOf(",");
  const intRaw = (commaIndex === -1 ? raw : raw.slice(0, commaIndex)).replace(/[^\d]/g, "");
  const decRaw = commaIndex === -1 ? "" : raw.slice(commaIndex + 1).replace(/[^\d]/g, "");

  if (!intRaw && !decRaw) return 0;

  const numeric = Number(`${intRaw || "0"}.${decRaw || "0"}`);
  return Math.ceil(numeric);
};

const emptyForm = {
  title: "",
  amount: "",
  category: categories[0],
  source: fundSources[0],
  danaDipakai: danaDipakaiOptions[0],
  date: todayISO(),
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

  const isEdit = Boolean(initial);

  useEffect(() => {
    if (visible) {
      setForm(
        initial
          ? {
              title: initial.title || "",
              amount: formatThousands(initial.amount),
              category: initial.category || categories[0],
              source: initial.source || fundSources[0],
              danaDipakai: initial.danaDipakai || danaDipakaiOptions[0],
              date: initial.date || todayISO(),
            }
          : emptyForm
      );
      setErrorMessage("");
    }
  }, [visible, initial]);

  const setField = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async () => {
    const amount = parseAmountRounded(form.amount);

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

    setErrorMessage("");
    setIsSaving(true);
    try {
      await onSubmit({
        ...form,
        title: form.title.trim(),
        amount,
      });
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
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>
                {isEdit ? "Edit Transaksi" : "Tambah Transaksi"}
              </Text>

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

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Tanggal (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2026-08-17"
                  placeholderTextColor="#94a3b8"
                  value={form.date}
                  onChangeText={setField("date")}
                />
              </View>

              <DropdownPicker
                label="Kategori"
                options={categories}
                value={form.category}
                onChange={setField("category")}
              />
              <DropdownPicker
                label="Sumber Dana"
                options={fundSources}
                value={form.source}
                onChange={setField("source")}
              />
              <DropdownPicker
                label="Dana Dipakai"
                options={danaDipakaiOptions}
                value={form.danaDipakai}
                onChange={setField("danaDipakai")}
              />

              {errorMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
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
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
  },
  title: {
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 16,
  },
  inputGroup: {
    gap: 8,
    marginBottom: 16,
  },
  label: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: "#f4f7fb",
    borderColor: "#e2e8f0",
    borderRadius: 12,
    borderWidth: 1,
    color: "#0f172a",
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorBox: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    padding: 12,
  },
  errorText: {
    color: "#be123c",
    fontSize: 13,
    fontWeight: "700",
  },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#ec4899",
    borderRadius: 14,
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
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 10,
    paddingVertical: 15,
  },
  deleteButtonText: {
    color: "#be123c",
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
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.6,
  },
});
