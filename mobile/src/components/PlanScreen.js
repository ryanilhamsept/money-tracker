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
import { formatDisplayDate } from "../utils/date";
import { goalIcons, goalColors } from "../constants/options";
import CreditCalculator from "./CreditCalculator";

const generateId = () =>
  `goal-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

const formatThousands = (value) => {
  const raw = String(value || "").replace(/[^\d]/g, "");
  return raw ? new Intl.NumberFormat("id-ID").format(Number(raw)) : "";
};

const parseAmount = (value) => Number(String(value || "").replace(/[^\d]/g, "")) || 0;

const SORT_OPTIONS = [
  { key: "newest", label: "Terbaru" },
  { key: "target", label: "Target Terbesar" },
  { key: "progress", label: "Progress Tertinggi" },
];

const FILTER_OPTIONS = [
  { key: "all", label: "Semua" },
  { key: "ongoing", label: "Berjalan" },
  { key: "done", label: "Selesai" },
];

const emptyGoal = {
  title: "",
  icon: goalIcons[0],
  targetAmount: "",
  savedAmount: "",
  deadline: "",
  note: "",
};

export default function PlanScreen({ goals, onAdd, onUpdate, onDelete }) {
  const [formVisible, setFormVisible] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [form, setForm] = useState(emptyGoal);
  const [isSaving, setIsSaving] = useState(false);
  const [sortIndex, setSortIndex] = useState(0);
  const [filterIndex, setFilterIndex] = useState(0);
  const [showCalculator, setShowCalculator] = useState(false);

  const sortedGoals = useMemo(() => {
    const sortKey = SORT_OPTIONS[sortIndex].key;
    const filterKey = FILTER_OPTIONS[filterIndex].key;

    const filtered = goals.filter((g) => {
      const progress = g.targetAmount > 0 ? g.savedAmount / g.targetAmount : 0;
      if (filterKey === "ongoing") return progress < 1;
      if (filterKey === "done") return progress >= 1;
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortKey === "target") return b.targetAmount - a.targetAmount;
      if (sortKey === "progress") {
        const pa = a.targetAmount > 0 ? a.savedAmount / a.targetAmount : 0;
        const pb = b.targetAmount > 0 ? b.savedAmount / b.targetAmount : 0;
        return pb - pa;
      }
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });
  }, [goals, sortIndex, filterIndex]);

  const closeForm = () => {
    setFormVisible(false);
    setEditingGoal(null);
    setForm(emptyGoal);
  };

  const openAddForm = () => {
    setEditingGoal(null);
    setForm(emptyGoal);
    setFormVisible(true);
  };

  const openEditForm = (goal) => {
    setEditingGoal(goal);
    setForm({
      title: goal.title,
      icon: goal.icon,
      targetAmount: formatThousands(goal.targetAmount),
      savedAmount: formatThousands(goal.savedAmount),
      deadline: goal.deadline || "",
      note: goal.note || "",
    });
    setFormVisible(true);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    const targetAmount = parseAmount(form.targetAmount);
    if (!targetAmount) return;

    setIsSaving(true);
    try {
      if (editingGoal) {
        await onUpdate({
          ...editingGoal,
          title: form.title.trim(),
          icon: form.icon,
          targetAmount,
          savedAmount: parseAmount(form.savedAmount),
          deadline: form.deadline || null,
          note: form.note.trim() || null,
        });
      } else {
        await onAdd({
          id: generateId(),
          title: form.title.trim(),
          icon: form.icon,
          color: goalColors[goals.length % goalColors.length],
          targetAmount,
          savedAmount: parseAmount(form.savedAmount),
          deadline: form.deadline || null,
          note: form.note.trim() || null,
        });
      }
      closeForm();
    } finally {
      setIsSaving(false);
    }
  };

  if (showCalculator) {
    return <CreditCalculator onBack={() => setShowCalculator(false)} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Plan</Text>
      <Text style={styles.subtitle}>Target nabung & rencana keuanganmu.</Text>

      <Pressable style={styles.calculatorBanner} onPress={() => setShowCalculator(true)}>
        <Text style={styles.calculatorBannerText}>🧮 Kalkulator Kredit (KPR / Kendaraan)</Text>
        <Text style={styles.calculatorBannerArrow}>→</Text>
      </Pressable>

      <View style={styles.toolbarRow}>
        <Pressable
          style={styles.toolbarButton}
          onPress={() => setSortIndex((i) => (i + 1) % SORT_OPTIONS.length)}
        >
          <Text style={styles.toolbarButtonText}>↕ {SORT_OPTIONS[sortIndex].label}</Text>
        </Pressable>
        <Pressable
          style={styles.toolbarButton}
          onPress={() => setFilterIndex((i) => (i + 1) % FILTER_OPTIONS.length)}
        >
          <Text style={styles.toolbarButtonText}>☰ {FILTER_OPTIONS[filterIndex].label}</Text>
        </Pressable>
        <Pressable style={[styles.toolbarButton, styles.addButton]} onPress={openAddForm}>
          <Text style={styles.addButtonText}>+ Tambah</Text>
        </Pressable>
      </View>

      {sortedGoals.length === 0 ? (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyText}>
            Belum ada rencana. Tap "+ Tambah" untuk bikin target pertamamu.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {sortedGoals.map((goal) => {
            const progress = goal.targetAmount > 0 ? goal.savedAmount / goal.targetAmount : 0;
            const percent = Math.min(100, Math.round(progress * 100));
            const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);

            return (
              <View key={goal.id} style={styles.goalCard}>
                <View style={styles.goalHeader}>
                  <View style={[styles.goalIconWrap, { backgroundColor: `${goal.color}22` }]}>
                    <Text style={styles.goalIconText}>{goal.icon}</Text>
                  </View>
                  <View style={styles.goalHeaderCopy}>
                    <Text style={styles.goalTitle} numberOfLines={1}>{goal.title}</Text>
                    {goal.deadline ? (
                      <Text style={styles.goalDeadline}>
                        Target {formatDisplayDate(goal.deadline)}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.goalTarget}>{formatCurrency(goal.targetAmount)}</Text>
                </View>

                <View style={styles.barTrack}>
                  <View
                    style={[styles.barFill, { width: `${percent}%`, backgroundColor: goal.color }]}
                  />
                </View>

                <View style={styles.goalFooterRow}>
                  <Text style={styles.goalSaved}>{formatCurrency(goal.savedAmount)}</Text>
                  <View style={styles.goalFooterRight}>
                    <Text style={styles.goalRemaining}>{formatCurrency(remaining)}</Text>
                    <Pressable
                      style={[styles.iconButton, styles.iconButtonSpaced]}
                      onPress={() => openEditForm(goal)}
                    >
                      <Text style={styles.iconButtonText}>✎</Text>
                    </Pressable>
                    <Pressable style={styles.iconButtonDanger} onPress={() => onDelete(goal.id)}>
                      <Text style={styles.iconButtonDangerText}>🗑</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Modal
        visible={formVisible}
        animationType="slide"
        transparent
        onRequestClose={closeForm}
      >
        <View style={styles.backdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <View style={styles.sheet}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>
                  {editingGoal ? "Edit Rencana" : "Rencana Baru"}
                </Text>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Ikon</Text>
                  <View style={styles.iconPickerRow}>
                    {goalIcons.map((icon) => (
                      <Pressable
                        key={icon}
                        onPress={() => setForm((p) => ({ ...p, icon }))}
                        style={[
                          styles.iconPickerItem,
                          form.icon === icon && styles.iconPickerItemActive,
                        ]}
                      >
                        <Text style={styles.iconPickerText}>{icon}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Nama Rencana</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g. Liburan, Dana Darurat"
                    placeholderTextColor="#94a3b8"
                    value={form.title}
                    onChangeText={(v) => setForm((p) => ({ ...p, title: v }))}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Target (Rp)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="25000000"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={form.targetAmount}
                    onChangeText={(v) =>
                      setForm((p) => ({ ...p, targetAmount: formatThousands(v) }))
                    }
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Sudah Terkumpul (Rp)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor="#94a3b8"
                    keyboardType="numeric"
                    value={form.savedAmount}
                    onChangeText={(v) =>
                      setForm((p) => ({ ...p, savedAmount: formatThousands(v) }))
                    }
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Target Bulan (Opsional, YYYY-MM-DD)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="2026-12-31"
                    placeholderTextColor="#94a3b8"
                    value={form.deadline}
                    onChangeText={(v) => setForm((p) => ({ ...p, deadline: v }))}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Catatan (Opsional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Catatan tambahan..."
                    placeholderTextColor="#94a3b8"
                    value={form.note}
                    onChangeText={(v) => setForm((p) => ({ ...p, note: v }))}
                  />
                </View>

                <Pressable
                  style={[styles.saveButton, isSaving && styles.disabled]}
                  onPress={handleSubmit}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <Text style={styles.saveButtonText}>
                      {editingGoal ? "Simpan Perubahan" : "Simpan Rencana"}
                    </Text>
                  )}
                </Pressable>

                {editingGoal ? (
                  <Pressable
                    style={[styles.deleteButton, isSaving && styles.disabled]}
                    onPress={async () => {
                      setIsSaving(true);
                      try {
                        await onDelete(editingGoal.id);
                        closeForm();
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    disabled={isSaving}
                  >
                    <Text style={styles.deleteButtonText}>Hapus Rencana</Text>
                  </Pressable>
                ) : null}

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
  title: { color: "#0f172a", fontSize: 28, fontWeight: "900" },
  subtitle: { color: "#64748b", fontSize: 13, fontWeight: "600", marginTop: -12 },
  calculatorBanner: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  calculatorBannerText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  calculatorBannerArrow: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
  toolbarRow: { flexDirection: "row", gap: 8 },
  toolbarButton: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toolbarButtonText: { color: "#334155", fontSize: 12, fontWeight: "800" },
  addButton: { backgroundColor: "#0f172a", borderColor: "#0f172a", marginLeft: "auto" },
  addButtonText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  emptyPanel: { backgroundColor: "#ffffff", borderRadius: 16, padding: 24, alignItems: "center" },
  emptyText: { color: "#64748b", fontSize: 13, fontWeight: "600", textAlign: "center" },
  list: { gap: 12 },
  goalCard: { backgroundColor: "#ffffff", borderRadius: 20, padding: 16, gap: 10 },
  goalHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  goalIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  goalIconText: { fontSize: 20 },
  goalHeaderCopy: { flex: 1 },
  goalTitle: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  goalDeadline: { color: "#94a3b8", fontSize: 11, fontWeight: "600", marginTop: 2 },
  goalTarget: { color: "#0f172a", fontSize: 14, fontWeight: "900" },
  barTrack: { height: 8, backgroundColor: "#f1f5f9", borderRadius: 4, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 4 },
  goalFooterRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  goalSaved: { color: "#0f172a", fontSize: 13, fontWeight: "800" },
  goalFooterRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  goalRemaining: { color: "#94a3b8", fontSize: 12, fontWeight: "700" },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonSpaced: { marginRight: 0 },
  iconButtonText: { color: "#475569", fontSize: 13 },
  iconButtonDark: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonDarkText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  iconButtonDanger: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#fecdd3",
    backgroundColor: "#fff1f2",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonDangerText: { fontSize: 12 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
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
  inputGroup: { gap: 8, marginBottom: 16 },
  label: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
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
  iconPickerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  iconPickerItem: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: "#f4f7fb",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  iconPickerItemActive: { borderColor: "#0f172a", backgroundColor: "#e2e8f0" },
  iconPickerText: { fontSize: 18 },
  saveButton: {
    alignItems: "center",
    backgroundColor: "#ec4899",
    borderRadius: 14,
    justifyContent: "center",
    paddingVertical: 15,
  },
  saveButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
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
  deleteButtonText: { color: "#be123c", fontSize: 15, fontWeight: "800" },
  cancelButton: { alignItems: "center", justifyContent: "center", marginTop: 10, paddingVertical: 12 },
  cancelButtonText: { color: "#64748b", fontSize: 14, fontWeight: "700" },
});
