import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
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
  describeParticipantItems,
  isFullyAssigned,
  portionsAssigned,
  portionsLeft,
  splitEvenly,
} from "../utils/splitBill";
import { colors, radius, shadow, TOP_INSET } from "../theme";

const DEFAULT_TAX = 10;
const DEFAULT_SERVICE = 0;

// Warna avatar dipilih dari nama, bukan diacak -- orang yang sama harus selalu
// dapat warna yang sama supaya bisa dikenali sekilas di daftar item.
const AVATAR_COLORS = [
  "#f9a8d4", "#fcd34d", "#86efac", "#93c5fd",
  "#c4b5fd", "#fdba74", "#67e8f9", "#fda4af",
];
const avatarColor = (text = "") => {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};
const initial = (text = "?") => (text.trim()[0] || "?").toUpperCase();

const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);

const today = () => new Date().toISOString().slice(0, 10);
const rupiah = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
const digits = (v) => Number(String(v).replace(/[^\d]/g, "")) || 0;

const longDate = (iso) => {
  const bulan = ["Januari","Februari","Maret","April","Mei","Juni",
                 "Juli","Agustus","September","Oktober","November","Desember"];
  const [y, m, d] = String(iso).split("-").map(Number);
  return Number.isFinite(d) ? `${d} ${bulan[(m || 1) - 1]} ${y}` : iso;
};

const emptyDraft = () => ({
  id: null,
  title: "",
  date: today(),
  taxRate: DEFAULT_TAX,
  serviceRate: DEFAULT_SERVICE,
  participants: [],
  items: [],
});

function Avatar({ name, size = 36 }) {
  return (
    <View
      style={[
        styles.avatar,
        { backgroundColor: avatarColor(name), borderRadius: size / 2, height: size, width: size },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.42 }]}>{initial(name)}</Text>
    </View>
  );
}

