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
} from "react-native";
import { formatCurrency } from "../utils/formatters";
import Dropdown from "./Dropdown";

const ACCOUNT_TYPES = ["Bank", "Tabungan", "E-Wallet", "Kartu Kredit", "Tunai"];

const generateId = () =>
  `acc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

// Format tampilan sambil ngetik: titik = pemisah ribuan, koma = pemisah desimal (sen).
const formatThousands = (value) => {
  const raw = String(value || "");
  const commaIndex = raw.indexOf(",");
  const intRaw = (commaIndex === -1 ? raw : raw.slice(0, commaIndex)).replace(/[^\d]/g, "");
  const formattedInt = intRaw ? new Intl.NumberFormat("id-ID").format(Number(intRaw)) : "";

  if (commaIndex === -1) return formattedInt;

  const decRaw = raw.slice(commaIndex + 1).replace(/[^\d]/g, "").slice(0, 2);
  return `${formattedInt || "0"},${decRaw}`;
};

// Nilai final: gabung bulat + desimal, dibulatin ke atas (Rupiah nggak ada sen beredar).
const parseAmountRounded = (value) => {
  const raw = String(value || "");
  const commaIndex = raw.indexOf(",");
  const intRaw = (commaIndex === -1 ? raw : raw.slice(0, commaIndex)).replace(/[^\d]/g, "");
  const decRaw = commaIndex === -1 ? "" : raw.slice(commaIndex + 1).replace(/[^\d]/g, "");

  if (!intRaw && !decRaw) return 0;

  return Math.ceil(Number(`${intRaw || "0"}.${decRaw || "0"}`));
};

export default function AccountsScreen({ accounts, onAdd, onDelete, onUpdateBalance }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBalanceVal, setEditBalanceVal] = useState("");
  const [newAccount, setNewAccount] = useState({ name: "", type: "Bank", startingBalance: "" });
  const [isSaving, setIsSaving] = useState(false);

  const totalBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + (Number(a.startingBalance) || 0), 0),
    [accounts]
  );

  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [accounts, searchQuery]);

  const handleAddSubmit = async () => {
    if (!newAccount.name.trim()) return;
    setIsSaving(true);
    try {
      await onAdd({
        id: generateId(),
        name: newAccount.name.trim(),
        type: newAccount.type,
        startingBalance: parseAmountRounded(newAccount.startingBalance),
      });
      setNewAccount({ name: "", type: "Bank", startingBalance: "" });
      setShowAddModal(false);
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (account) => {
    setEditingId(account.id);
    setEditBalanceVal(formatThousands(account.startingBalance));
  };

  const saveEdit = async (id) => {
    const parsed = parseAmountRounded(editBalanceVal);
    setIsSaving(true);
    try {
      await onUpdateBalance(id, parsed);
      setEditingId(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Akun</Text>

      <View style={styles.totalPanel}>
        <Text style={styles.totalLabel}>Total Saldo Akun</Text>
        <Text style={styles.totalValue}>{formatCurrency(totalBalance)}</Text>
        <Text style={styles.totalMeta}>{accounts.length} Akun Terdaftar</Text>
      </View>

      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Akun Saya</Text>
        <Pressable
          onPress={() => setShowAddModal(true)}
          style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        >
          <Text style={styles.addButtonText}>+ Tambah</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Cari akun..."
        placeholderTextColor="#94a3b8"
        value={searchQuery}
        onChangeText={setSearchQuery}
      />

      <View style={styles.list}>
        {filteredAccounts.length === 0 ? (
          <Text style={styles.emptyText}>
            Tidak ada akun ditemukan. Tap "+ Tambah" untuk menambahkan akun baru.
          </Text>
        ) : (
          filteredAccounts.map((account) => {
            const isEditing = editingId === account.id;
            return (
              <View key={account.id} style={styles.accountCard}>
                <View style={styles.accountInfo}>
                  <Text style={styles.accountName}>{account.name}</Text>
                  <Text style={styles.accountType}>{account.type} · IDR</Text>
                </View>

                {isEditing ? (
                  <View style={styles.editRow}>
                    <TextInput
                      style={styles.editInput}
                      keyboardType="numeric"
                      value={editBalanceVal}
                      onChangeText={(v) => setEditBalanceVal(formatThousands(v))}
                      autoFocus
                    />
                    <Pressable
                      style={styles.iconButtonDark}
                      onPress={() => saveEdit(account.id)}
                      disabled={isSaving}
                    >
                      <Text style={styles.iconButtonDarkText}>✓</Text>
                    </Pressable>
                    <Pressable style={styles.iconButton} onPress={() => setEditingId(null)}>
                      <Text style={styles.iconButtonText}>✕</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={styles.balanceRow}>
                    <Text style={styles.accountBalance}>
                      {formatCurrency(account.startingBalance)}
                    </Text>
                    <Pressable style={styles.iconButton} onPress={() => startEdit(account)}>
                      <Text style={styles.iconButtonText}>✎</Text>
                    </Pressable>
                    <Pressable
                      style={styles.iconButtonDanger}
                      onPress={() => onDelete(account.id)}
                    >
                      <Text style={styles.iconButtonDangerText}>🗑</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>

      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Tambah Akun Baru</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Nama Akun</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. BCA, Tabungan Haji, OVO"
                  placeholderTextColor="#94a3b8"
                  value={newAccount.name}
                  onChangeText={(v) => setNewAccount((p) => ({ ...p, name: v }))}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Tipe Akun</Text>
                <Dropdown
                  value={newAccount.type}
                  onChange={(v) => setNewAccount((p) => ({ ...p, type: v }))}
                  options={ACCOUNT_TYPES.map((t) => ({ label: t, value: t }))}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Saldo Awal (Rp)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="10000000"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={newAccount.startingBalance}
                  onChangeText={(v) =>
                    setNewAccount((p) => ({ ...p, startingBalance: formatThousands(v) }))
                  }
                />
              </View>

              <Pressable
                style={[styles.saveButton, isSaving && styles.disabled]}
                onPress={handleAddSubmit}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>Simpan Akun</Text>
                )}
              </Pressable>

              <Pressable style={styles.cancelButton} onPress={() => setShowAddModal(false)}>
                <Text style={styles.cancelButtonText}>Batal</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 100, gap: 16 },
  title: { color: "#0f172a", fontSize: 28, fontWeight: "900" },
  totalPanel: { backgroundColor: "#0f172a", borderRadius: 20, padding: 20 },
  totalLabel: { color: "#a7f3d0", fontSize: 13, fontWeight: "700" },
  totalValue: { color: "#ffffff", fontSize: 30, fontWeight: "900", marginTop: 8 },
  totalMeta: { color: "rgba(255,255,255,0.5)", fontSize: 12, fontWeight: "700", marginTop: 10 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionTitle: { color: "#0f172a", fontSize: 18, fontWeight: "900" },
  addButton: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  addButtonText: { color: "#334155", fontSize: 13, fontWeight: "800" },
  searchInput: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 12, color: "#0f172a" },
  list: { gap: 10 },
  emptyText: { color: "#64748b", fontSize: 13, textAlign: "center", padding: 20 },
  accountCard: { backgroundColor: "#ffffff", borderRadius: 16, padding: 14, gap: 10 },
  accountInfo: {},
  accountName: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  accountType: { color: "#64748b", fontSize: 12, fontWeight: "700", marginTop: 2 },
  balanceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  accountBalance: { color: "#0f172a", fontSize: 15, fontWeight: "900", flex: 1 },
  editRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  editInput: { flex: 1, backgroundColor: "#f4f7fb", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: "#0f172a" },
  iconButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  iconButtonText: { color: "#475569", fontSize: 14 },
  iconButtonDark: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" },
  iconButtonDarkText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  iconButtonDanger: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "#fecdd3", backgroundColor: "#fff1f2", alignItems: "center", justifyContent: "center" },
  iconButtonDangerText: { fontSize: 13 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
  backdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.55)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#ffffff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 16 },
  sheetTitle: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  inputGroup: { gap: 8 },
  label: { color: "#64748b", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  input: { backgroundColor: "#f4f7fb", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 12, color: "#0f172a", fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  saveButton: { alignItems: "center", backgroundColor: "#ec4899", borderRadius: 14, justifyContent: "center", paddingVertical: 15 },
  saveButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  cancelButton: { alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  cancelButtonText: { color: "#64748b", fontSize: 14, fontWeight: "700" },
});
