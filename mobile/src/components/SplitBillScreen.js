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

// Lapisan tipis di atas theme.js. Warnanya sama persis dengan layar lain --
// yang dibeli lewat lapisan ini cuma satu tempat kalau suatu saat layar ini
// perlu palet sendiri lagi.
const C = {
  bg: colors.bgGradient[1],
  surface: colors.surface,
  surfaceMuted: colors.surfaceMuted,
  border: colors.border,
  divider: colors.divider,
  text: colors.text,
  textMuted: colors.textMuted,
  textFaint: colors.textFaint,
  solid: colors.accent[0],
  ok: colors.positive,
  warn: "#fcd34d",
  danger: colors.negative,
};

const softShadow = shadow.card;

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

  // Memberi nama bill adalah langkahnya sendiri sebelum peserta dan item,
  // bukan satu kolom yang nyempil di antara keduanya.
  const [creating, setCreating] = useState(false);
  const [newBill, setNewBill] = useState({ title: "", date: today() });

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

  // ======================= LANGKAH 1: NAMA =======================
  if (creating) {
    const ready = newBill.title.trim().length > 0;
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={() => setCreating(false)}>
            <Text style={styles.iconButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Bill Baru</Text>
          <View style={{ width: 42 }} />
        </View>

        <Text style={styles.createHint}>
          Kasih nama dulu, biar gampang dicari nanti.
        </Text>

        <Text style={styles.fieldLabel}>Nama bill</Text>
        <TextInput
          style={styles.input}
          value={newBill.title}
          onChangeText={(v) => setNewBill((b) => ({ ...b, title: v }))}
          placeholder="Makan di mana?"
          placeholderTextColor={C.textFaint}
          autoFocus
          returnKeyType="next"
        />

        <Text style={styles.fieldLabel}>Tanggal</Text>
        <TextInput
          style={styles.input}
          value={newBill.date}
          onChangeText={(v) => setNewBill((b) => ({ ...b, date: v }))}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={C.textFaint}
        />

        <Pressable
          style={[styles.solidButton, !ready && styles.disabled]}
          disabled={!ready}
          onPress={() => {
            setDraft({ ...emptyDraft(), title: newBill.title.trim(), date: newBill.date });
            setSelectedIds([]);
            setExpandedId(null);
            setCreating(false);
          }}
        >
          <Text style={styles.solidButtonText}>Lanjut</Text>
        </Pressable>
      </ScrollView>
    );
  }

  // ============================ DAFTAR ============================
  if (!draft) {
    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
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

        <Pressable
          style={styles.dashedButton}
          onPress={() => {
            setNewBill({ title: "", date: today() });
            setCreating(true);
          }}
        >
          <Text style={styles.dashedButtonText}>+  Bikin Bill Baru</Text>
        </Pressable>

        {isLoading ? (
          <ActivityIndicator color={C.solid} style={{ marginTop: 20 }} />
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
        style={styles.screen}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable style={styles.iconButton} onPress={() => setDraft(null)}>
            <Text style={styles.iconButtonText}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {draft.title}
          </Text>
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
              placeholderTextColor={C.textFaint}
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
              placeholderTextColor={C.textFaint}
              autoFocus
            />
            <View style={styles.row}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                value={itemForm.price}
                onChangeText={(v) => setItemForm((f) => ({ ...f, price: v }))}
                placeholder="Harga (Rp)"
                placeholderTextColor={C.textFaint}
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
              <Text style={styles.sheetTitle}>Pengaturan bill</Text>

              <Text style={styles.fieldLabel}>Nama bill</Text>
              <TextInput
                style={styles.input}
                value={draft.title}
                onChangeText={(v) => patch({ title: v })}
                placeholder="Nama bill"
                placeholderTextColor={C.textFaint}
              />

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
                placeholderTextColor={C.textFaint}
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
  screen: { flex: 1 },
  receiptScreen: { backgroundColor: C.bg, flex: 1, paddingTop: TOP_INSET },

  header: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 12 },
  headerTitle: { color: C.text, flex: 1, fontSize: 24, fontWeight: "900" },
  iconButton: {
    alignItems: "center",
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  iconButtonText: { color: C.text, fontSize: 19, fontWeight: "900" },
  saveButton: { backgroundColor: C.solid, borderColor: C.solid },
  saveButtonText: { color: "#ffffff", fontSize: 19, fontWeight: "900" },

  tagline: { color: C.text, fontSize: 19, fontWeight: "900" },
  taglineSub: { color: C.textMuted, fontSize: 13, fontWeight: "600", marginTop: 4 },

  sectionLabel: {
    color: C.textFaint,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginTop: 8,
  },

  avatar: { alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#0b2231", fontWeight: "900" },

  dashedButton: {
    alignItems: "center",
    borderColor: C.border,
    borderRadius: radius.md,
    borderStyle: "dashed",
    borderWidth: 1.5,
    paddingVertical: 18,
  },
  dashedButtonText: { color: C.textMuted, fontSize: 14, fontWeight: "800" },

  outlineButton: {
    alignItems: "center",
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: 14,
  },
  outlineButtonText: { color: C.textMuted, fontSize: 13, fontWeight: "800" },

  inlineForm: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  formButtons: { flexDirection: "row", gap: 10 },
  row: { flexDirection: "row", gap: 10 },

  input: {
    backgroundColor: C.surfaceMuted,
    borderColor: C.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: C.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  fieldLabel: { color: C.textMuted, fontSize: 12, fontWeight: "800", marginBottom: 6 },
  hint: { color: C.textFaint, fontSize: 12, fontWeight: "600" },

  ghostButton: {
    alignItems: "center",
    borderColor: C.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 13,
  },
  ghostButtonText: { color: C.text, fontSize: 13, fontWeight: "800" },
  solidButton: {
    alignItems: "center",
    backgroundColor: C.solid,
    borderRadius: radius.md,
    flex: 1,
    paddingVertical: 13,
  },
  solidButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  dangerButton: { alignItems: "center", flex: 1, paddingVertical: 13 },
  dangerButtonText: { color: C.danger, fontSize: 13, fontWeight: "800" },

  personRow: {
    alignItems: "center",
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  personName: { color: C.text, fontSize: 14, fontWeight: "800" },
  personOwed: { color: C.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 },

  selectAllRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  checkRow: { alignItems: "center", flexDirection: "row", gap: 10 },
  checkbox: {
    alignItems: "center",
    borderColor: C.border,
    borderRadius: 6,
    borderWidth: 1.5,
    height: 20,
    justifyContent: "center",
    width: 20,
  },
  checkbox2: { paddingRight: 2 },
  checkboxOn: { backgroundColor: C.solid, borderColor: C.solid },
  checkboxMark: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  selectAllText: { color: C.textMuted, fontSize: 13, fontWeight: "700" },
  selectCount: { color: C.textFaint, fontSize: 12, fontWeight: "700" },

  itemCard: {
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: radius.md,
    borderWidth: 1,
    overflow: "hidden",
  },
  itemCardOpen: { borderColor: C.solid },
  itemHead: { alignItems: "center", flexDirection: "row", gap: 10, padding: 12 },
  itemNameRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  itemName: { color: C.text, flexShrink: 1, fontSize: 14, fontWeight: "900" },
  qtyBadge: {
    backgroundColor: C.surfaceMuted,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  qtyBadgeText: { color: C.textMuted, fontSize: 10, fontWeight: "800" },
  itemAmount: { color: C.text, flexShrink: 0, fontSize: 14, fontWeight: "900" },
  chevron: { color: C.textFaint, fontSize: 14, fontWeight: "900" },

  portionRow: { alignItems: "center", flexDirection: "row", gap: 4, marginTop: 4 },
  portionOk: { color: C.ok, fontSize: 11, fontWeight: "800" },
  portionWarn: { color: C.warn, fontSize: 11, fontWeight: "800", marginTop: 3 },

  itemBody: {
    borderTopColor: C.divider,
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
  stepRowOn: { backgroundColor: C.surfaceMuted },
  stepName: { color: C.text, fontSize: 13, fontWeight: "800" },
  stepMeta: { color: C.textFaint, fontSize: 10, fontWeight: "700", marginTop: 1 },
  stepAmount: { color: C.textMuted, fontSize: 12, fontWeight: "800" },
  stepButton: {
    alignItems: "center",
    backgroundColor: C.surfaceMuted,
    borderColor: C.border,
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  stepButtonOff: { opacity: 0.4 },
  stepButtonText: { color: C.text, fontSize: 16, fontWeight: "900" },
  stepButtonAdd: { backgroundColor: C.solid, borderColor: C.solid },
  stepButtonAddText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  stepCount: { color: C.text, fontSize: 14, fontWeight: "900", minWidth: 18, textAlign: "center" },

  itemFooter: {
    alignItems: "center",
    borderTopColor: C.divider,
    borderTopWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 10,
  },
  itemActions: { flexDirection: "row", gap: 10 },

  totalCard: {
    alignItems: "center",
    backgroundColor: C.surfaceMuted,
    borderRadius: radius.md,
    flexDirection: "row",
    gap: 12,
    marginTop: 6,
    padding: 16,
  },
  totalLabel: { color: C.textMuted, fontSize: 13, fontWeight: "800" },
  totalSub: { color: C.textFaint, fontSize: 11, fontWeight: "700", marginTop: 3 },
  totalValue: { color: C.text, fontSize: 22, fontWeight: "900" },

  ratesRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
  },
  ratesLabel: { color: C.textMuted, fontSize: 13, fontWeight: "800" },
  createHint: { color: C.textMuted, fontSize: 13, fontWeight: "600", marginBottom: 4 },
  ratesValue: { color: C.textFaint, fontSize: 12, fontWeight: "800" },

  bulkBar: {
    backgroundColor: "#06293d",
    borderTopColor: C.border,
    borderTopWidth: 1,
    bottom: 0,
    gap: 10,
    left: 0,
    padding: 16,
    paddingBottom: 24,
    position: "absolute",
    right: 0,
    ...softShadow,
  },
  bulkHead: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  bulkTitle: { color: C.text, fontSize: 14, fontWeight: "900" },
  bulkClose: { color: C.textMuted, fontSize: 16, fontWeight: "900" },
  bulkChip: {
    alignItems: "center",
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 10,
  },
  bulkChipText: { color: C.text, fontSize: 12, fontWeight: "800" },
  bulkHint: { color: C.textFaint, fontSize: 11, fontWeight: "700" },
  bulkPeople: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bulkPerson: {
    alignItems: "center",
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    maxWidth: 150,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  bulkPersonText: { color: C.text, fontSize: 12, fontWeight: "800" },

  billCard: {
    alignItems: "center",
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  billTitle: { color: C.text, fontSize: 14, fontWeight: "900" },
  billMeta: { color: C.textMuted, fontSize: 11, fontWeight: "700", marginTop: 2 },
  billAmount: { color: C.text, flexShrink: 0, fontSize: 13, fontWeight: "900" },

  xButton: {
    alignItems: "center",
    backgroundColor: "rgba(251,113,133,0.16)",
    borderRadius: radius.pill,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  xButtonText: { color: C.danger, fontSize: 12, fontWeight: "900" },

  backdrop: { backgroundColor: "rgba(2, 16, 26, 0.6)", flex: 1, justifyContent: "flex-end" },
  sheetWrap: { flexShrink: 1, maxHeight: "88%" },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    flexShrink: 1,
    gap: 10,
    padding: 20,
  },
  sheetTitle: { color: C.text, fontSize: 18, fontWeight: "900" },

  receipt: {
    alignSelf: "center",
    backgroundColor: C.surface,
    borderColor: C.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    maxWidth: 480,
    padding: 20,
    width: "100%",
    ...softShadow,
  },
  receiptBrand: { color: C.text, fontSize: 20, fontWeight: "900", textAlign: "center" },
  receiptTitle: {
    color: C.textMuted,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.6,
    marginTop: 6,
    textAlign: "center",
  },
  receiptDate: { color: C.textFaint, fontSize: 11, fontWeight: "700", marginTop: 3, textAlign: "center" },
  receiptRule: { backgroundColor: C.border, height: 2, marginVertical: 16 },
  receiptRuleThin: { backgroundColor: C.divider, height: 1, marginVertical: 12 },
  receiptSection: {
    color: C.textFaint,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  receiptItem: { flexDirection: "row", gap: 10, marginBottom: 10 },
  receiptItemName: { color: C.text, fontSize: 13, fontWeight: "800" },
  receiptItemMeta: { color: C.textFaint, fontSize: 11, fontWeight: "600", marginTop: 2 },
  receiptItemAmount: { color: C.text, fontSize: 13, fontWeight: "900" },
  receiptLine: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  receiptLineLabel: { color: C.textMuted, fontSize: 12, fontWeight: "700" },
  receiptLineValue: { color: C.text, fontSize: 12, fontWeight: "800" },
  receiptTotalLabel: { color: C.text, fontSize: 15, fontWeight: "900" },
  receiptTotalValue: { color: C.solid, fontSize: 16, fontWeight: "900" },
  receiptPerson: { alignItems: "flex-start", flexDirection: "row", gap: 10, marginBottom: 14 },
  receiptPersonName: { color: C.text, fontSize: 13, fontWeight: "900" },
  receiptPersonItems: { color: C.textMuted, fontSize: 11, fontWeight: "600", marginTop: 2 },
  receiptPersonMath: { color: C.textFaint, fontSize: 10, fontWeight: "600", marginTop: 2 },
  receiptPersonTotal: { color: C.text, fontSize: 14, fontWeight: "900" },

  errorPanel: { backgroundColor: "rgba(251,113,133,0.16)", borderRadius: radius.md, padding: 12 },
  errorText: { color: C.danger, fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.4 },
});
