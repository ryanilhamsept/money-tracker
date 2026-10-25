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
  Alert,
} from "react-native";
import Svg, { Rect, Line as SvgLine, Polyline, Circle, Text as SvgText } from "react-native-svg";
import { formatCurrency } from "../utils/formatters";
import { formatMonthLabel } from "../utils/date";
import {
  summariseNetWorth,
  getNetWorthHistory,
  getAccountGroup,
  isExcludedAccount,
  GROUP_WALLET,
  GROUP_CASH,
  GROUP_INVESTMENT,
  GROUP_DEBT,
} from "../utils/netWorth";

// Urutan dan warna mengikuti kartu di aplikasi perbankan yang jadi acuan:
// aset menumpuk ke atas dari garis nol, utang turun ke bawah.
const NET_WORTH_GROUPS = [
  { key: GROUP_WALLET, label: "E-wallet & lainnya", fill: "#2563eb" },
  { key: GROUP_CASH, label: "Bank & tunai", fill: "#34d399" },
  { key: GROUP_INVESTMENT, label: "Investasi", fill: "#8b5cf6" },
  { key: GROUP_DEBT, label: "Hutang & tagihan", fill: "#f59e0b" },
];
import { findCreditCardForSource } from "../utils/accountBalance";
import { getOutstandingWindowStart, getStatementDay } from "../utils/billingCycle";
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

