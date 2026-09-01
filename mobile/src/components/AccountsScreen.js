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
import { findCreditCardForSource } from "../utils/accountBalance";
import { getCurrentCycleStart, getStatementDay } from "../utils/billingCycle";
import { getInstallmentBaseTitle } from "../utils/installmentTitle";
import Dropdown from "./Dropdown";

const ACCOUNT_TYPES = ["Bank", "Tabungan", "E-Wallet", "Kartu Kredit", "Tunai"];
const CARD_COLORS = ["#0f172a", "#1e293b", "#1d4ed8", "#78350f", "#1e3a8a"];

const generateId = () =>
  `acc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

// Format tampilan sambil ngetik: titik = pemisah ribuan, koma = pemisah desimal (sen), dan tanda minus di depan.
const formatThousands = (value) => {
  const raw = String(value || "").replace(/[^\d,-]/g, "");
  const isNegative = raw.startsWith("-");
  const rawNoMinus = raw.replace(/-/g, "");
  
  const commaIndex = rawNoMinus.indexOf(",");
  const intRaw = (commaIndex === -1 ? rawNoMinus : rawNoMinus.slice(0, commaIndex)).replace(/[^\d]/g, "");
  const formattedInt = intRaw ? new Intl.NumberFormat("id-ID").format(Number(intRaw)) : "";

  if (commaIndex === -1) return isNegative && formattedInt ? `-${formattedInt}` : isNegative ? "-" : formattedInt;

  const decRaw = rawNoMinus.slice(commaIndex + 1).replace(/[^\d]/g, "").slice(0, 2);
  const formattedWithDec = `${formattedInt || "0"},${decRaw}`;
  return isNegative ? `-${formattedWithDec}` : formattedWithDec;
};

// Nilai final: gabung bulat + desimal, dibulatin ke atas (Rupiah nggak ada sen beredar), dengan minus sign support.
const parseAmountRounded = (value) => {
  const raw = String(value || "");
  const isNegative = raw.trim().startsWith("-");
  const rawNoMinus = raw.replace(/-/g, "");
  
  const commaIndex = rawNoMinus.indexOf(",");
  const intRaw = (commaIndex === -1 ? rawNoMinus : rawNoMinus.slice(0, commaIndex)).replace(/[^\d]/g, "");
  const decRaw = commaIndex === -1 ? "" : rawNoMinus.slice(commaIndex + 1).replace(/[^\d]/g, "");

  if (!intRaw && !decRaw) return 0;

  const num = Math.ceil(Number(`${intRaw || "0"}.${decRaw || "0"}`));
  return isNegative ? -num : num;
};

const emptyNewAccount = {
  name: "",
  type: "Bank",
  startingBalance: "",
  issuer: "",
  productName: "",
  sharesLimit: false,
  totalLimit: "",
  dueDate: "",
  color: CARD_COLORS[0],
};

export default function AccountsScreen({ accounts, onAdd, onDelete, onUpdateBalance, onUpdateFields, installments = [], onDeleteInstallment, transactions = [], onDeleteTransaction }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editBalanceVal, setEditBalanceVal] = useState("");
  const [editCardVal, setEditCardVal] = useState({ startingBalance: "", totalLimit: "", dueDate: "" });
  const [newAccount, setNewAccount] = useState(emptyNewAccount);
  const [isSaving, setIsSaving] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAccountId, setPaymentAccountId] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", date: new Date().toISOString().split("T")[0] });
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState({});

  const toggleGroup = (groupKey) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  const isCreditCardForm = newAccount.type === "Kartu Kredit";

  const totalBalance = useMemo(
    () => accounts.reduce((sum, a) => sum + (Number(a.startingBalance) || 0), 0),
    [accounts]
  );

  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [accounts, searchQuery]);

  const regularAccounts = useMemo(
    () => filteredAccounts.filter((a) => a.type !== "Kartu Kredit"),
    [filteredAccounts]
  );

  const creditCardAccounts = useMemo(
    () => filteredAccounts.filter((a) => a.type === "Kartu Kredit"),
    [filteredAccounts]
  );

  const creditCardTotals = useMemo(() => {
    let totalLimit = 0;
    let used = 0;

    // `starting_balance` udah nyakup semua transaksi cicilan (parent + tiap
    // cicilan bulanan dicatet lewat ledger transaksi biasa), jadi nggak perlu
    // nambahin installments.remainingBalance lagi -- itu dobel hitung.
    creditCardAccounts.forEach(a => {
        totalLimit += (Number(a.totalLimit) || 0);
        used += (Number(a.startingBalance) || 0);
    });

    const utilization = totalLimit > 0 ? (used / totalLimit) * 100 : 0;
    return { totalLimit, used, remaining: totalLimit - used, utilization };
  }, [creditCardAccounts]);

  const handleAddSubmit = async () => {
    if (!newAccount.name.trim()) return;
    setIsSaving(true);
    try {
      await onAdd({
        id: generateId(),
        name: newAccount.name.trim(),
        type: newAccount.type,
        startingBalance: parseAmountRounded(newAccount.startingBalance),
        ...(isCreditCardForm && {
          issuer: newAccount.issuer.trim(),
          productName: newAccount.productName.trim(),
          sharesLimit: newAccount.sharesLimit,
          totalLimit: parseAmountRounded(newAccount.totalLimit),
          dueDate: newAccount.dueDate ? Number(newAccount.dueDate) : null,
          color: newAccount.color,
        }),
      });
      setNewAccount(emptyNewAccount);
      setShowAddModal(false);
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (account) => {
    setEditingId(account.id);
    if (account.type === "Kartu Kredit") {
      setEditCardVal({
        startingBalance: formatThousands(account.startingBalance),
        totalLimit: account.totalLimit ? formatThousands(account.totalLimit) : "",
        dueDate: account.dueDate ? String(account.dueDate) : "",
      });
    } else {
      setEditBalanceVal(formatThousands(account.startingBalance));
    }
  };

  const saveEdit = async (account) => {
    setIsSaving(true);
    try {
      if (account.type === "Kartu Kredit") {
        await onUpdateFields(account.id, {
          startingBalance: parseAmountRounded(editCardVal.startingBalance),
          totalLimit: parseAmountRounded(editCardVal.totalLimit),
          dueDate: editCardVal.dueDate ? Number(editCardVal.dueDate) : null,
        });
      } else {
        await onUpdateBalance(account.id, parseAmountRounded(editBalanceVal));
      }
      setEditingId(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handlePaymentSubmit = async () => {
    if (!paymentAccountId || !paymentForm.amount || !paymentForm.date) return;
    const amount = parseAmountRounded(paymentForm.amount);
    if (amount <= 0) return;
    setPaymentLoading(true);
    try {
      const response = await fetch(`/api/accounts/${paymentAccountId}/pay-cc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, date: paymentForm.date }),
      });
      if (response.ok) {
        setShowPaymentModal(false);
        setPaymentForm({ amount: "", date: new Date().toISOString().split("T")[0] });
        setPaymentAccountId(null);
      } else {
        const err = await response.json();
        alert("Error: " + (err.error || "Payment failed"));
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setPaymentLoading(false);
    }
  };

  const renderAccountCard = (account) => {
    const isCard = account.type === "Kartu Kredit";
    const isEditing = editingId === account.id;
    const isCardEditing = isEditing && isCard;
    const totalLimit = Number(account.totalLimit) || 0;

    // `starting_balance` udah nyakup semua transaksi cicilan lewat ledger
    // transaksi biasa, jadi ini nggak perlu nambahin installments.remainingBalance
    // lagi (itu dobel hitung -- lihat riwayat transaksi di bawah buat rinciannya).
    const used = Number(account.startingBalance) || 0;
    const remaining = totalLimit - used;
    const usedPct = totalLimit > 0 ? Math.min(100, Math.max(0, (used / totalLimit) * 100)) : 0;

    // Riwayat transaksi kartu ini sejak tutup buku terakhir -- yang sebelum itu
    // sudah masuk tagihan yang lalu. Mirror dari Accounts.jsx (web).
    const cycleStart = getCurrentCycleStart(getStatementDay(account));
    const cardTransactions = isCard
      ? transactions.filter(
          (t) =>
            t.danaDipakai === "Spend CC" &&
            t.date >= cycleStart &&
            findCreditCardForSource(accounts, t.source)?.id === account.id
        )
      : [];

    const parents = cardTransactions.filter((t) => Number(t.installmentTotalLoan) > 0);
    const parentBaseTitles = new Set(parents.map((t) => getInstallmentBaseTitle(t.title)));
    const cardInstallments = installments.filter((i) => i.accountId === account.id);

    const historyGroups = new Map();
    parents.forEach((parent) => {
      const baseTitle = getInstallmentBaseTitle(parent.title);
      historyGroups.set(baseTitle, {
        parent,
        children: cardTransactions
          .filter((t) => getInstallmentBaseTitle(t.title) === baseTitle)
          .sort((a, b) => String(a.date).localeCompare(String(b.date))),
        installment: cardInstallments.find((i) => getInstallmentBaseTitle(i.name) === baseTitle),
      });
    });

    const historyUngrouped = cardTransactions.filter(
      (t) => !parentBaseTitles.has(getInstallmentBaseTitle(t.title))
    );

    return (
      <View key={account.id} style={styles.accountCard}>
        <View style={styles.accountRow}>
          <View style={styles.accountInfo}>
            <Text style={styles.accountName}>{account.name}</Text>
            <Text style={styles.accountType}>{account.type} · IDR</Text>
          </View>

          {isCardEditing ? (
            <View style={styles.editRow}>
              <Pressable
                style={styles.iconButtonDark}
                onPress={() => saveEdit(account)}
                disabled={isSaving}
              >
                <Text style={styles.iconButtonDarkText}>✓</Text>
              </Pressable>
              <Pressable style={styles.iconButton} onPress={() => setEditingId(null)}>
                <Text style={styles.iconButtonText}>✕</Text>
              </Pressable>
            </View>
          ) : isEditing ? (
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
                onPress={() => saveEdit(account)}
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
              <Pressable
                style={[styles.iconButton, styles.iconButtonSpaced]}
                onPress={() => startEdit(account)}
              >
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

        {isCardEditing ? (
          <View style={styles.editCardPanel}>
            <View style={styles.editCardRow}>
              <View style={styles.editCardField}>
                <Text style={styles.editCardLabel}>Total Limit (Rp)</Text>
                <TextInput
                  style={styles.editCardInput}
                  keyboardType="numeric"
                  value={editCardVal.totalLimit}
                  onChangeText={(v) =>
                    setEditCardVal((p) => ({ ...p, totalLimit: formatThousands(v) }))
                  }
                />
              </View>
              <View style={styles.editCardField}>
                <Text style={styles.editCardLabel}>Saldo Terpakai (Rp)</Text>
                <TextInput
                  style={styles.editCardInput}
                  keyboardType="numeric"
                  value={editCardVal.startingBalance}
                  onChangeText={(v) =>
                    setEditCardVal((p) => ({ ...p, startingBalance: formatThousands(v) }))
                  }
                />
              </View>
            </View>
            <View style={styles.editCardField}>
              <Text style={styles.editCardLabel}>Tanggal Jatuh Tempo</Text>
              <TextInput
                style={styles.editCardInput}
                keyboardType="numeric"
                placeholder="25"
                placeholderTextColor="#94a3b8"
                value={editCardVal.dueDate}
                onChangeText={(v) =>
                  setEditCardVal((p) => ({ ...p, dueDate: v.replace(/[^\d]/g, "").slice(0, 2) }))
                }
              />
            </View>
          </View>
        ) : (
          isCard &&
          totalLimit > 0 && (
            <View style={[styles.remainingBox, { backgroundColor: account.color || "#0f172a" }]}>
              <View style={styles.remainingHeaderRow}>
                <Text style={styles.remainingLabel}>Remaining limit</Text>
                <Text style={styles.remainingValue}>{formatCurrency(remaining)}</Text>
              </View>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${usedPct}%` }]} />
              </View>
              <View style={styles.remainingMetaRow}>
                <Text style={styles.remainingMetaText}>
                  Used {formatCurrency(used)} / {formatCurrency(totalLimit)}
                </Text>
                {account.dueDate ? (
                  <Text style={styles.remainingMetaText}>Due Day {account.dueDate}</Text>
                ) : null}
              </View>
              {used > 0 && (
                <Pressable
                  onPress={() => {
                    setPaymentAccountId(account.id);
                    setPaymentForm({ amount: formatThousands(used), date: new Date().toISOString().split("T")[0] });
                    setShowPaymentModal(true);
                  }}
                  style={styles.paymentButton}
                >
                  <Text style={styles.paymentButtonText}>Bayar Tagihan</Text>
                </Pressable>
              )}
            </View>
          )
        )}
        
        {isCard && cardTransactions.length > 0 && (
            <View style={styles.installmentsWrap}>
                <Text style={styles.historyTitle}>
                    RIWAYAT TRANSAKSI ({cardTransactions.length})
                </Text>

                {Array.from(historyGroups.entries()).map(([title, { parent, children, installment }]) => {
                    const isExpanded = expandedGroups[title];
                    return (
                        <View key={title}>
                            <View style={styles.historyGroupRow}>
                                <Pressable
                                    style={styles.installmentItem}
                                    onPress={() => toggleGroup(title)}
                                >
                                    <View style={styles.installmentInfo}>
                                        <Text style={styles.installmentName} numberOfLines={1}>
                                            {title}
                                        </Text>
                                        <Text style={styles.installmentTerm}>
                                            {installment
                                                ? `Sisa ${formatCurrency(installment.remainingBalance)} dari ${formatCurrency(installment.totalLoan)}`
                                                : `Cicilan • ${children.length}x pembayaran`}
                                            {installment?.remainingTerm ? ` • ${installment.remainingTerm}x` : ""}
                                            {installment?.dueDate ? ` • Tgl ${installment.dueDate}` : ""}
                                        </Text>
                                    </View>
                                    <View style={styles.historyGroupRight}>
                                        <Text style={styles.installmentName}>
                                            {formatCurrency(parent.installmentTotalLoan)}
                                        </Text>
                                        <Text style={styles.historyChevron}>{isExpanded ? "▲" : "▼"}</Text>
                                    </View>
                                </Pressable>
                                {installment && (
                                    <Pressable
                                        style={styles.installmentDelete}
                                        onPress={() => onDeleteInstallment?.(installment.id)}
                                    >
                                        <Text style={styles.iconButtonDangerText}>🗑</Text>
                                    </Pressable>
                                )}
                            </View>

                            {isExpanded && (
                                <View style={styles.historyGroupChildren}>
                                    {children.map((t) => (
                                        <View key={t.id} style={styles.historyChildItem}>
                                            <View>
                                                <Text style={styles.installmentName}>
                                                    {t.title}
                                                </Text>
                                                <Text style={styles.historyChildMeta}>
                                                    {t.date}
                                                    {t.time ? ` • ${t.time}` : ""}
                                                </Text>
                                            </View>
                                            <View style={styles.historyAmountRow}>
                                                <Text style={styles.installmentName}>
                                                    {formatCurrency(t.amount)}
                                                </Text>
                                                <Pressable
                                                    style={styles.checkbox}
                                                    onPress={() => onDeleteTransaction?.(t.id)}
                                                >
                                                    <Text style={styles.checkboxMark}> </Text>
                                                </Pressable>
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    );
                })}

                {historyUngrouped.map((t) => (
                    <View key={t.id} style={styles.installmentItem}>
                        <View style={styles.installmentInfo}>
                            <Text style={styles.installmentName} numberOfLines={1}>
                                {t.title}
                            </Text>
                            <Text style={styles.installmentTerm}>
                                {t.date}
                                {t.time ? ` • ${t.time}` : ""}
                            </Text>
                        </View>
                        <View style={styles.historyAmountRow}>
                            <Text style={styles.installmentName}>{formatCurrency(t.amount)}</Text>
                            <Pressable
                                style={styles.checkbox}
                                onPress={() => onDeleteTransaction?.(t.id)}
                            >
                                <Text style={styles.checkboxMark}> </Text>
                            </Pressable>
                        </View>
                    </View>
                ))}
            </View>
        )}
      </View>
    );
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
        {regularAccounts.length === 0 ? (
          <Text style={styles.emptyText}>
            Tidak ada akun ditemukan. Tap "+ Tambah" untuk menambahkan akun baru.
          </Text>
        ) : (
          regularAccounts.map(renderAccountCard)
        )}
      </View>

      {creditCardAccounts.length > 0 && (
        <View style={styles.list}>
          <Text style={styles.sectionTitle}>Credit Card</Text>

          <View style={styles.cardsPanel}>
            <Text style={styles.cardsPanelTitle}>Cards</Text>
            <View style={styles.cardsGrid}>
              <View style={styles.cardsTile}>
                <Text style={styles.cardsTileLabel}>Total Limit</Text>
                <Text style={styles.cardsTileValue} numberOfLines={1}>
                  {formatCurrency(creditCardTotals.totalLimit)}
                </Text>
              </View>
              <View style={styles.cardsTile}>
                <Text style={styles.cardsTileLabel}>Limit Used</Text>
                <Text style={styles.cardsTileValue} numberOfLines={1}>
                  {formatCurrency(creditCardTotals.used)}
                </Text>
              </View>
              <View style={styles.cardsTile}>
                <Text style={styles.cardsTileLabel}>Remaining Limit</Text>
                <Text style={styles.cardsTileValue} numberOfLines={1}>
                  {formatCurrency(creditCardTotals.remaining)}
                </Text>
              </View>
              <View style={styles.cardsTile}>
                <Text style={styles.cardsTileLabel}>Utilization</Text>
                <Text style={styles.cardsTileValue} numberOfLines={1}>
                  {creditCardTotals.utilization.toFixed(1)}%
                </Text>
              </View>
            </View>
          </View>

          {creditCardAccounts.map(renderAccountCard)}
        </View>
      )}

      <Modal visible={showAddModal} animationType="slide" transparent onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
            <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheet}>
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

              {isCreditCardForm ? (
                <>
                  <View style={styles.editCardRow}>
                    <View style={styles.editCardField}>
                      <Text style={styles.label}>Bank / Penerbit</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Chase"
                        placeholderTextColor="#94a3b8"
                        value={newAccount.issuer}
                        onChangeText={(v) => setNewAccount((p) => ({ ...p, issuer: v }))}
                      />
                    </View>
                    <View style={styles.editCardField}>
                      <Text style={styles.label}>Nama Produk</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Everyday Card"
                        placeholderTextColor="#94a3b8"
                        value={newAccount.productName}
                        onChangeText={(v) => setNewAccount((p) => ({ ...p, productName: v }))}
                      />
                    </View>
                  </View>

                  <Pressable
                    style={styles.checkboxRow}
                    onPress={() =>
                      setNewAccount((p) => ({ ...p, sharesLimit: !p.sharesLimit }))
                    }
                  >
                    <View style={[styles.checkbox, newAccount.sharesLimit && styles.checkboxChecked]}>
                      {newAccount.sharesLimit ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </View>
                    <Text style={styles.checkboxLabel}>
                      Kartu ini berbagi limit dengan kartu lain
                    </Text>
                  </Pressable>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Total Limit (Rp)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="20.000.000"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      value={newAccount.totalLimit}
                      onChangeText={(v) =>
                        setNewAccount((p) => ({ ...p, totalLimit: formatThousands(v) }))
                      }
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Saldo Terpakai Saat Ini (Rp)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      value={newAccount.startingBalance}
                      onChangeText={(v) =>
                        setNewAccount((p) => ({ ...p, startingBalance: formatThousands(v) }))
                      }
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Tanggal Jatuh Tempo (tanggal di bulan)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="25"
                      placeholderTextColor="#94a3b8"
                      keyboardType="numeric"
                      value={newAccount.dueDate}
                      onChangeText={(v) =>
                        setNewAccount((p) => ({ ...p, dueDate: v.replace(/[^\d]/g, "").slice(0, 2) }))
                      }
                    />
                  </View>

                  <View style={styles.inputGroup}>
                    <Text style={styles.label}>Warna Kartu</Text>
                    <View style={styles.colorRow}>
                      {CARD_COLORS.map((c) => (
                        <Pressable
                          key={c}
                          onPress={() => setNewAccount((p) => ({ ...p, color: c }))}
                          style={[
                            styles.colorSwatch,
                            { backgroundColor: c },
                            newAccount.color === c && styles.colorSwatchSelected,
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                </>
              ) : (
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
              )}

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
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Payment Modal */}
      <Modal visible={showPaymentModal} transparent animationType="slide">
        <View style={styles.backdrop}>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"}>
            <View style={styles.sheet}>
              <Text style={styles.sheetTitle}>Bayar Tagihan CC</Text>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Jumlah Pembayaran (Rp)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor="#94a3b8"
                  keyboardType="numeric"
                  value={paymentForm.amount}
                  onChangeText={(v) =>
                    setPaymentForm((p) => ({ ...p, amount: formatThousands(v) }))
                  }
                  autoFocus
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.label}>Tanggal Pembayaran</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2026-08-28"
                  placeholderTextColor="#94a3b8"
                  value={paymentForm.date}
                  onChangeText={(v) =>
                    setPaymentForm((p) => ({ ...p, date: v }))
                  }
                />
              </View>

              <Pressable
                style={[styles.saveButton, paymentLoading && styles.disabled]}
                onPress={handlePaymentSubmit}
                disabled={paymentLoading}
              >
                {paymentLoading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.saveButtonText}>Bayar</Text>
                )}
              </Pressable>

              <Pressable
                style={styles.cancelButton}
                onPress={() => setShowPaymentModal(false)}
                disabled={paymentLoading}
              >
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
  accountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  accountInfo: { flex: 1 },
  accountName: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  accountType: { color: "#64748b", fontSize: 12, fontWeight: "700", marginTop: 2 },
  balanceRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 10 },
  accountBalance: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  editRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  editInput: { flex: 1, backgroundColor: "#f4f7fb", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: "#0f172a" },
  iconButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#ffffff", alignItems: "center", justifyContent: "center" },
  iconButtonSpaced: { marginRight: 4 },
  iconButtonText: { color: "#475569", fontSize: 14 },
  iconButtonDark: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#0f172a", alignItems: "center", justifyContent: "center" },
  iconButtonDarkText: { color: "#ffffff", fontSize: 14, fontWeight: "900" },
  iconButtonDanger: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "#fecdd3", backgroundColor: "#fff1f2", alignItems: "center", justifyContent: "center" },
  iconButtonDangerText: { fontSize: 13 },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },

  remainingBox: { borderRadius: 16, padding: 14 },
  remainingHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  remainingLabel: { color: "rgba(255,255,255,0.7)", fontSize: 12, fontWeight: "700" },
  remainingValue: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.2)", marginTop: 8, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3, backgroundColor: "#ffffff" },
  remainingMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  remainingMetaText: { color: "rgba(255,255,255,0.7)", fontSize: 11, fontWeight: "700" },
  paymentButton: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, paddingVertical: 10, marginTop: 12 },
  paymentButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "700", textAlign: "center" },

  editCardPanel: { backgroundColor: "#f4f7fb", borderRadius: 16, padding: 14, gap: 10 },
  editCardRow: { flexDirection: "row", gap: 10 },
  editCardField: { flex: 1, gap: 6 },
  editCardLabel: { fontSize: 11, fontWeight: "700", color: "#64748b", textTransform: "uppercase" },
  editCardInput: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: "#0f172a", fontSize: 13, fontWeight: "700" },

  cardsPanel: { backgroundColor: "#18181b", borderRadius: 24, padding: 20 },
  cardsPanelTitle: { color: "#ffffff", fontSize: 18, fontWeight: "900" },
  cardsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  cardsTile: { flexBasis: "47%", flexGrow: 1, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 12 },
  cardsTileLabel: { color: "rgba(255,255,255,0.5)", fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  cardsTileValue: { color: "#ffffff", fontSize: 16, fontWeight: "900", marginTop: 4 },

  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center" },
  checkboxChecked: { backgroundColor: "#ec4899", borderColor: "#ec4899" },
  checkboxMark: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  checkboxLabel: { fontSize: 13, fontWeight: "600", color: "#334155", flex: 1 },

  colorRow: { flexDirection: "row", gap: 10 },
  colorSwatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: "#ffffff" },
  colorSwatchSelected: { borderColor: "#ec4899" },

  backdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.55)", justifyContent: "flex-end" },
  sheetScroll: { maxHeight: "88%" },
  sheet: { backgroundColor: "#ffffff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 16 },
  sheetTitle: { color: "#0f172a", fontSize: 20, fontWeight: "900" },
  inputGroup: { gap: 8 },
  label: { color: "#64748b", fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  input: { backgroundColor: "#f4f7fb", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 12, color: "#0f172a", fontSize: 15, paddingHorizontal: 14, paddingVertical: 12 },
  colorButton: { alignItems: "center", borderRadius: 12, height: 48, justifyContent: "center", width: 48 },
  installmentsWrap: {
    marginTop: 12,
  },
  historyTitle: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    marginBottom: 8,
    textTransform: "uppercase",
  },
  historyGroupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  historyGroupRight: {
    alignItems: "flex-end",
    flexDirection: "row",
    gap: 8,
  },
  historyChevron: {
    color: "#94a3b8",
    fontSize: 10,
  },
  historyGroupChildren: {
    marginLeft: 16,
    marginTop: -4,
    marginBottom: 8,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: "#e2e8f0",
    gap: 6,
  },
  historyChildItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderColor: "#f1f5f9",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  historyChildMeta: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
  },
  historyAmountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  checkbox: {
    alignItems: "center",
    justifyContent: "center",
    height: 18,
    width: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  checkboxMark: {
    fontSize: 11,
  },
  installmentItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#f1f5f9",
  },
  installmentInfo: {
    flex: 1,
    paddingRight: 12,
  },
  installmentName: {
    color: "#334155",
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 2,
  },
  installmentTerm: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
  },
  installmentDelete: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 20,
    borderWidth: 1,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  saveButton: { alignItems: "center", backgroundColor: "#ec4899", borderRadius: 14, justifyContent: "center", paddingVertical: 15 },
  saveButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  cancelButton: { alignItems: "center", justifyContent: "center", paddingVertical: 10 },
  cancelButtonText: { color: "#64748b", fontSize: 14, fontWeight: "700" },
});