export default function SplitBillScreen({ onBack }) {
  const [bills, setBills] = useState([]);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState(null);
  const [isSaving, setSaving] = useState(false);

  const [addingPerson, setAddingPerson] = useState(false);
  const [personName, setPersonName] = useState("");

  const [addingItem, setAddingItem] = useState(false);
  const [itemForm, setItemForm] = useState({ name: "", price: "", qty: "1" });

  const [expandedId, setExpandedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [showDetail, setShowDetail] = useState(false);
  const [showRates, setShowRates] = useState(false);

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

  const totals = useMemo(() => calculateBillTotals(draft?.items || []), [draft?.items]);

  const perPerson = useMemo(() => {
    if (!draft) return [];
    return calculateParticipantTotals(
      draft.participants,
      buildSplits(draft.items, draft.participants)
    );
  }, [draft]);

  const dibagi = useMemo(
    () => (draft?.items || []).filter(isFullyAssigned).length,
    [draft?.items]
  );

  const patch = (fields) => setDraft((d) => ({ ...d, ...fields }));
  const patchItem = (id, fields) =>
    patch({ items: draft.items.map((it) => (it.id === id ? { ...it, ...fields } : it)) });

  // --- Peserta ---
  const addPerson = () => {
    const name = personName.trim();
    if (!name) return;
    patch({ participants: [...draft.participants, { id: newId(), name }] });
    setPersonName("");
    setAddingPerson(false);
  };

  const removePerson = (id) =>
    patch({
      participants: draft.participants.filter((p) => p.id !== id),
      // Porsi miliknya ikut dilepas; kalau tidak, item terus memegang orang
      // yang sudah tidak ada dan hitungannya jadi tidak masuk akal.
      items: draft.items.map((it) => ({
        ...it,
        splits: (it.splits || []).filter((s) => s.participantId !== id),
      })),
    });

  // --- Item ---
  const addItem = () => {
    const name = itemForm.name.trim();
    const price = digits(itemForm.price);
    const quantity = Math.max(1, digits(itemForm.qty) || 1);
    if (!name || price <= 0) return;

    patch({
      items: [
        ...draft.items,
        { id: newId(), name, price, quantity, taxRate: draft.taxRate,
          serviceRate: draft.serviceRate, splits: [] },
      ],
    });
    setItemForm({ name: "", price: "", qty: "1" });
    setAddingItem(false);
  };

  const removeItem = (id) => {
    patch({ items: draft.items.filter((it) => it.id !== id) });
    setSelectedIds((s) => s.filter((x) => x !== id));
    if (expandedId === id) setExpandedId(null);
  };

  /** Ubah porsi satu orang di satu item. Tidak boleh melebihi qty item. */
  const bumpPortion = (item, participantId, delta) => {
    const splits = item.splits || [];
    const current = splits.find((s) => s.participantId === participantId);
    const now = Number(current?.portions) || 0;
    const next = now + delta;

    if (next < 0) return;
    if (delta > 0 && portionsLeft(item) <= 0) return;

    const rebuilt = current
      ? splits
          .map((s) => (s.participantId === participantId ? { ...s, portions: next } : s))
          .filter((s) => s.portions > 0)
      : [...splits, { participantId, portions: next }];

    patchItem(item.id, { splits: rebuilt });
  };

  const setRates = (taxRate, serviceRate) =>
    patch({
      taxRate,
      serviceRate,
      // Tarif berlaku untuk seluruh bill tapi disimpan di tiap item, jadi
      // mengubahnya harus menyapu semuanya.
      items: draft.items.map((it) => ({ ...it, taxRate, serviceRate })),
    });

  // --- Aksi massal ---
  const toggleSelect = (id) =>
    setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const toggleSelectAll = () =>
    setSelectedIds((s) => (s.length === draft.items.length ? [] : draft.items.map((it) => it.id)));

  const bulkEven = () =>
    patch({
      items: draft.items.map((it) =>
        selectedIds.includes(it.id) ? { ...it, splits: splitEvenly(it, draft.participants) } : it
      ),
    });

  const bulkClear = () =>
    patch({
      items: draft.items.map((it) => (selectedIds.includes(it.id) ? { ...it, splits: [] } : it)),
    });

  /** Tambah atau lepas satu orang dari semua item yang sedang dipilih. */
  const bulkTogglePerson = (participantId) =>
    patch({
      items: draft.items.map((it) => {
        if (!selectedIds.includes(it.id)) return it;
        const splits = it.splits || [];
        const has = splits.some((s) => s.participantId === participantId);
        if (has) return { ...it, splits: splits.filter((s) => s.participantId !== participantId) };
        const left = portionsLeft(it);
        if (left <= 0) return it;
        return { ...it, splits: [...splits, { participantId, portions: 1 }] };
      }),
    });

  // --- Simpan / hapus ---
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

  const openBill = (bill) => {
    setDraft({
      id: bill.id,
      title: bill.title,
      date: bill.date,
      taxRate: bill.items?.[0]?.taxRate ?? DEFAULT_TAX,
      serviceRate: bill.items?.[0]?.serviceRate ?? DEFAULT_SERVICE,
      participants: bill.participants || [],
      items: bill.items || [],
    });
    setSelectedIds([]);
    setExpandedId(null);
  };

  const shareSummary = async () => {
    const lines = [
      draft.title,
      longDate(draft.date),
      "",
      ...draft.items.map((it) => `${it.quantity}x ${it.name} — ${rupiah(it.price * it.quantity)}`),
      "",
      `Subtotal ${rupiah(totals.subtotal)}`,
      `PPN ${draft.taxRate}% ${rupiah(totals.tax)}`,
      ...(draft.serviceRate ? [`Service ${draft.serviceRate}% ${rupiah(totals.service)}`] : []),
      `Total ${rupiah(totals.total)}`,
      "",
      "Per orang:",
      ...perPerson.map((p) => `${p.name}: ${rupiah(p.total)}`),
    ];
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      // Dibatalkan pengguna -- tidak perlu diapa-apakan.
    }
  };

  // ============================ DAFTAR ============================
  if (!draft) {
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={onBack}>
            <Text style={styles.iconButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>SplitBill</Text>
          <Pressable style={styles.iconButton} onPress={load}>
            <Text style={styles.iconButtonText}>⟳</Text>
          </Pressable>
        </View>

        <View>
          <Text style={styles.tagline}>Biar Ga Ada Yang Nombok</Text>
          <Text style={styles.taglineSub}>Input menu, pilih orangnya, langsung kebagi.</Text>
        </View>

        {error ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Pressable style={styles.dashedButton} onPress={() => setDraft(emptyDraft())}>
          <Text style={styles.dashedButtonText}>+  Bikin Bill Baru</Text>
        </Pressable>

        {isLoading ? (
          <ActivityIndicator color={colors.accent[0]} style={{ marginTop: 20 }} />
        ) : (
          bills.map((bill) => (
            <Pressable key={bill.id} style={styles.billCard} onPress={() => openBill(bill)}>
              <Avatar name={bill.title} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.billTitle} numberOfLines={1}>{bill.title}</Text>
                <Text style={styles.billMeta}>
                  {longDate(bill.date)} · {bill.participants.length} orang
                </Text>
              </View>
              <Text style={styles.billAmount} numberOfLines={1}>{rupiah(bill.totalAmount)}</Text>
              <Pressable style={styles.xButton} onPress={() => confirmDelete(bill)}>
                <Text style={styles.xButtonText}>✕</Text>
              </Pressable>
            </Pressable>
          ))
        )}
      </ScrollView>
    );
  }

  // ============================ EDITOR ============================
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
          <TextInput
            style={styles.titleInput}
            value={draft.title}
            onChangeText={(v) => patch({ title: v })}
            placeholder="Nama bill"
            placeholderTextColor={colors.textFaint}
          />
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

        {/* ---------------- Peserta ---------------- */}
        <Text style={styles.sectionLabel}>Peserta</Text>

        {addingPerson ? (
          <View style={styles.inlineForm}>
            <TextInput
              style={styles.input}
              value={personName}
              onChangeText={setPersonName}
              placeholder="Nama"
              placeholderTextColor={colors.textFaint}
              autoFocus
              onSubmitEditing={addPerson}
              returnKeyType="done"
            />
            <View style={styles.formButtons}>
              <Pressable
                style={styles.ghostButton}
                onPress={() => {
                  setAddingPerson(false);
                  setPersonName("");
                }}
              >
                <Text style={styles.ghostButtonText}>Batal</Text>
              </Pressable>
              <Pressable style={styles.solidButton} onPress={addPerson}>
                <Text style={styles.solidButtonText}>Tambah</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.outlineButton} onPress={() => setAddingPerson(true)}>
            <Text style={styles.outlineButtonText}>＋  Tambah Peserta</Text>
          </Pressable>
        )}

        {draft.participants.map((p) => {
          const owed = perPerson.find((x) => x.participantId === p.id);
          return (
            <View key={p.id} style={styles.personRow}>
              <Avatar name={p.name} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
                <Text style={styles.personOwed}>{rupiah(owed?.total || 0)}</Text>
              </View>
              <Pressable style={styles.xButton} onPress={() => removePerson(p.id)}>
                <Text style={styles.xButtonText}>✕</Text>
              </Pressable>
            </View>
          );
        })}

        {/* ---------------- Item ---------------- */}
        <Text style={styles.sectionLabel}>Item</Text>

        {addingItem ? (
          <View style={styles.inlineForm}>
            <TextInput
              style={styles.input}
              value={itemForm.name}
              onChangeText={(v) => setItemForm((f) => ({ ...f, name: v }))}
              placeholder="Nama menu"
              placeholderTextColor={colors.textFaint}
              autoFocus
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={itemForm.price}
                onChangeText={(v) => setItemForm((f) => ({ ...f, price: v }))}
                placeholder="Harga (Rp)"
                placeholderTextColor={colors.textFaint}
                keyboardType="number-pad"
              />
              <TextInput
                style={[styles.input, { width: 72 }]}
                value={itemForm.qty}
                onChangeText={(v) => setItemForm((f) => ({ ...f, qty: v }))}
                keyboardType="number-pad"
              />
            </View>
            <View style={styles.formButtons}>
              <Pressable style={styles.ghostButton} onPress={() => setAddingItem(false)}>
                <Text style={styles.ghostButtonText}>Batal</Text>
              </Pressable>
              <Pressable style={styles.solidButton} onPress={addItem}>
                <Text style={styles.solidButtonText}>Tambah</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.outlineButton} onPress={() => setAddingItem(true)}>
            <Text style={styles.outlineButtonText}>▣  Tambah Item</Text>
          </Pressable>
        )}

        {draft.items.length > 0 ? (
          <View style={styles.selectAllRow}>
            <Pressable style={styles.checkRow} onPress={toggleSelectAll}>
              <View style={[styles.checkbox, selectedIds.length === draft.items.length && styles.checkboxOn]}>
                {selectedIds.length === draft.items.length ? (
                  <Text style={styles.checkboxMark}>✓</Text>
                ) : null}
              </View>
              <Text style={styles.selectAllText}>Pilih Semua ({draft.items.length})</Text>
            </Pressable>
            {selectedIds.length > 0 ? (
              <Text style={styles.selectCount}>{selectedIds.length} item dipilih</Text>
            ) : null}
          </View>
        ) : null}

        {draft.items.map((item) => {
          const assigned = portionsAssigned(item);
          const left = portionsLeft(item);
          const done = isFullyAssigned(item);
          const open = expandedId === item.id;
          const takers = (item.splits || []).filter((s) => s.portions > 0);

          return (
            <View key={item.id} style={[styles.itemCard, open && styles.itemCardOpen]}>
              <View style={styles.itemHead}>
                <Pressable style={styles.checkbox2} onPress={() => toggleSelect(item.id)}>
                  <View style={[styles.checkbox, selectedIds.includes(item.id) && styles.checkboxOn]}>
                    {selectedIds.includes(item.id) ? <Text style={styles.checkboxMark}>✓</Text> : null}
                  </View>
                </Pressable>

                <Avatar name={item.name} />

                <Pressable
                  style={{ flex: 1, minWidth: 0 }}
                  onPress={() => setExpandedId(open ? null : item.id)}
                >
                  <View style={styles.itemNameRow}>
                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                    <View style={styles.qtyBadge}>
                      <Text style={styles.qtyBadgeText}>×{item.quantity}</Text>
                    </View>
                  </View>

                  {done ? (
                    <View style={styles.portionRow}>
                      {takers.slice(0, 4).map((s) => {
                        const p = draft.participants.find((x) => x.id === s.participantId);
                        return <Avatar key={s.participantId} name={p?.name || "?"} size={18} />;
                      })}
                      <Text style={styles.portionOk}>
                        {assigned}/{item.quantity} porsi
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.portionWarn}>
                      {assigned === 0 ? "Belum dibagi" : `${assigned}/${item.quantity} porsi`}
                    </Text>
                  )}
                </Pressable>

                <Pressable onPress={() => setExpandedId(open ? null : item.id)}>
                  <Text style={styles.itemAmount} numberOfLines={1}>
                    {rupiah(item.price * item.quantity)}
                  </Text>
                </Pressable>
                <Text style={styles.chevron}>{open ? "⌃" : "⌄"}</Text>
              </View>

              {open ? (
                <View style={styles.itemBody}>
                  {draft.participants.length === 0 ? (
                    <Text style={styles.hint}>Tambah pesertanya dulu.</Text>
                  ) : (
                    draft.participants.map((p) => {
                      const share = (item.splits || []).find((s) => s.participantId === p.id);
                      const n = Number(share?.portions) || 0;
                      return (
                        <View key={p.id} style={[styles.stepRow, n > 0 && styles.stepRowOn]}>
                          <Avatar name={p.name} size={30} />
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.stepName} numberOfLines={1}>{p.name}</Text>
                            {n > 0 ? (
                              <Text style={styles.stepMeta}>
                                {rupiah(item.price)} × {n}
                              </Text>
                            ) : null}
                          </View>
                          {n > 0 ? (
                            <Text style={styles.stepAmount}>{rupiah(item.price * n)}</Text>
                          ) : null}
                          <Pressable
                            style={[styles.stepButton, n === 0 && styles.stepButtonOff]}
                            onPress={() => bumpPortion(item, p.id, -1)}
                            disabled={n === 0}
                          >
                            <Text style={styles.stepButtonText}>−</Text>
                          </Pressable>
                          <Text style={styles.stepCount}>{n}</Text>
                          <Pressable
                            style={[styles.stepButton, styles.stepButtonAdd, left <= 0 && styles.disabled]}
                            onPress={() => bumpPortion(item, p.id, 1)}
                            disabled={left <= 0}
                          >
                            <Text style={styles.stepButtonAddText}>＋</Text>
                          </Pressable>
                        </View>
                      );
                    })
                  )}

                  <View style={styles.itemFooter}>
                    {done ? (
                      <Text style={styles.portionOk}>Porsinya sudah pas</Text>
                    ) : (
                      <>
                        <Text style={styles.portionWarn}>
                          ⚠ {assigned}/{item.quantity} porsi terbagi
                        </Text>
                        <Text style={styles.portionWarn}>{left} porsi tersisa</Text>
                      </>
                    )}
                  </View>

                  <View style={styles.itemActions}>
                    <Pressable
                      style={styles.ghostButton}
                      onPress={() => patchItem(item.id, { splits: splitEvenly(item, draft.participants) })}
                    >
                      <Text style={styles.ghostButtonText}>Bagi rata</Text>
                    </Pressable>
                    <Pressable style={styles.dangerButton} onPress={() => removeItem(item.id)}>
                      <Text style={styles.dangerButtonText}>Hapus Item</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}

        {/* ---------------- Total ---------------- */}
        {draft.items.length > 0 ? (
          <View style={styles.totalCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalSub}>
                Termasuk PPN {draft.taxRate}%
                {draft.serviceRate ? ` + service ${draft.serviceRate}%` : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.totalValue}>{rupiah(totals.total)}</Text>
              <Text style={dibagi === draft.items.length ? styles.portionOk : styles.portionWarn}>
                {dibagi}/{draft.items.length} item dibagi
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.row}>
          <Pressable style={[styles.ghostButton, { flex: 1 }]} onPress={shareSummary}>
            <Text style={styles.ghostButtonText}>Bagikan</Text>
          </Pressable>
          <Pressable style={[styles.solidButton, { flex: 1 }]} onPress={() => setShowDetail(true)}>
            <Text style={styles.solidButtonText}>Lihat Detail</Text>
          </Pressable>
        </View>

        <Pressable style={styles.ratesRow} onPress={() => setShowRates(true)}>
          <Text style={styles.ratesLabel}>⚙  Pajak &amp; Service</Text>
          <Text style={styles.ratesValue}>
            PPN {draft.taxRate}%{draft.serviceRate ? ` · ${draft.serviceRate}%` : ""}  ›
          </Text>
        </Pressable>
      </ScrollView>

      {/* --------- Bilah aksi massal --------- */}
      {selectedIds.length > 0 ? (
        <View style={styles.bulkBar}>
          <View style={styles.bulkHead}>
            <Text style={styles.bulkTitle}>{selectedIds.length} Item Dipilih</Text>
            <Pressable onPress={() => setSelectedIds([])}>
              <Text style={styles.bulkClose}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable style={styles.bulkChip} onPress={bulkEven}>
              <Text style={styles.bulkChipText}>Bagi Rata Semua</Text>
            </Pressable>
            <Pressable style={styles.bulkChip} onPress={bulkClear}>
              <Text style={styles.bulkChipText}>Kosongkan Semua</Text>
            </Pressable>
          </View>
          {draft.participants.length > 0 ? (
            <>
              <Text style={styles.bulkHint}>Tambah / hapus orang:</Text>
              <View style={styles.bulkPeople}>
                {draft.participants.map((p) => (
                  <Pressable
                    key={p.id}
                    style={styles.bulkPerson}
                    onPress={() => bulkTogglePerson(p.id)}
                  >
                    <Avatar name={p.name} size={20} />
                    <Text style={styles.bulkPersonText} numberOfLines={1}>{p.name}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {/* --------- Pajak & service --------- */}
      <Modal visible={showRates} animationType="slide" transparent onRequestClose={() => setShowRates(false)}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.sheetWrap}
          >
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Pajak &amp; Service</Text>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>PPN %</Text>
                  <TextInput
                    style={styles.input}
                    value={String(draft.taxRate)}
                    onChangeText={(v) => setRates(digits(v), draft.serviceRate)}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fieldLabel}>Service %</Text>
                  <TextInput
                    style={styles.input}
                    value={String(draft.serviceRate)}
                    onChangeText={(v) => setRates(draft.taxRate, digits(v))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>
              <Text style={styles.fieldLabel}>Tanggal</Text>
              <TextInput
                style={styles.input}
                value={draft.date}
                onChangeText={(v) => patch({ date: v })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.textFaint}
              />
              <Pressable style={styles.solidButton} onPress={() => setShowRates(false)}>
                <Text style={styles.solidButtonText}>Selesai</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* --------- Struk --------- */}
      <Modal visible={showDetail} animationType="slide" onRequestClose={() => setShowDetail(false)}>
        <View style={styles.receiptScreen}>
          <View style={styles.header}>
            <Pressable style={styles.iconButton} onPress={() => setShowDetail(false)}>
              <Text style={styles.iconButtonText}>‹</Text>
            </Pressable>
            <Text style={styles.headerTitle} numberOfLines={1}>{draft.title || "Struk"}</Text>
            <Pressable style={styles.iconButton} onPress={shareSummary}>
              <Text style={styles.iconButtonText}>↗</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
            <View style={styles.receipt}>
              <Text style={styles.receiptBrand}>SplitBill</Text>
              <Text style={styles.receiptTitle}>{(draft.title || "").toUpperCase()}</Text>
              <Text style={styles.receiptDate}>{longDate(draft.date)}</Text>

              <View style={styles.receiptRule} />
              <Text style={styles.receiptSection}>DAFTAR ITEM</Text>
              {draft.items.map((it) => (
                <View key={it.id} style={styles.receiptItem}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.receiptItemName} numberOfLines={1}>{it.name}</Text>
                    <Text style={styles.receiptItemMeta}>
                      {it.quantity} × {rupiah(it.price)}
                    </Text>
                  </View>
                  <Text style={styles.receiptItemAmount}>{rupiah(it.price * it.quantity)}</Text>
                </View>
              ))}

              <View style={styles.receiptRuleThin} />
              <View style={styles.receiptLine}>
                <Text style={styles.receiptLineLabel}>Subtotal</Text>
                <Text style={styles.receiptLineValue}>{rupiah(totals.subtotal)}</Text>
              </View>
              <View style={styles.receiptLine}>
                <Text style={styles.receiptLineLabel}>PPN ({draft.taxRate}%)</Text>
                <Text style={styles.receiptLineValue}>{rupiah(totals.tax)}</Text>
              </View>
              {draft.serviceRate ? (
                <View style={styles.receiptLine}>
                  <Text style={styles.receiptLineLabel}>Service ({draft.serviceRate}%)</Text>
                  <Text style={styles.receiptLineValue}>{rupiah(totals.service)}</Text>
                </View>
              ) : null}
              <View style={styles.receiptLine}>
                <Text style={styles.receiptTotalLabel}>Total</Text>
                <Text style={styles.receiptTotalValue}>{rupiah(totals.total)}</Text>
              </View>

              <View style={styles.receiptRule} />
              <Text style={styles.receiptSection}>PER ORANG</Text>
              {perPerson.map((p) => (
                <View key={p.participantId} style={styles.receiptPerson}>
                  <Avatar name={p.name} size={28} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.receiptPersonName} numberOfLines={1}>{p.name}</Text>
                    <Text style={styles.receiptPersonItems}>
                      {describeParticipantItems(p.participantId, draft.items, draft.participants) || "—"}
                    </Text>
                    <Text style={styles.receiptPersonMath}>
                      {rupiah(p.subtotal)} + {rupiah(p.taxShare + p.serviceShare)} pajak/service
                    </Text>
                  </View>
                  <Text style={styles.receiptPersonTotal}>{rupiah(p.total)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // maxWidth: di HP tidak berpengaruh, tapi mencegah form melar di preview
  // browser yang lebar.
  content: {
    alignSelf: "center",
    gap: 12,
    maxWidth: 560,
    padding: 20,
    paddingBottom: 140,
    width: "100%",
  },
  receiptScreen: { backgroundColor: colors.bgGradient[1], flex: 1, paddingTop: TOP_INSET },

  header: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 12 },
  headerTitle: { color: colors.text, flex: 1, fontSize: 24, fontWeight: "900" },
  titleInput: { color: colors.text, flex: 1, fontSize: 22, fontWeight: "900", padding: 0 },
  iconButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  iconButtonText: { color: colors.text, fontSize: 19, fontWeight: "900" },
  saveButton: { backgroundColor: colors.accent[0], borderColor: colors.accent[0] },
  saveButtonText: { color: "#ffffff", fontSize: 19, fontWeight: "900" },

  tagline: { color: colors.text, fontSize: 19, fontWeight: "900" },
  taglineSub: { color: colors.textMuted, fontSize: 13, fontWeight: "600", marginTop: 4 },

  sectionLabel: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginTop: 8,
  },

  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#0b2231", fontWeight: "900" },

  dashedButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderStyle: "dashed",
    borderWidth: 1.5,
    paddingVertical: 18,
  },
  dashedButtonText: { color: colors.textMuted, fontSize: 14, fontWeight: "800" },

  outlineButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 14,
  },
  outlineButtonText: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },

  inlineForm: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  formButtons: { flexDirection: "row", gap: 10 },
  row: { flexDirection: "row", gap: 10 },

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
  fieldLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "800", marginBottom: 6 },
  hint: { color: colors.textFaint, fontSize: 12, fontWeight: "600" },

  ghostButton: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 13,
  },
  ghostButtonText: { color: colors.text, fontSize: 13, fontWeight: "800" },
  solidButton: {
    alignItems: "center",
    backgroundColor: colors.accent[0],
    borderRadius: radius.md,
    flex: 1,
    paddingVertical: 13,
  },
  solidButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  dangerButton: { alignItems: "center", flex: 1, paddingVertical: 13 },
  dangerButtonText: { color: colors.negative, fontSize: 13, fontWeight: "800" },

  personRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  personName: { color: colors.text, fontSize: 14, fontWeight: "800" },
  personOwed: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  selectAllRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  checkRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  checkbox: {
    alignItems: "center",
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  checkbox2: { paddingRight: 2 },
  checkboxOn: { backgroundColor: colors.accent[0], borderColor: colors.accent[0] },
  checkboxMark: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  selectAllText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  selectCount: { color: colors.textFaint, fontSize: 12, fontWeight: "700" },

  itemCard: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  itemCardOpen: { borderColor: colors.accent[0] },
  itemHead: { alignItems: "center", flexDirection: "row", gap: 10, padding: 12 },
  itemNameRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  itemName: { color: colors.text, flexShrink: 1, fontSize: 14, fontWeight: "900" },
  qtyBadge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  qtyBadgeText: { color: colors.textMuted, fontSize: 10, fontWeight: "800" },
  itemAmount: { color: colors.text, flexShrink: 0, fontSize: 14, fontWeight: "900" },
  chevron: { color: colors.textFaint, fontSize: 14, fontWeight: "900" },

  portionRow: { alignItems: "center", flexDirection: "row", gap: 4, marginTop: 4 },
  portionOk: { color: colors.positive, fontSize: 11, fontWeight: "800" },
  portionWarn: { color: "#fcd34d", fontSize: 11, fontWeight: "800", marginTop: 3 },

  itemBody: {
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    gap: 8,
    padding: 12,
  },
  stepRow: {
    alignItems: "center",
    borderRadius: radius.sm,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  stepRowOn: { backgroundColor: colors.surfaceMuted },
  stepName: { color: colors.text, fontSize: 13, fontWeight: "800" },
  stepMeta: { color: colors.textFaint, fontSize: 10, fontWeight: "700", marginTop: 1 },
  stepAmount: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  stepButton: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  stepButtonOff: { opacity: 0.4 },
  stepButtonText: { color: colors.text, fontSize: 16, fontWeight: "900" },
  stepButtonAdd: { backgroundColor: colors.accent[0], borderColor: colors.accent[0] },
  stepButtonAddText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  stepCount: { color: colors.text, fontSize: 14, fontWeight: "900", minWidth: 18, textAlign: "center" },

  itemFooter: {
    alignItems: "center",
    borderTopColor: colors.divider,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
  },
  itemActions: { flexDirection: "row", gap: 10 },

  totalCard: {
    alignItems: "center",
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    padding: 16,
  },
  totalLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },
  totalSub: { color: colors.textFaint, fontSize: 11, fontWeight: "700", marginTop: 3 },
  totalValue: { color: colors.text, fontSize: 22, fontWeight: "900" },

  ratesRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  ratesLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },
  ratesValue: { color: colors.textFaint, fontSize: 12, fontWeight: "800" },

  bulkBar: {
    backgroundColor: "#06293d",
    borderTopColor: colors.border,
    borderTopWidth: 1,
    bottom: 0,
    gap: 10,
    left: 0,
    padding: 16,
    paddingBottom: 24,
    position: "absolute",
    right: 0,
    ...shadow.raised,
  },
  bulkHead: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  bulkTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  bulkClose: { color: colors.textMuted, fontSize: 16, fontWeight: "900" },
  bulkChip: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  bulkChipText: { color: colors.text, fontSize: 12, fontWeight: "800" },
  bulkHint: { color: colors.textFaint, fontSize: 11, fontWeight: "700" },
  bulkPeople: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bulkPerson: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    maxWidth: 150,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  bulkPersonText: { color: colors.text, fontSize: 12, fontWeight: "800" },

  billCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  billTitle: { color: colors.text, fontSize: 14, fontWeight: "900" },
  billMeta: { color: colors.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  billAmount: { color: colors.text, flexShrink: 0, fontSize: 13, fontWeight: "900" },

  xButton: {
    alignItems: "center",
    backgroundColor: "rgba(251,113,133,0.16)",
    borderRadius: radius.pill,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  xButtonText: { color: colors.negative, fontSize: 12, fontWeight: "900" },

  backdrop: { backgroundColor: "rgba(2, 16, 26, 0.6)", flex: 1, justifyContent: "flex-end" },
  sheetWrap: { flexShrink: 1, maxHeight: "88%" },
  sheet: {
    backgroundColor: colors.surfaceSolid,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    flexShrink: 1,
    gap: 10,
    padding: 20,
  },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: "900" },

  receipt: {
    alignSelf: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: radius.lg,
    borderWidth: 1,
    maxWidth: 480,
    padding: 20,
    width: "100%",
    ...shadow.card,
  },
  receiptBrand: { color: colors.text, fontSize: 20, fontWeight: "900", textAlign: "center" },
  receiptTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginTop: 6,
    textAlign: "center",
  },
  receiptDate: { color: colors.textFaint, fontSize: 11, fontWeight: "700", marginTop: 3, textAlign: "center" },
  receiptRule: { backgroundColor: colors.border, height: 2, marginVertical: 16 },
  receiptRuleThin: { backgroundColor: colors.divider, height: 1, marginVertical: 12 },
  receiptSection: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  receiptItem: { flexDirection: "row", gap: 10, marginBottom: 10 },
  receiptItemName: { color: colors.text, fontSize: 13, fontWeight: "800" },
  receiptItemMeta: { color: colors.textFaint, fontSize: 11, fontWeight: "600", marginTop: 2 },
  receiptItemAmount: { color: colors.text, fontSize: 13, fontWeight: "900" },
  receiptLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  receiptLineLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  receiptLineValue: { color: colors.text, fontSize: 12, fontWeight: "800" },
  receiptTotalLabel: { color: colors.text, fontSize: 15, fontWeight: "900" },
  receiptTotalValue: { color: colors.accent[0], fontSize: 16, fontWeight: "900" },
  receiptPerson: { alignItems: "flex-start", flexDirection: "row", gap: 10, marginBottom: 14 },
  receiptPersonName: { color: colors.text, fontSize: 13, fontWeight: "900" },
  receiptPersonItems: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 2 },
  receiptPersonMath: { color: colors.textFaint, fontSize: 10, fontWeight: "600", marginTop: 2 },
  receiptPersonTotal: { color: colors.text, fontSize: 14, fontWeight: "900" },

  errorPanel: { backgroundColor: "rgba(251,113,133,0.16)", borderRadius: radius.md, padding: 12 },
  errorText: { color: colors.negative, fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.4 },
});