export default function AccountsScreen({ accounts, onAdd, onDelete, onUpdateBalance, onUpdateFields, installments = [], onDeleteInstallment, transactions = [], onDeleteTransaction, onMarkPaid }) {
  // Nyentang = nandai lunas, BUKAN hapus. Barisnya tetap ada di daftar
  // transaksi dan tetap kehitung sebagai pengeluaran; yang hilang cuma
  // bebannya di kartu. Dikonfirmasi dulu, mirror dari dialog di app web.
  const confirmMarkPaid = (t) => {
    Alert.alert(
      "Tandai Lunas",
      `${t.title}\n${formatCurrency(t.amount)} \u2022 ${t.date}\n\nBarisnya tetap ada di daftar transaksi, cuma keluar dari kartu ini.`,
      [
        { text: "Batal", style: "cancel" },
        { text: "Tandai Lunas", onPress: () => onMarkPaid?.(t.id, true) },
      ]
    );
  };

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

  const netWorth = useMemo(() => summariseNetWorth(accounts), [accounts]);

  const netWorthHistory = useMemo(
    () => getNetWorthHistory(accounts, transactions),
    [accounts, transactions]
  );

  // Perbandingan dengan bulan sebelumnya -- baru ada artinya kalau grafiknya
  // punya minimal dua titik.
  const netWorthChange = useMemo(() => {
    if (netWorthHistory.length < 2) return null;
    const latest = netWorthHistory[netWorthHistory.length - 1];
    const previous = netWorthHistory[netWorthHistory.length - 2];
    return {
      month: latest.month,
      previousMonth: previous.month,
      amount: latest.net - previous.net,
    };
  }, [netWorthHistory]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) =>
      a.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [accounts, searchQuery]);

  const regularAccounts = useMemo(
    () => filteredAccounts.filter((a) => a.type !== "Kartu Kredit"),
    [filteredAccounts]
  );

  // Daftar akun dikelompokkan persis seperti legenda di kartu kekayaan bersih,
  // lengkap dengan subtotalnya. Tanpa ini, angka "Bank & tunai" di kartu cuma
  // angka -- nggak kelihatan akun mana saja yang membentuknya. Subtotalnya
  // dihitung dari baris yang benar-benar tampil, jadi tetap jujur waktu
  // daftarnya lagi disaring.
  const accountGroups = useMemo(() => {
    const definitions = [
      { key: GROUP_CASH, label: "Bank & tunai", fill: "#34d399" },
      { key: GROUP_INVESTMENT, label: "Investasi", fill: "#8b5cf6" },
      { key: GROUP_WALLET, label: "E-wallet & lainnya", fill: "#2563eb" },
    ];

    const counted = regularAccounts.filter((a) => !isExcludedAccount(a));
    const excluded = regularAccounts.filter((a) => isExcludedAccount(a));

    const groups = definitions
      .map((definition) => {
        const members = counted.filter((a) => getAccountGroup(a) === definition.key);
        return {
          ...definition,
          members,
          total: members.reduce(
            (sum, a) => sum + (Number(a.startingBalance) || 0),
            0
          ),
        };
      })
      .filter((group) => group.members.length > 0);

    if (excluded.length > 0) {
      groups.push({
        key: "excluded",
        label: "Piutang",
        fill: "#cbd5e1",
        note: "Tidak dihitung",
        members: excluded,
        total: excluded.reduce((sum, a) => sum + (Number(a.startingBalance) || 0), 0),
      });
    }

    return groups;
  }, [regularAccounts]);

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

    // Mulai satu siklus ke belakang, bukan dari tutup buku terakhir. Dibatasi
    // siklus berjalan, belanja bulan ini lenyap dari daftar tepat saat
    // tagihannya terbit -- justru ketika paling perlu dilihat. Jendela ini
    // memuat tagihan yang jatuh tempo sekaligus belanja sesudahnya.
    // Mirror dari Accounts.jsx (web).
    const windowStart = getOutstandingWindowStart(getStatementDay(account));
    // Yang sudah dibayar keluar dari kartu: kartu ini menjawab "berapa yang
    // masih harus dibayar", bukan riwayat belanja. Barisnya sendiri tetap ada
    // di daftar transaksi dan tetap terhitung sebagai pengeluaran.
    const cardTransactions = isCard
      ? transactions.filter(
          (t) =>
            t.danaDipakai === "Spend CC" &&
            !t.paidAt &&
            t.date >= windowStart &&
            findCreditCardForSource(accounts, t.source)?.id === account.id
        )
      : [];

    const cardInstallments = installments.filter((i) => i.accountId === account.id);

    const parentByBaseTitle = new Map();
    cardTransactions.forEach((t) => {
      if (Number(t.installmentTotalLoan) > 0) {
        parentByBaseTitle.set(getInstallmentBaseTitle(t.title), t);
      }
    });

    // Rencana cicilan juga menandai sebuah grup, bukan cuma baris transaksinya.
    // Total pinjaman cuma tercatat di angsuran "ke 1", dan baris itu keluar
    // dari daftar begitu ditandai lunas -- tanpa jalur kedua ini, melunasi
    // angsuran pertama bikin sisa jadwalnya kehilangan kartu grup dan tampil
    // satu-satu.
    const installmentByBaseTitle = new Map();
    cardInstallments.forEach((i) => {
      installmentByBaseTitle.set(getInstallmentBaseTitle(i.name), i);
    });

    const historyGroups = new Map();
    const historyUngrouped = [];

    cardTransactions.forEach((t) => {
      const baseTitle = getInstallmentBaseTitle(t.title);
      const parent = parentByBaseTitle.get(baseTitle);
      const installment = installmentByBaseTitle.get(baseTitle);

      if (!parent && !installment) {
        historyUngrouped.push(t);
        return;
      }

      if (!historyGroups.has(baseTitle)) {
        historyGroups.set(baseTitle, {
          parent,
          installment,
          // Cicilan ditampilkan sebagai jadwal utuh, bukan dipotong siklus
          // tagihan: satu cicilan adalah satu komitmen lintas bulan.
          children: cardTransactions
            .filter((x) => getInstallmentBaseTitle(x.title) === baseTitle)
            // Diurut menaik biar kebaca cicilan ke-1, ke-2, dst.
            .sort((a, b) => String(a.date).localeCompare(String(b.date))),
        });
      }
    });

    const historyShownCount =
      historyUngrouped.length +
      [...historyGroups.values()].reduce((sum, g) => sum + g.children.length, 0);

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
                    RIWAYAT TRANSAKSI ({historyShownCount})
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
                                            {formatCurrency(
                                                parent?.installmentTotalLoan ??
                                                    installment?.totalLoan ??
                                                    0
                                            )}
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
                                                    onPress={() => confirmMarkPaid(t)}
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
                                onPress={() => confirmMarkPaid(t)}
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

      {/* Kekayaan bersih -- menggantikan "Total Saldo Akun", yang menjumlah
          akun piutang sebagai kekayaan dan malah ikut menambahkan tagihan
          kartu. Dua angka besar yang berbeda cuma bikin ragu. */}
      <View style={styles.netWorthPanel}>
        <Text style={styles.netWorthLabel}>Kekayaan bersih</Text>
        <Text style={styles.netWorthValue}>{formatCurrency(netWorth.net)}</Text>

        {netWorthHistory.length > 0
          ? (() => {
              const positiveOf = (e) =>
                e.totals[GROUP_WALLET] + e.totals[GROUP_CASH] + e.totals[GROUP_INVESTMENT];
              const maxPositive = Math.max(...netWorthHistory.map(positiveOf), 1);
              const maxDebt = Math.max(
                ...netWorthHistory.map((e) => e.totals[GROUP_DEBT]),
                0
              );

              const width = 320;
              const height = 170;
              const padTop = 10;
              const padBottom = 24;
              const plotHeight = height - padTop - padBottom;
              const range = maxPositive + maxDebt || 1;
              const toY = (v) => padTop + ((maxPositive - v) * plotHeight) / range;
              const zeroY = toY(0);
              const slot = width / netWorthHistory.length;
              const barWidth = Math.min(slot * 0.5, 30);
              const centreOf = (i) => slot * i + slot / 2;
              const stacked = [GROUP_CASH, GROUP_INVESTMENT, GROUP_WALLET];

              return (
                <View style={styles.netWorthChartWrap}>
                  <View style={styles.netWorthChartHeader}>
                    <Text style={styles.netWorthChartTitle}>Pertumbuhan aset</Text>
                    <Text style={styles.netWorthChartMeta}>
                      {netWorthHistory.length} bulan terakhir
                    </Text>
                  </View>

                  <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
                    <SvgLine x1="0" x2={width} y1={zeroY} y2={zeroY} stroke="#e2e8f0" strokeWidth="1" />

                    {netWorthHistory.map((entry, index) => {
                      const x = centreOf(index) - barWidth / 2;
                      let cursor = zeroY;
                      return stacked
                        .map((group) => {
                          const value = entry.totals[group];
                          if (value <= 0) return null;
                          const barHeight = (value * plotHeight) / range;
                          cursor -= barHeight;
                          return (
                            <Rect
                              key={entry.month + group}
                              x={x}
                              y={cursor}
                              width={barWidth}
                              height={barHeight}
                              fill={NET_WORTH_GROUPS.find((g) => g.key === group).fill}
                            />
                          );
                        })
                        .concat(
                          entry.totals[GROUP_DEBT] > 0
                            ? [
                                <Rect
                                  key={entry.month + "debt"}
                                  x={x}
                                  y={zeroY}
                                  width={barWidth}
                                  height={(entry.totals[GROUP_DEBT] * plotHeight) / range}
                                  fill="#f59e0b"
                                />,
                              ]
                            : []
                        );
                    })}

                    <Polyline
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="2"
                      points={netWorthHistory
                        .map((e, i) => `${centreOf(i)},${toY(e.net)}`)
                        .join(" ")}
                    />

                    {netWorthHistory.map((entry, index) => (
                      <Circle
                        key={entry.month}
                        cx={centreOf(index)}
                        cy={toY(entry.net)}
                        r="4"
                        fill="#0f172a"
                        stroke="#ffffff"
                        strokeWidth="2"
                      />
                    ))}

                    {netWorthHistory.map((entry, index) => (
                      <SvgText
                        key={entry.month}
                        x={centreOf(index)}
                        y={height - 7}
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="700"
                        fill="#94a3b8"
                      >
                        {formatMonthLabel(entry.month).split(" ")[0].slice(0, 3)}
                      </SvgText>
                    ))}
                  </Svg>
                </View>
              );
            })()
          : null}

        <View style={styles.netWorthGrid}>
          {NET_WORTH_GROUPS.filter((g) => netWorth.members[g.key].length > 0).map((group) => (
            <View key={group.key} style={styles.netWorthGridItem}>
              <View style={styles.netWorthLegendRow}>
                <View style={[styles.netWorthDot, { backgroundColor: group.fill }]} />
                <Text style={styles.netWorthGroupLabel}>{group.label}</Text>
              </View>
              <Text style={styles.netWorthGroupValue} numberOfLines={1}>
                {group.key === GROUP_DEBT ? "-" : ""}
                {formatCurrency(netWorth.totals[group.key])}
              </Text>
            </View>
          ))}
        </View>

        {netWorthChange ? (
          <View style={styles.netWorthChange}>
            <Text style={styles.netWorthChangeTitle}>
              {formatMonthLabel(netWorthChange.month).split(" ")[0]}{" "}
              {netWorthChange.amount >= 0 ? "naik" : "turun"}{" "}
              {formatCurrency(Math.abs(netWorthChange.amount))}
            </Text>
            <Text style={styles.netWorthChangeMeta}>
              Dari {formatMonthLabel(netWorthChange.previousMonth).split(" ")[0]}
            </Text>
          </View>
        ) : null}

        <Text style={styles.netWorthNote}>
          Bulan-bulan sebelumnya dihitung mundur dari catatan transaksi. Akun yang
          saldonya diisi manual dan tidak pernah punya transaksi (Bibit, CRYPTO)
          dianggap tetap, karena riwayat saldonya memang tidak tersimpan. Akun
          piutang tidak dihitung sebagai kekayaan.
        </Text>
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

      {regularAccounts.length === 0 ? (
        <View style={styles.list}>
          <Text style={styles.emptyText}>
            Tidak ada akun ditemukan. Tap "+ Tambah" untuk menambahkan akun baru.
          </Text>
        </View>
      ) : (
        accountGroups.map((group) => (
          <View key={group.key} style={styles.accountGroup}>
            <View style={styles.accountGroupHeader}>
              <View style={styles.accountGroupLabelRow}>
                <View style={[styles.netWorthDot, { backgroundColor: group.fill }]} />
                <Text style={styles.accountGroupLabel}>{group.label}</Text>
                {group.note ? (
                  <View style={styles.accountGroupBadge}>
                    <Text style={styles.accountGroupBadgeText}>{group.note}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.accountGroupTotal}>{formatCurrency(group.total)}</Text>
            </View>

            <View style={styles.list}>{group.members.map(renderAccountCard)}</View>
          </View>
        ))
      )}

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
  netWorthPanel: { backgroundColor: "#ffffff", borderRadius: 24, padding: 20 },
  netWorthLabel: { color: "#64748b", fontSize: 13, fontWeight: "700" },
  netWorthValue: { color: "#0f172a", fontSize: 30, fontWeight: "900", marginTop: 4 },
  netWorthChartWrap: { marginTop: 18 },
  netWorthChartHeader: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between" },
  netWorthChartTitle: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  netWorthChartMeta: { color: "#94a3b8", fontSize: 11, fontWeight: "700" },
  netWorthGrid: { borderTopColor: "#f1f5f9", borderTopWidth: 1, flexDirection: "row", flexWrap: "wrap", marginTop: 16, paddingTop: 16 },
  netWorthGridItem: { marginBottom: 12, paddingRight: 10, width: "50%" },
  netWorthLegendRow: { alignItems: "center", flexDirection: "row", gap: 6 },
  netWorthDot: { borderRadius: 5, height: 9, width: 9 },
  netWorthGroupLabel: { color: "#64748b", fontSize: 12, fontWeight: "700" },
  netWorthGroupValue: { color: "#0f172a", fontSize: 16, fontWeight: "900", marginTop: 2 },
  netWorthChange: { borderTopColor: "#f1f5f9", borderTopWidth: 1, marginTop: 4, paddingTop: 16 },
  netWorthChangeTitle: { color: "#0f172a", fontSize: 15, fontWeight: "900" },
  netWorthChangeMeta: { color: "#64748b", fontSize: 13, fontWeight: "600", marginTop: 2 },
  accountGroup: { gap: 10 },
  accountGroupHeader: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", gap: 10 },
  accountGroupLabelRow: { alignItems: "center", flexDirection: "row", flexShrink: 1, gap: 6 },
  accountGroupLabel: { color: "#64748b", fontSize: 12, fontWeight: "900", letterSpacing: 0.4, textTransform: "uppercase" },
  accountGroupBadge: { backgroundColor: "#f1f5f9", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  accountGroupBadgeText: { color: "#64748b", fontSize: 10, fontWeight: "800" },
  accountGroupTotal: { color: "#0f172a", fontSize: 13, fontWeight: "900" },
  netWorthNote: { color: "#94a3b8", fontSize: 11, lineHeight: 16, marginTop: 14 },
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
