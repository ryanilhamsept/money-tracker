import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getSplitBills, saveSplitBill, deleteSplitBill } from "../services/supabase";
import {
  buildSplits,
  calculateBillTotals,
  calculateParticipantTotals,
  calculateSimplifiedDebts,
} from "../utils/splitBill";
import { colors, radius, shadow, TOP_INSET } from "../theme";

const DEFAULT_TAX = 10;
const DEFAULT_SERVICE = 0;

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);

const today = () => new Date().toISOString().slice(0, 10);

const rupiah = (n) =>
  "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");

const digits = (v) => Number(String(v).replace(/[^\d]/g, "")) || 0;

const emptyDraft = () => ({
  id: null,
  title: "",
  date: today(),
  taxRate: DEFAULT_TAX,
  serviceRate: DEFAULT_SERVICE,
  participants: [],
  items: [],
});

export default function SplitBillScreen({ onBack }) {
  const [bills, setBills] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState(null); // null = sedang di daftar
  const [isSaving, setSaving] = useState(false);

  const [personName, setPersonName] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemQty, setItemQty] = useState("1");
  const [assigning, setAssigning] = useState(null); // item yang sedang dibagi

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBills(await getSplitBills());
    } catch (e) {
      setError(e.message || "Gagal memuat bill.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // --- Hitungan, selalu diturunkan dari draft, tidak pernah disimpan ---
  const totals = useMemo(
    () => calculateBillTotals(draft?.items || []),
    [draft?.items]
  );

  const perPerson = useMemo(() => {
    if (!draft) return [];
    return calculateParticipantTotals(
      draft.participants,
      buildSplits(draft.items, draft.participants)
    );
  }, [draft]);

  const debts = useMemo(() => {
    if (!draft) return [];
    return calculateSimplifiedDebts(
      perPerson.map((p) => {
        const person = draft.participants.find((x) => x.id === p.participantId);
        return { name: p.name, total: p.total, paid: Number(person?.paid) || 0 };
      })
    );
  }, [perPerson, draft]);

  // --- Aksi draft ---
  const patch = (fields) => setDraft((d) => ({ ...d, ...fields }));

  const addPerson = () => {
    const name = personName.trim();
    if (!name) return;
    patch({ participants: [...draft.participants, { id: newId(), name, paid: 0 }] });
    setPersonName("");
  };

  const removePerson = (id) =>
    patch({
      participants: draft.participants.filter((p) => p.id !== id),
      // Tandanya ikut dibersihkan, kalau tidak item akan terus memegang
      // orang yang sudah tidak ada dan totalnya jadi tidak masuk akal.
      items: draft.items.map((it) => ({
        ...it,
        splits: (it.splits || []).filter((s) => s.participantId !== id),
      })),
    });

  const setPaid = (id, value) =>
    patch({
      participants: draft.participants.map((p) =>
        p.id === id ? { ...p, paid: digits(value) } : p
      ),
    });

  const addItem = () => {
    const name = itemName.trim();
    const price = digits(itemPrice);
    const quantity = Math.max(1, digits(itemQty) || 1);
    if (!name || price <= 0) return;

    patch({
      items: [
        ...draft.items,
        {
          id: newId(),
          name,
          price,
          quantity,
          taxRate: draft.taxRate,
          serviceRate: draft.serviceRate,
          splits: [],
        },
      ],
    });
    setItemName("");
    setItemPrice("");
    setItemQty("1");
  };

  const removeItem = (id) =>
    patch({ items: draft.items.filter((it) => it.id !== id) });

  // Tarif berlaku untuk seluruh bill, tapi disimpan di tiap item -- jadi
  // mengubahnya di sini harus menyapu semuanya.
  const setRates = (taxRate, serviceRate) =>
    patch({
      taxRate,
      serviceRate,
      items: draft.items.map((it) => ({ ...it, taxRate, serviceRate })),
    });

  const toggleAssign = (item, participantId) => {
    const current = item.splits || [];
    const has = current.some((s) => s.participantId === participantId);
    const next = has
      ? current.filter((s) => s.participantId !== participantId)
      : [...current, { participantId, amount: 0 }];

    // Harga item dibagi rata ke siapa pun yang ditandai. Sisa pembagian
    // dibagikan satu-satu, jadi tidak ada rupiah yang menguap.
    const subtotal = item.price * item.quantity;
    const shares = next.length
      ? (() => {
          const base = Math.floor(subtotal / next.length);
          const rem = subtotal - base * next.length;
          return next.map((_, i) => base + (i < rem ? 1 : 0));
        })()
      : [];

    const rebuilt = next.map((s, i) => ({ ...s, amount: shares[i] }));
    patch({
      items: draft.items.map((it) => (it.id === item.id ? { ...it, splits: rebuilt } : it)),
    });
    setAssigning((a) => (a && a.id === item.id ? { ...a, splits: rebuilt } : a));
  };

  const save = async () => {
    if (!draft.title.trim()) {
      Alert.alert("Judul masih kosong", "Kasih nama dulu buat bill-nya.");
      return;
    }
    setSaving(true);
    try {
      await saveSplitBill({
        id: draft.id,
        title: draft.title.trim(),
        date: draft.date,
        totalAmount: totals.total,
        participants: draft.participants,
        items: draft.items,
      });
      setDraft(null);
      await load();
    } catch (e) {
      Alert.alert("Gagal menyimpan", e.message || "Coba lagi.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = (bill) =>
    Alert.alert("Hapus bill ini?", `"${bill.title}" akan hilang permanen.`, [
      { text: "Batal", style: "cancel" },
      {
        text: "Hapus",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSplitBill(bill.id);
            await load();
          } catch (e) {
            Alert.alert("Gagal menghapus", e.message || "Coba lagi.");
          }
        },
      },
    ]);

  const openBill = (bill) =>
    setDraft({
      id: bill.id,
      title: bill.title,
      date: bill.date,
      taxRate: bill.items?.[0]?.taxRate ?? DEFAULT_TAX,
      serviceRate: bill.items?.[0]?.serviceRate ?? DEFAULT_SERVICE,
      participants: bill.participants || [],
      items: bill.items || [],
    });

  // ====================== DAFTAR BILL ======================
  if (!draft) {
    return (
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={onBack}>
            <Text style={styles.iconButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.title}>Split Bill</Text>
          <Pressable style={styles.iconButton} onPress={load}>
            <Text style={styles.iconButtonText}>⟳</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable style={styles.primaryButton} onPress={() => setDraft(emptyDraft())}>
          <Text style={styles.primaryButtonText}>+ Bill baru</Text>
        </Pressable>

        {isLoading ? (
          <ActivityIndicator color={colors.accent[0]} style={{ marginTop: 24 }} />
        ) : bills.length === 0 ? (
          <Text style={styles.empty}>Belum ada bill. Bikin satu buat patungan bareng.</Text>
        ) : (
          bills.map((bill) => (
            <Pressable key={bill.id} style={styles.card} onPress={() => openBill(bill)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {bill.title}
                </Text>
                <Text style={styles.cardMeta}>
                  {bill.date} · {bill.participants.length} orang · {bill.items.length} item
                </Text>
              </View>
              <Text style={styles.cardAmount} numberOfLines={1}>
                {rupiah(bill.totalAmount)}
              </Text>
              <Pressable style={styles.deleteButton} onPress={() => confirmDelete(bill)}>
                <Text style={styles.deleteButtonText}>🗑</Text>
              </Pressable>
            </Pressable>
          ))
        )}
      </ScrollView>
    );
  }

  // ====================== EDITOR BILL ======================
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={() => setDraft(null)}>
            <Text style={styles.iconButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.title}>{draft.id ? "Ubah bill" : "Bill baru"}</Text>
          <Pressable
            style={[styles.iconButton, styles.saveButton, isSaving && styles.disabled]}
            onPress={save}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.saveButtonText}>✓</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.panel}>
          <Text style={styles.label}>Judul</Text>
          <TextInput
            style={styles.input}
            value={draft.title}
            onChangeText={(v) => patch({ title: v })}
            placeholder="Makan di mana?"
            placeholderTextColor={colors.textFaint}
          />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Tanggal</Text>
              <TextInput
                style={styles.input}
                value={draft.date}
                onChangeText={(v) => patch({ date: v })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textFaint}
              />
            </View>
            <View style={{ width: 86 }}>
              <Text style={styles.label}>PPN %</Text>
              <TextInput
                style={styles.input}
                value={String(draft.taxRate)}
                onChangeText={(v) => setRates(digits(v), draft.serviceRate)}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ width: 86 }}>
              <Text style={styles.label}>Service %</Text>
              <TextInput
                style={styles.input}
                value={String(draft.serviceRate)}
                onChangeText={(v) => setRates(draft.taxRate, digits(v))}
                keyboardType="number-pad"
              />
            </View>
          </View>
        </View>

        {/* --- Peserta --- */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Siapa aja</Text>

          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={personName}
              onChangeText={setPersonName}
              placeholder="Nama"
              placeholderTextColor={colors.textFaint}
              onSubmitEditing={addPerson}
              returnKeyType="done"
            />
            <Pressable style={styles.addButton} onPress={addPerson}>
              <Text style={styles.addButtonText}>+</Text>
            </Pressable>
          </View>

          {draft.participants.map((p) => {
            const owed = perPerson.find((x) => x.participantId === p.id);
            return (
              <View key={p.id} style={styles.personRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.personOwed}>
                    tanggungan {rupiah(owed?.total || 0)}
                  </Text>
                </View>
                <View style={{ width: 118 }}>
                  <Text style={styles.labelTiny}>sudah bayar</Text>
                  <TextInput
                    style={[styles.input, styles.inputCompact]}
                    value={p.paid ? String(p.paid) : ""}
                    onChangeText={(v) => setPaid(p.id, v)}
                    placeholder="0"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="number-pad"
                  />
                </View>
                <Pressable style={styles.deleteButton} onPress={() => removePerson(p.id)}>
                  <Text style={styles.deleteButtonText}>✕</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* --- Item --- */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Pesanan</Text>

          <TextInput
            style={styles.input}
            value={itemName}
            onChangeText={setItemName}
            placeholder="Nama menu"
            placeholderTextColor={colors.textFaint}
          />
          <View style={styles.row}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={itemPrice}
              onChangeText={setItemPrice}
              placeholder="Harga satuan"
              placeholderTextColor={colors.textFaint}
              keyboardType="number-pad"
            />
            <View style={{ width: 70 }}>
              <TextInput
                style={styles.input}
                value={itemQty}
                onChangeText={setItemQty}
                placeholder="qty"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
              />
            </View>
            <Pressable style={styles.addButton} onPress={addItem}>
              <Text style={styles.addButtonText}>+</Text>
            </Pressable>
          </View>

          {draft.items.map((it) => {
            const tagged = (it.splits || []).filter((s) => s.amount > 0);
            const names = tagged
              .map((s) => draft.participants.find((p) => p.id === s.participantId)?.name)
              .filter(Boolean);
            return (
              <View key={it.id} style={styles.itemRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {it.quantity}× {it.name}
                  </Text>
                  <Text style={styles.itemMeta} numberOfLines={1}>
                    {names.length ? names.join(", ") : "dibagi rata ke semua"}
                  </Text>
                </View>
                <Text style={styles.itemAmount} numberOfLines={1}>
                  {rupiah(it.price * it.quantity)}
                </Text>
                <Pressable style={styles.tagButton} onPress={() => setAssigning(it)}>
                  <Text style={styles.tagButtonText}>bagi</Text>
                </Pressable>
                <Pressable style={styles.deleteButton} onPress={() => removeItem(it.id)}>
                  <Text style={styles.deleteButtonText}>✕</Text>
                </Pressable>
              </View>
            );
          })}
        </View>

        {/* --- Ringkasan --- */}
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Ringkasan</Text>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Subtotal</Text>
            <Text style={styles.sumValue}>{rupiah(totals.subtotal)}</Text>
          </View>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>PPN {draft.taxRate}%</Text>
            <Text style={styles.sumValue}>{rupiah(totals.tax)}</Text>
          </View>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Service {draft.serviceRate}%</Text>
            <Text style={styles.sumValue}>{rupiah(totals.service)}</Text>
          </View>
          <View style={[styles.sumRow, styles.sumTotalRow]}>
            <Text style={styles.sumTotalLabel}>Total</Text>
            <Text style={styles.sumTotalValue}>{rupiah(totals.total)}</Text>
          </View>
        </View>

        {/* --- Siapa transfer ke siapa --- */}
        {debts.length > 0 ? (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Siapa bayar ke siapa</Text>
            <Text style={styles.hint}>
              Sudah disederhanakan jadi transfer paling sedikit.
            </Text>
            {debts.map((d, i) => (
              <View key={i} style={styles.debtRow}>
                <Text style={styles.debtText} numberOfLines={1}>
                  {d.from} → {d.to}
                </Text>
                <Text style={styles.debtAmount}>{rupiah(d.amount)}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* --- Pilih siapa yang ikut patungan item ini --- */}
      <Modal
        visible={!!assigning}
        animationType="slide"
        onRequestClose={() => setAssigning(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalScreen}
        >
          <View style={styles.header}>
            <Pressable style={styles.iconButton} onPress={() => setAssigning(null)}>
              <Text style={styles.iconButtonText}>‹</Text>
            </Pressable>
            <Text style={styles.title} numberOfLines={1}>
              {assigning?.name}
            </Text>
            <View style={{ width: 44 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 10 }}>
            <Text style={styles.hint}>
              Tandai siapa yang ikut. Kalau nggak ada yang ditandai, item ini
              dibagi rata ke semua orang.
            </Text>

            {draft.participants.length === 0 ? (
              <Text style={styles.empty}>Tambah pesertanya dulu.</Text>
            ) : (
              draft.participants.map((p) => {
                const current = draft.items.find((x) => x.id === assigning?.id);
                const share = (current?.splits || []).find((s) => s.participantId === p.id);
                const on = !!share;
                return (
                  <Pressable
                    key={p.id}
                    style={[styles.pickRow, on && styles.pickRowOn]}
                    onPress={() => toggleAssign(current || assigning, p.id)}
                  >
                    <Text style={styles.pickCheck}>{on ? "✓" : " "}</Text>
                    <Text style={styles.pickName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.pickAmount}>
                      {on ? rupiah(share.amount) : "—"}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14, padding: 20, paddingBottom: 32 },
  modalScreen: { backgroundColor: colors.bgGradient[1], flex: 1, paddingTop: TOP_INSET },

  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  title: { color: colors.text, flex: 1, fontSize: 28, fontWeight: "900", paddingHorizontal: 10 },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  iconButtonText: { color: colors.text, fontSize: 20, fontWeight: "900" },
  saveButton: { backgroundColor: colors.accent[0], borderColor: colors.accent[0] },
  saveButtonText: { color: "#ffffff", fontSize: 20, fontWeight: "900" },

  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: 10,
    padding: 16,
    ...shadow.card,
  },
  panelTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  labelTiny: { color: colors.textFaint, fontSize: 10, fontWeight: "800", marginBottom: 3 },
  hint: { color: colors.textFaint, fontSize: 12, fontWeight: "600", lineHeight: 17 },

  input: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  inputCompact: { paddingVertical: 8 },
  row: { alignItems: "flex-end", flexDirection: "row", gap: 8 },

  addButton: {
    alignItems: "center",
    backgroundColor: colors.accent[0],
    borderRadius: radius.md,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  addButtonText: { color: "#ffffff", fontSize: 20, fontWeight: "900" },

  primaryButton: {
    alignItems: "center",
    backgroundColor: colors.accent[0],
    borderRadius: radius.md,
    paddingVertical: 14,
    ...shadow.raised,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },

  card: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.lg,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 16,
    ...shadow.card,
  },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  cardMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  cardAmount: { color: colors.text, flexShrink: 0, fontSize: 14, fontWeight: "900" },

  personRow: { alignItems: "flex-end", flexDirection: "row", gap: 8 },
  personName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  personOwed: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  itemRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  itemName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  itemMeta: { color: colors.textFaint, fontSize: 11, fontWeight: "600", marginTop: 2 },
  itemAmount: { color: colors.text, flexShrink: 0, fontSize: 13, fontWeight: "900" },

  tagButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagButtonText: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },

  deleteButton: {
    alignItems: "center",
    backgroundColor: "rgba(251,113,133,0.16)",
    borderRadius: radius.pill,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  deleteButtonText: { color: colors.negative, fontSize: 13, fontWeight: "900" },

  sumRow: { flexDirection: "row", justifyContent: "space-between" },
  sumLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  sumValue: { color: colors.text, fontSize: 13, fontWeight: "800" },
  sumTotalRow: { borderTopColor: colors.divider, borderTopWidth: 1, marginTop: 4, paddingTop: 10 },
  sumTotalLabel: { color: colors.text, fontSize: 15, fontWeight: "900" },
  sumTotalValue: { color: colors.accent[0], fontSize: 18, fontWeight: "900" },

  debtRow: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  debtText: { color: colors.text, flex: 1, fontSize: 13, fontWeight: "800" },
  debtAmount: { color: colors.positive, flexShrink: 0, fontSize: 14, fontWeight: "900" },

  pickRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  pickRowOn: { backgroundColor: "rgba(56,189,248,0.14)", borderColor: colors.accent[0] },
  pickCheck: { color: colors.accent[0], fontSize: 16, fontWeight: "900", width: 16 },
  pickName: { color: colors.text, flex: 1, fontSize: 14, fontWeight: "800" },
  pickAmount: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },

  errorPanel: {
    backgroundColor: "rgba(251,113,133,0.16)",
    borderRadius: radius.md,
    padding: 12,
  },
  errorText: { color: colors.negative, fontSize: 12, fontWeight: "700" },
  empty: { color: colors.textFaint, fontSize: 13, fontWeight: "600", marginTop: 20, textAlign: "center" },
  disabled: { opacity: 0.5 },
});
