import { useEffect, useMemo, useState } from "react";
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
  Alert,
} from "react-native";
import {
  getJournals,
  addJournal,
  updateJournal,
  deleteJournal,
} from "../services/supabase";
import { colors, radius, shadow } from "../theme";

const MOODS = ["😊", "😁", "😌", "🥲", "😐", "😔"];

const emptyDraft = { title: "", body: "", mood: "😊" };

// Dipisah dari utils/date.js milik money tracker: entri journal disimpan
// sebagai timestamp penuh (created_at), bukan tanggal polos seperti transaksi.
const formatStamp = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
};

const dayKey = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
};

const preview = (text, length = 90) => {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length)}…` : clean;
};

export default function JournalScreen({ onBack }) {
  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [isComposerOpen, setComposerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [isSaving, setIsSaving] = useState(false);

  const [openEntry, setOpenEntry] = useState(null);

  const load = async () => {
    setError("");
    setIsLoading(true);
    try {
      setEntries(await getJournals());
    } catch (err) {
      setError(err.message || "Gagal mengambil journal.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const totalKata = entries.reduce(
      (sum, e) => sum + e.body.trim().split(/\s+/).filter(Boolean).length,
      0
    );
    const hari = new Set(entries.map((e) => dayKey(e.createdAt))).size;
    return { total: entries.length, totalKata, hari };
  }, [entries]);

  const openNew = () => {
    setEditingId(null);
    setDraft(emptyDraft);
    setComposerOpen(true);
  };

  const openEdit = (entry) => {
    setEditingId(entry.id);
    setDraft({ title: entry.title, body: entry.body, mood: entry.mood });
    setOpenEntry(null);
    setComposerOpen(true);
  };

  const closeComposer = () => {
    setComposerOpen(false);
    setEditingId(null);
    setDraft(emptyDraft);
  };

  const save = async () => {
    const body = draft.body.trim();
    if (!body || isSaving) return;

    setIsSaving(true);
    setError("");
    try {
      const payload = { title: draft.title.trim(), body, mood: draft.mood };
      if (editingId) {
        const updated = await updateJournal(editingId, payload);
        setEntries((current) =>
          current.map((e) => (e.id === editingId ? updated : e))
        );
      } else {
        const created = await addJournal(payload);
        setEntries((current) => [created, ...current]);
      }
      closeComposer();
    } catch (err) {
      setError(err.message || "Gagal menyimpan journal.");
    } finally {
      setIsSaving(false);
    }
  };

  const confirmRemove = (entry) => {
    Alert.alert(
      "Hapus journal",
      `${entry.title || "Tanpa judul"}\n${formatStamp(entry.createdAt)}\n\nTidak bisa dibatalkan.`,
      [
        { text: "Batal", style: "cancel" },
        {
          text: "Hapus",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteJournal(entry.id);
              setEntries((current) => current.filter((e) => e.id !== entry.id));
              setOpenEntry(null);
            } catch (err) {
              setError(err.message || "Gagal menghapus journal.");
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>‹</Text>
        </Pressable>
        <Text style={styles.title}>Journal</Text>
        <Pressable style={styles.backButton} onPress={load}>
          <Text style={styles.backButtonText}>⟳</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.errorPanel}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.statRow}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total journal</Text>
          <Text style={styles.statValue}>{stats.total}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Total kata</Text>
          <Text style={styles.statValue}>
            {stats.totalKata.toLocaleString("id-ID")}
          </Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>Hari</Text>
          <Text style={styles.statValue}>{stats.hari}</Text>
        </View>
      </View>

      <Pressable style={styles.newButton} onPress={openNew}>
        <Text style={styles.newButtonText}>+ Tulis journal</Text>
      </Pressable>

      {isLoading ? (
        <View style={styles.loadingPanel}>
          <ActivityIndicator color={colors.accent[0]} />
        </View>
      ) : entries.length === 0 ? (
        <View style={styles.emptyPanel}>
          <Text style={styles.emptyText}>
            Belum ada journal. Tap "Tulis journal" buat mulai.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {entries.map((entry) => (
            <Pressable
              key={entry.id}
              style={styles.entryCard}
              onPress={() => setOpenEntry(entry)}
            >
              <Text style={styles.entryMood}>{entry.mood}</Text>
              <View style={styles.entryBody}>
                <Text style={styles.entryTitle} numberOfLines={1}>
                  {entry.title || "Tanpa judul"}
                </Text>
                <Text style={styles.entryPreview} numberOfLines={2}>
                  {preview(entry.body)}
                </Text>
                <Text style={styles.entryMeta}>
                  {formatStamp(entry.createdAt)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* Baca satu entri utuh, dengan jalan ke ubah dan hapus. */}
      <Modal
        visible={!!openEntry}
        animationType="slide"
        transparent
        onRequestClose={() => setOpenEntry(null)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sheetMood}>{openEntry?.mood}</Text>
              <Text style={styles.sheetTitle}>
                {openEntry?.title || "Tanpa judul"}
              </Text>
              <Text style={styles.sheetMeta}>
                {openEntry ? formatStamp(openEntry.createdAt) : ""}
              </Text>
              <Text style={styles.sheetBody}>{openEntry?.body}</Text>

              <View style={styles.sheetActions}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => openEdit(openEntry)}
                >
                  <Text style={styles.primaryButtonText}>Ubah</Text>
                </Pressable>
                <Pressable
                  style={styles.dangerButton}
                  onPress={() => confirmRemove(openEntry)}
                >
                  <Text style={styles.dangerButtonText}>Hapus</Text>
                </Pressable>
              </View>

              <Pressable
                style={styles.cancelButton}
                onPress={() => setOpenEntry(null)}
              >
                <Text style={styles.cancelButtonText}>Tutup</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Tulis / ubah entri. */}
      <Modal
        visible={isComposerOpen}
        animationType="slide"
        transparent
        onRequestClose={closeComposer}
      >
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.sheetWrap}
          >
            <View style={styles.sheet}>
              <ScrollView
                style={{ flexShrink: 1 }}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.sheetTitle}>
                  {editingId ? "Ubah journal" : "Journal baru"}
                </Text>

                <Text style={styles.label}>Lagi gimana perasaannya?</Text>
                <View style={styles.moodRow}>
                  {MOODS.map((m) => (
                    <Pressable
                      key={m}
                      style={[
                        styles.moodButton,
                        draft.mood === m && styles.moodButtonActive,
                      ]}
                      onPress={() => setDraft((d) => ({ ...d, mood: m }))}
                    >
                      <Text style={styles.moodButtonText}>{m}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.label}>Judul</Text>
                <TextInput
                  style={styles.input}
                  value={draft.title}
                  onChangeText={(v) => setDraft((d) => ({ ...d, title: v }))}
                  placeholder="Opsional"
                  placeholderTextColor={colors.textFaint}
                />

                <Text style={styles.label}>Isi</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={draft.body}
                  onChangeText={(v) => setDraft((d) => ({ ...d, body: v }))}
                  placeholder="Tulis apa aja..."
                  placeholderTextColor={colors.textFaint}
                  multiline
                  textAlignVertical="top"
                />

                <Pressable
                  style={[
                    styles.primaryButton,
                    (!draft.body.trim() || isSaving) && styles.disabled,
                  ]}
                  onPress={save}
                  disabled={!draft.body.trim() || isSaving}
                >
                  {isSaving ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.primaryButtonText}>
                      {editingId ? "Simpan perubahan" : "Simpan"}
                    </Text>
                  )}
                </Pressable>

                <Pressable style={styles.cancelButton} onPress={closeComposer}>
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
  header: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 12 },
  title: { color: colors.text, fontSize: 28, fontWeight: "900" },
  backButton: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.surfaceBorder, borderRadius: 18, borderWidth: 1, height: 36, justifyContent: "center", width: 36 },
  backButtonText: { color: colors.text, fontSize: 20, fontWeight: "900" },

  statRow: { flexDirection: "row", gap: 10 },
  statCard: { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, borderRadius: radius.lg, borderWidth: 1, flex: 1, padding: 14, ...shadow.card },
  statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
  statValue: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 4 },

  newButton: { alignItems: "center", backgroundColor: colors.accent[0], borderRadius: radius.md, paddingVertical: 14, ...shadow.raised },
  newButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },

  list: { gap: 10 },
  entryCard: { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, borderRadius: radius.lg, borderWidth: 1, flexDirection: "row", gap: 12, padding: 14, ...shadow.card },
  entryMood: { fontSize: 24 },
  entryBody: { flex: 1 },
  entryTitle: { color: colors.text, fontSize: 15, fontWeight: "900" },
  entryPreview: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 3 },
  entryMeta: { color: colors.textFaint, fontSize: 11, fontWeight: "700", marginTop: 6 },

  loadingPanel: { alignItems: "center", padding: 30 },
  emptyPanel: { backgroundColor: colors.surface, borderColor: colors.surfaceBorder, borderRadius: radius.lg, borderWidth: 1, padding: 24 },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
  errorPanel: { backgroundColor: "#fee2e2", borderRadius: radius.md, padding: 12 },
  errorText: { color: colors.negative, fontSize: 13, fontWeight: "700" },

  backdrop: { backgroundColor: "rgba(15, 23, 42, 0.55)", flex: 1, justifyContent: "flex-end" },
  sheetWrap: { justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceSolid, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, maxHeight: "88%", padding: 20 },
  sheetMood: { fontSize: 32 },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 6 },
  sheetMeta: { color: colors.textFaint, fontSize: 12, fontWeight: "700", marginTop: 4 },
  sheetBody: { color: colors.text, fontSize: 15, lineHeight: 23, marginTop: 14 },
  sheetActions: { flexDirection: "row", gap: 10, marginTop: 20 },

  label: { color: colors.textMuted, fontSize: 12, fontWeight: "800", marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, color: colors.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 11 },
  inputMultiline: { minHeight: 150 },

  moodRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  moodButton: { alignItems: "center", backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, height: 44, justifyContent: "center", width: 44 },
  moodButtonActive: { backgroundColor: "#fce7f3", borderColor: colors.accent[0] },
  moodButtonText: { fontSize: 20 },

  primaryButton: { alignItems: "center", backgroundColor: colors.accent[0], borderRadius: radius.md, flex: 1, marginTop: 18, paddingVertical: 14 },
  primaryButtonText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  dangerButton: { alignItems: "center", backgroundColor: "#fff1f2", borderColor: "#fecdd3", borderRadius: radius.md, borderWidth: 1, flex: 1, marginTop: 18, paddingVertical: 14 },
  dangerButtonText: { color: colors.negative, fontSize: 14, fontWeight: "900" },
  cancelButton: { alignItems: "center", paddingVertical: 14 },
  cancelButtonText: { color: colors.textMuted, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.5 },
});
