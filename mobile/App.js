import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  getAccounts,
  getTransactions,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  updateAccountBalance,
  adjustAccountBalance,
  updateAccountFields,
  addAccount,
  deleteAccount,
  getInstallments,
  addInstallment,
  updateInstallment,
  deleteInstallment,
  setTransactionPaid,
  getBudget,
  saveBudget,
  getGoals,
  addGoal,
  updateGoal,
  deleteGoal,
  supabase,
} from "./src/services/supabase";
import { formatCurrency, formatDate, formatThousands, parseAmount } from "./src/utils/formatters";
import { getAccountBalanceDeltas, findCreditCardForSource } from "./src/utils/accountBalance";
import {
  formatInstallmentTitle,
  getInstallmentBaseTitle,
} from "./src/utils/installmentTitle";
import {
  currentMonth,
  formatDisplayDate,
  getTransactionMonth,
  normalizeDate,
  shiftMonth,
  today,
  addMonthsToDate,
} from "./src/utils/date";
import {
  getFirstInstallmentMonthOffset,
  getStatementDay,
} from "./src/utils/billingCycle";
import {
  findDuplicateTransaction,
  compareTransactionsNewestFirst,
} from "./src/utils/transactions";
import {
  categories,
  incomeCategories,
  fundSources,
  danaDipakaiOptions,
} from "./src/constants/options";
import Login from "./src/components/Login";
import TransactionForm from "./src/components/TransactionForm";
import Dropdown from "./src/components/Dropdown";
import AccountsScreen from "./src/components/AccountsScreen";
import PlanScreen from "./src/components/PlanScreen";
import MonthlyReportScreen from "./src/components/MonthlyReportScreen";
import YearlyReportScreen from "./src/components/YearlyReportScreen";
import { totalSpentSinceStart } from "./src/utils/report";
import JournalScreen from "./src/components/JournalScreen";
import CreditCalculator from "./src/components/CreditCalculator";
import SplitBillScreen from "./src/components/SplitBillScreen";
import PinLockScreen from "./src/components/PinLockScreen";
import { hasPinSet } from "./src/utils/pinStorage";
import { APP_VERSION, BUILD_DATE } from "./src/constants/version";
import { colors, radius, shadow, TOP_INSET } from "./src/theme";

// Hermes/RN nggak selalu punya crypto.randomUUID -- pakai fallback manual biar aman.
const generateId = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Isi layar hub. Tiap app dapat warnanya sendiri biar kebaca sekali lihat,
// tapi semuanya masih di keluarga pink-ungu yang sama kayak sisa app-nya.
const HUB_APPS = [
  {
    key: "tracker",
    label: "Keuangan",
    icon: "\u{1F4B8}",
    art: "\u{1F4B3}",
    headline: "Catat pengeluaran kamu\nhari ini, yuk",
    meta: "Transaksi, akun, cicilan, laporan",
    colors: ["#0b5f8d", "#1288c4"],
  },
  {
    key: "journal",
    label: "Journal",
    icon: "\u{1F4D3}",
    art: "\u{1F58A}\uFE0F",
    headline: "Tulis apa yang kamu\nrasain hari ini",
    meta: "Catatan harian",
    colors: ["#1e4f8a", "#3b7fc4"],
  },
  {
    key: "split",
    label: "Split Bill",
    icon: "\u{1F9FE}",
    art: "\u{1F465}",
    headline: "Bagi tagihan bareng\nteman-teman",
    meta: "Patungan, pajak, siapa bayar ke siapa",
    colors: ["#0b5a63", "#12998f"],
  },
  {
    key: "kredit",
    label: "Simulasi KTA",
    icon: "\u{1F9EE}",
    art: "\u{1F3E0}",
    headline: "Hitung cicilan KPR\natau kendaraan",
    meta: "Kalkulator kredit",
    colors: ["#2f6f9e", "#4aa3d4"],
  },
];

const TABS = [
  { key: "transactions", label: "Home" },
  { key: "accounts", label: "Akun" },
  { key: "plan", label: "Plan" },
  { key: "monthly", label: "Bulanan" },
  { key: "yearly", label: "Tahunan" },
];

const CATEGORY_ICONS = {
  "Account Transfer": { emoji: "🔁", bg: "rgba(52,211,153,0.16)", color: "#6ee7b7" },
  Food: { emoji: "🍔", bg: "rgba(251,146,60,0.18)", color: "#fdba74" },
  Transportation: { emoji: "🚗", bg: "rgba(96,165,250,0.18)", color: "#93c5fd" },
  Groceries: { emoji: "🛒", bg: "rgba(251,191,36,0.16)", color: "#fcd34d" },
  Utilities: { emoji: "💡", bg: "rgba(251,191,36,0.16)", color: "#fcd34d" },
  Entertainment: { emoji: "🎮", bg: "rgba(244,114,182,0.16)", color: "#f9a8d4" },
  Internet: { emoji: "🌐", bg: "rgba(34,211,238,0.18)", color: "#67e8f9" },
  Shopping: { emoji: "🛍️", bg: "rgba(167,139,250,0.18)", color: "#c4b5fd" },
  Health: { emoji: "❤️", bg: "rgba(251,113,133,0.16)", color: "#fda4af" },
  Education: { emoji: "📚", bg: "rgba(129,140,248,0.18)", color: "#a5b4fc" },
  Miscellaneous: { emoji: "✨", bg: "#06324c", color: "#9cbed4" },
};
const getCategoryIcon = (category) => CATEGORY_ICONS[category] || CATEGORY_ICONS.Miscellaneous;

const WEEKDAYS = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const formatDayHeader = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return `${WEEKDAYS[dow]}, ${formatDisplayDate(dateStr)}`;
};

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [pinRequired, setPinRequired] = useState(null);
  const [isPinUnlocked, setIsPinUnlocked] = useState(false);
  const [showPinManager, setShowPinManager] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [installments, setInstallments] = useState([]);
  const [goals, setGoals] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [formVisible, setFormVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  // Layar pemilih di depan: "hub" | "tracker" | "journal". Money Tracker dan
  // Journal berbagi akun Supabase yang sama, jadi satu login menutupi dua-duanya.
  const [activeApp, setActiveApp] = useState("hub");
  const [activeTab, setActiveTab] = useState("transactions");
  const [budget, setBudget] = useState(0);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [danaFilter, setDanaFilter] = useState("all");
  const [transactionPage, setTransactionPage] = useState(1);
  const TRANSACTIONS_PAGE_SIZE = 20;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setIsAuthChecking(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshPinStatus = useCallback(async () => {
    const required = await hasPinSet();
    setPinRequired(required);
  }, []);

  useEffect(() => {
    if (user) {
      refreshPinStatus();
    }
  }, [user, refreshPinStatus]);

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    try {
      setError("");
      setIsLoading(true);

      const [nextAccounts, nextTransactions, nextInstallments, nextBudget, nextGoals] = await Promise.all([
        getAccounts(),
        getTransactions(),
        getInstallments(),
        getBudget(user.id),
        getGoals(),
      ]);

      setAccounts(nextAccounts);
      setTransactions(
        nextTransactions
          .filter((item) => item.title)
          .sort(compareTransactionsNewestFirst)
      );
      setInstallments(nextInstallments);
      setBudget(nextBudget);
      setGoals(nextGoals);
    } catch (err) {
      setError(err.message || "Gagal mengambil data tracker.");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadDashboard();
    }
  }, [user, loadDashboard]);

  const currentMonthTransactions = useMemo(
    () => transactions.filter((t) => getTransactionMonth(t.date) === currentMonth()),
    [transactions]
  );

  const filteredTransactions = useMemo(() => {
    return currentMonthTransactions.filter((item) => {
      const matchesQuery = `${item.title} ${item.category} ${item.source} ${item.danaDipakai}`
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
      const matchesSource = sourceFilter === "all" || item.source === sourceFilter;
      const matchesDana = danaFilter === "all" || item.danaDipakai === danaFilter;
      return matchesQuery && matchesCategory && matchesSource && matchesDana;
    });
  }, [currentMonthTransactions, searchQuery, categoryFilter, sourceFilter, danaFilter]);

  // Balik ke halaman 1 setiap kali daftarnya "dibuka ulang": filter berubah,
  // pindah tab, atau keluar-masuk lewat hub. Tanpa ini nomor halaman nyangkut
  // -- buka Home lagi setelah mampir ke Plan dan kamu masih di halaman 6.
  useEffect(() => {
    setTransactionPage(1);
  }, [searchQuery, categoryFilter, sourceFilter, danaFilter, activeTab, activeApp]);

  // Dikelompokkan per tanggal dulu sebelum dipaginasi, biar transaksi di satu
  // tanggal nggak pernah kepotong jadi dua grup terpisah di dua halaman.
  const dateGroupsAll = useMemo(() => {
    const groups = {};
    filteredTransactions.forEach((t) => {
      const key = normalizeDate(t.date);
      if (!groups[key]) groups[key] = [];
      groups[key].push(t);
    });
    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({
        date,
        items,
        // Total per hari cuma ngitung pengeluaran, biar konsisten sama makna
        // "Total Spending" -- pemasukan tetap kelihatan di baris masing-masing.
        total: items
          .filter((t) => t.type !== "income")
          .reduce((sum, t) => sum + Number(t.amount), 0),
      }));
  }, [filteredTransactions]);

  const transactionPages = useMemo(() => {
    const pages = [];
    let current = [];
    let currentCount = 0;
    dateGroupsAll.forEach((group) => {
      if (currentCount > 0 && currentCount + group.items.length > TRANSACTIONS_PAGE_SIZE) {
        pages.push(current);
        current = [];
        currentCount = 0;
      }
      current.push(group);
      currentCount += group.items.length;
    });
    if (current.length > 0) pages.push(current);
    return pages.length > 0 ? pages : [[]];
  }, [dateGroupsAll]);

  const totalTransactionPages = transactionPages.length;

  useEffect(() => {
    if (transactionPage > totalTransactionPages) {
      setTransactionPage(totalTransactionPages);
    }
  }, [totalTransactionPages, transactionPage]);

  const groupedTransactions = transactionPages[transactionPage - 1] || [];

  // Cicilan yang jatuh temponya masih di depan belum benar-benar keluar
  // duitnya -- kecuali yang sudah dibayar lebih awal. Aturannya disamakan
  // persis dengan kartu di app web biar angka di dua tempat nggak beda.
  const monthTotals = useMemo(() => {
    const todayStr = today();
    const realised = currentMonthTransactions.filter(
      (t) => t.paidAt || normalizeDate(t.date) <= todayStr
    );

    const spending = realised
      .filter((t) => t.type !== "income")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    const income = realised
      .filter((t) => t.type === "income")
      .reduce((sum, t) => sum + Number(t.amount), 0);

    return { spending, income, net: income - spending };
  }, [currentMonthTransactions]);

  const totalSpending = monthTotals.spending;

  const incomeShare =
    monthTotals.income + monthTotals.spending > 0
      ? monthTotals.income / (monthTotals.income + monthTotals.spending)
      : 0.5;

  const totalSpentSince2026 = useMemo(
    () => totalSpentSinceStart(transactions, today()),
    [transactions]
  );

  const currentMonthSpendBulanan = useMemo(
    () =>
      currentMonthTransactions
        .filter((t) => t.danaDipakai === "Spend Bulanan")
        .reduce((sum, t) => sum + Number(t.amount), 0),
    [currentMonthTransactions]
  );

  const leftBudget = useMemo(
    () => Math.max(0, budget - currentMonthSpendBulanan),
    [budget, currentMonthSpendBulanan]
  );

  const spendingComparison = useMemo(() => {
    const prevMonth = shiftMonth(currentMonth(), -1);
    const prevTotal = transactions
      .filter((t) => getTransactionMonth(t.date) === prevMonth && t.type !== "income")
      .reduce((sum, t) => sum + Number(t.amount), 0);
    if (prevTotal === 0) return null;
    const diff = totalSpending - prevTotal;
    return {
      percent: Math.abs(Math.round((diff / prevTotal) * 100)),
      isIncrease: diff > 0,
    };
  }, [transactions, totalSpending]);

  const handleBudgetEditOpen = () => {
    setBudgetInput(formatThousands(String(budget || "")));
    setIsEditingBudget(true);
  };

  const handleBudgetSave = async () => {
    const newBudget = parseAmount(budgetInput);
    if (!newBudget) return;
    setIsSavingBudget(true);
    try {
      await saveBudget(user.id, newBudget);
      setBudget(newBudget);
      setIsEditingBudget(false);
      setBudgetInput("");
    } catch (err) {
      setError(err.message || "Gagal menyimpan budget.");
    } finally {
      setIsSavingBudget(false);
    }
  };

  const handleBudgetCancel = () => {
    setBudgetInput("");
    setIsEditingBudget(false);
  };

  const applyBalanceDeltas = useCallback(
    async (previousTransaction, nextTransaction) => {
      const deltas = getAccountBalanceDeltas(
        accounts,
        previousTransaction,
        nextTransaction
      );
      if (deltas.length === 0) return;

      // Send just the delta and let the database add it atomically -- computing
      // the full new balance from local `accounts` state and overwriting would
      // clobber concurrent writes from the Gmail auto-import script or the web app.
      const results = await Promise.all(
        deltas.map(async (delta) => ({
          id: delta.account.id,
          newBalance: await adjustAccountBalance(delta.account.id, delta.amount),
        }))
      );

      setAccounts((current) =>
        current.map((acc) => {
          const result = results.find((item) => item.id === acc.id);
          return result ? { ...acc, startingBalance: result.newBalance } : acc;
        })
      );
    },
    [accounts]
  );

  // Ubah pemetaan satu transaksi dari laporan tahunan: kategori / sumber dana /
  // ambil dari mana, tanpa menyentuh judul, nominal, maupun tanggalnya.
  //
  // Efek sampingnya dibikin sama persis dengan menyimpan lewat form transaksi,
  // karena ketiganya memang berdampak ke luar baris itu sendiri: mengganti
  // sumber dana memindahkan uangnya dari saldo satu akun ke akun lain, dan
  // mengganti kategori ikut berlaku untuk cicilan lain dari pembelian yang
  // sama. Menulis langsung ke baris tanpa dua hal itu akan membuat saldo akun
  // melenceng diam-diam.
  const handleRemapTransaction = async (transaction, patch) => {
    const payload = { ...transaction, ...patch };
    await updateTransaction(payload);
    await applyBalanceDeltas(transaction, payload);

    if (payload.category !== transaction.category) {
      const baseTitle = getInstallmentBaseTitle(transaction.title);
      const siblings = baseTitle
        ? transactions.filter(
            (t) => t.id !== transaction.id && getInstallmentBaseTitle(t.title) === baseTitle
          )
        : [];
      for (const sibling of siblings) {
        await updateTransaction({ ...sibling, category: payload.category });
      }
    }

    await loadDashboard();
  };

  const openAddForm = () => {
    setEditingTransaction(null);
    setFormVisible(true);
  };

  const openEditForm = (transaction) => {
    setEditingTransaction(transaction);
    setFormVisible(true);
  };

  const closeForm = () => {
    setFormVisible(false);
    setEditingTransaction(null);
  };

  const handleFormSubmit = async (
    form,
    wantsInstallment,
    installmentDetails,
    { allowDuplicate = false } = {}
  ) => {
    if (editingTransaction) {
      const isNewlyConverted = wantsInstallment && !editingTransaction.installmentTotalLoan;
      const baseTitle = form.title.trim();
      const payload = {
        ...form,
        id: editingTransaction.id,
        title: isNewlyConverted ? formatInstallmentTitle(baseTitle, 1) : form.title,
      };
      await updateTransaction(payload);
      await applyBalanceDeltas(editingTransaction, payload);

      // Kategori itu sifatnya "milik pembelian", bukan milik satu baris
      // cicilan doang -- kalau kategori satu cicilan diubah, samain juga ke
      // cicilan lain yang berasal dari pembelian yang sama (dicocokkan lewat
      // base title, tanpa suffix " ke N").
      if (payload.category !== editingTransaction.category) {
        const cascadeBaseTitle = getInstallmentBaseTitle(editingTransaction.title);
        const siblings = cascadeBaseTitle
          ? transactions.filter(
              (t) => t.id !== editingTransaction.id && getInstallmentBaseTitle(t.title) === cascadeBaseTitle
            )
          : [];
        for (const sibling of siblings) {
          await updateTransaction({ ...sibling, category: payload.category });
        }
      }

      if (isNewlyConverted) {
          const term = Number(installmentDetails.remainingTerm) || 1;
          const [yearStr, monthStr, dayStr] = payload.date.split('-');
          const y = parseInt(yearStr, 10);
          const m = parseInt(monthStr, 10) - 1;
          const d = parseInt(dayStr, 10);

          for (let i = 1; i < term; i++) {
              const nextDate = new Date(y, m + i, d);
              const outY = nextDate.getFullYear();
              const outM = String(nextDate.getMonth() + 1).padStart(2, '0');
              const outD = String(nextDate.getDate()).padStart(2, '0');
              const dateString = `${outY}-${outM}-${outD}`;

              await addTransaction({
                  ...payload,
                  id: generateId(),
                  title: formatInstallmentTitle(baseTitle, i + 1),
                  date: dateString,
                  installmentTotalLoan: null,
              });
          }

          const matchedCard = findCreditCardForSource(accounts, payload.source);
          if (matchedCard) {
              const totalLoan = Number(installmentDetails.totalLoan);
              const amount = Number(payload.amount);
              await addInstallment({
                  id: generateId(),
                  accountId: matchedCard.id,
                  transactionId: payload.id,
                  name: baseTitle,
                  provider: installmentDetails.provider || "",
                  totalLoan,
                  remainingBalance: totalLoan,
                  monthlyInstallment: amount,
                  remainingTerm: term,
                  dueDate: installmentDetails.dueDate ? Number(installmentDetails.dueDate) : (matchedCard.dueDate || null),
              });
          }
      }
    } else {
      let firstTransactionId = null;
      const newBaseTitle = form.title.trim();
      const matchedCardForDates = findCreditCardForSource(accounts, form.source);

      if (wantsInstallment) {
          const term = Number(installmentDetails.remainingTerm) || 1;
          const purchaseDay = parseInt(form.date.split('-')[2], 10);

          // Cicilan pertama nempel di tagihan pertama setelah belanja. Kartu
          // tutup buku tiap tanggal `statementDay`, jadi belanja pada/sesudah
          // tanggal itu baru ditagih bulan berikutnya -- belanja 29 Agu (tutup
          // buku 25) jatuh di Sep, Okt, Nov.
          const statementDay = getStatementDay(matchedCardForDates);
          const monthOffset = getFirstInstallmentMonthOffset(purchaseDay, statementDay);

          const candidates = Array.from({ length: term }, (_, i) => ({
              ...form,
              title: formatInstallmentTitle(newBaseTitle, i + 1),
              id: generateId(),
              date: addMonthsToDate(form.date, i + monthOffset),
              installmentTotalLoan: i === 0 ? Number(installmentDetails.totalLoan) : 0,
          }));

          // Semua angsuran dicek dulu sebelum satu pun disimpan, biar duplikat
          // yang ketemu di bulan ke-2 nggak ninggalin bulan ke-1 setengah jadi.
          if (!allowDuplicate) {
              const duplicateOf = candidates
                  .map((c) => findDuplicateTransaction(transactions, c))
                  .find(Boolean);
              if (duplicateOf) return { ok: false, reason: "duplicate", duplicateOf };
          }

          firstTransactionId = candidates[0].id;
          for (const candidate of candidates) {
              await addTransaction(candidate);
          }
      } else {
          firstTransactionId = generateId();
          const candidate = { ...form, id: firstTransactionId };

          if (!allowDuplicate) {
              const duplicateOf = findDuplicateTransaction(transactions, candidate);
              if (duplicateOf) return { ok: false, reason: "duplicate", duplicateOf };
          }

          await addTransaction(candidate);
      }

      const payload = {
          ...form,
          id: firstTransactionId,
          installmentTotalLoan: wantsInstallment ? Number(installmentDetails.totalLoan) : null,
      };
      await applyBalanceDeltas(null, payload);

      if (wantsInstallment && firstTransactionId) {
          const matchedCard = matchedCardForDates;
          if (matchedCard) {
              const totalLoan = Number(installmentDetails.totalLoan);
              const amount = Number(form.amount);
              await addInstallment({
                  id: generateId(),
                  accountId: matchedCard.id,
                  transactionId: firstTransactionId,
                  name: newBaseTitle,
                  provider: installmentDetails.provider || "",
                  totalLoan,
                  remainingBalance: totalLoan,
                  monthlyInstallment: amount,
                  remainingTerm: Number(installmentDetails.remainingTerm),
                  dueDate: installmentDetails.dueDate ? Number(installmentDetails.dueDate) : (matchedCard.dueDate || null),
              });
          }
      }
    }
    closeForm();
    await loadDashboard();
  };

  const handleFormDelete = async () => {
    if (!editingTransaction) return;
    
    // Cascading delete for installments
    const linkedInst = installments.find(inst =>
        inst.transactionId === editingTransaction.id ||
        (getInstallmentBaseTitle(inst.name) === getInstallmentBaseTitle(editingTransaction.title) && inst.monthlyInstallment === editingTransaction.amount)
    );
    
    await deleteTransaction(editingTransaction.id);
    await applyBalanceDeltas(editingTransaction, null);

    if (linkedInst) {
        // Nyentang lunas 1 baris cicilan = ngurangin sisa saldo cicilan
        // sebesar cicilan itu, bukan langsung hapus seluruh record.
        const isPrimary = linkedInst.transactionId === editingTransaction.id;
        const newRemaining = Number(linkedInst.remainingBalance) - Number(editingTransaction.amount);
        if (isPrimary || newRemaining <= 0) {
            await deleteInstallment(linkedInst.id);
        } else {
            await updateInstallment({ ...linkedInst, remainingBalance: newRemaining });
        }
    }

    closeForm();
    await loadDashboard();
  };

  // Angsuran yang sudah dibayar keluar dari kartu kredit tapi barisnya tetap
  // ada di daftar transaksi -- dulu checkbox-nya ngehapus baris, dan itu bikin
  // riwayat pengeluarannya hilang. Yang dinetralkan cuma pengaruhnya ke saldo.
  const handleMarkTransactionPaid = async (id, paid = true) => {
    const existing = transactions.find((t) => t.id === id);
    if (!existing) return;

    const updated = { ...existing, paidAt: paid ? new Date().toISOString() : null };

    await setTransactionPaid(id, paid);
    await applyBalanceDeltas(existing, updated);

    setTransactions((current) => current.map((t) => (t.id === id ? updated : t)));
  };

  const handleDeleteTransactionById = async (id) => {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;

    const linkedInst = installments.find(
      (inst) =>
        inst.transactionId === id ||
        (getInstallmentBaseTitle(inst.name) === getInstallmentBaseTitle(tx.title) && inst.monthlyInstallment === tx.amount)
    );

    await deleteTransaction(id);
    await applyBalanceDeltas(tx, null);

    if (linkedInst) {
      const isPrimary = linkedInst.transactionId === id;
      const newRemaining = Number(linkedInst.remainingBalance) - Number(tx.amount);
      if (isPrimary || newRemaining <= 0) {
        await deleteInstallment(linkedInst.id);
      } else {
        await updateInstallment({ ...linkedInst, remainingBalance: newRemaining });
      }
    }

    await loadDashboard();
  };

  const handleDeleteInstallment = async (instId) => {
    const inst = installments.find(i => i.id === instId);
    if (!inst) return;
    
    await deleteInstallment(instId);
    
    if (inst.transactionId) {
        await deleteTransaction(inst.transactionId);
    }
    
    const relatedTxs = transactions.filter(t =>
        getInstallmentBaseTitle(t.title) === getInstallmentBaseTitle(inst.name) &&
        t.amount === inst.monthlyInstallment &&
        t.type === "expense" &&
        t.id !== inst.transactionId
    );
    for (const tx of relatedTxs) {
        await deleteTransaction(tx.id);
    }
    
    await loadDashboard();
  };


  const handleAddAccount = async (account) => {
    await addAccount(account);
    await loadDashboard();
  };

  const handleDeleteAccount = async (id) => {
    await deleteAccount(id);
    await loadDashboard();
  };

  const handleUpdateAccountBalance = async (id, newBalance) => {
    await updateAccountBalance(id, newBalance);
    await loadDashboard();
  };

  const handleUpdateAccountFields = async (id, fields) => {
    await updateAccountFields(id, fields);
    await loadDashboard();
  };

  const handleAddGoal = async (goal) => {
    await addGoal(goal, user.id);
    await loadDashboard();
  };

  const handleUpdateGoal = async (goal) => {
    await updateGoal(goal);
    await loadDashboard();
  };

  const handleDeleteGoal = async (id) => {
    await deleteGoal(id);
    await loadDashboard();
  };

  if (isAuthChecking) {
    return (
      <View style={[styles.screen, { justifyContent: "center", alignItems: "center", backgroundColor: "#0b5f8d", flex: 1 }]}>
        <ActivityIndicator size="large" color="#ec4899" />
        <Text style={{ color: "#ffffff", marginTop: 12, fontWeight: "600" }}>Memeriksa sesi...</Text>
      </View>
    );
  }

  if (!user) {
    return <Login />;
  }

  if (pinRequired === null) {
    return (
      <View style={[styles.screen, { justifyContent: "center", alignItems: "center", backgroundColor: "#0b5f8d", flex: 1 }]}>
        <ActivityIndicator size="large" color="#ec4899" />
      </View>
    );
  }

  if (pinRequired && !isPinUnlocked) {
    return <PinLockScreen mode="unlock" onSuccess={() => setIsPinUnlocked(true)} />;
  }

  if (showPinManager) {
    return (
      <PinLockScreen
        mode={pinRequired ? "setup" : "create"}
        onSuccess={async () => {
          await refreshPinStatus();
          setShowPinManager(false);
        }}
        onCancel={() => setShowPinManager(false)}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />

      {/* Latarnya gradien, bukan warna rata -- ini tanda visual paling kuat
          yang bikin app ini kelihatan satu keluarga sama app web. */}
      <LinearGradient
        colors={colors.bgGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {TOP_INSET ? <View style={{ height: TOP_INSET }} /> : null}

      {activeApp === "hub" ? (
        <ScrollView contentContainerStyle={styles.hubContent} showsVerticalScrollIndicator={false}>
          {/* Sapaan dulu, baru kartu-kartunya -- ini yang bikin layar hub
              kerasa kayak halaman "buat kamu", bukan sekadar menu. */}
          {/* Tombol aksi ditaruh di baris sendiri. Sebelumnya dia berebut
              lebar dengan sapaan, dan nama yang kepotong jadi "ryanil...". */}
          <View style={styles.hubActions}>
            <Pressable
              style={styles.hubIconButton}
              onPress={() => setShowPinManager(true)}
            >
              <Text style={styles.hubIconText}>🔒</Text>
            </Pressable>

            <Pressable style={styles.logoutButton} onPress={() => supabase.auth.signOut()}>
              <Text style={styles.logoutText}>Keluar</Text>
            </Pressable>
          </View>

          <View style={styles.hubHeader}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <Text style={styles.hubGreeting} numberOfLines={1} adjustsFontSizeToFit>
                Halo, {user?.email?.split("@")[0] || "kamu"}
              </Text>
              <Text style={styles.hubSubtitle} numberOfLines={1}>
                Highlight buat kamu ✨
              </Text>
            </View>

            <LinearGradient
              colors={colors.accentSoft}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hubAvatar}
            >
              <Text style={styles.avatarText}>
                {(user?.email || "?").charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>
          </View>

          {HUB_APPS.map((app) => {
            const card = (
              <LinearGradient
                colors={app.colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.hubCard, app.disabled ? styles.hubCardDisabled : null]}
              >
                <Text style={styles.hubCardArt}>{app.art}</Text>

                <View style={styles.hubCardChip}>
                  <Text style={styles.hubCardChipIcon}>{app.icon}</Text>
                  <Text style={styles.hubCardChipText}>{app.label}</Text>
                </View>

                <Text style={styles.hubCardHeadline}>{app.headline}</Text>
                <Text style={styles.hubCardMeta}>{app.meta}</Text>
              </LinearGradient>
            );

            if (app.disabled) return <View key={app.key}>{card}</View>;

            return (
              <Pressable
                key={app.key}
                onPress={() => setActiveApp(app.key)}
                style={({ pressed }) => (pressed ? { opacity: 0.85 } : null)}
              >
                {card}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {activeApp === "journal" ? (
        <JournalScreen onBack={() => setActiveApp("hub")} />
      ) : null}

      {activeApp === "kredit" ? (
        <CreditCalculator onBack={() => setActiveApp("hub")} />
      ) : null}

      {activeApp === "split" ? (
        <SplitBillScreen onBack={() => setActiveApp("hub")} />
      ) : null}

      {activeApp === "tracker" && activeTab === "transactions" ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Formatnya disamakan persis dengan JournalScreen: kembali di kiri,
              judul besar di tengah, refresh di kanan. */}
          <View style={styles.backRow}>
            <Pressable style={styles.backButton} onPress={() => setActiveApp("hub")}>
              <Text style={styles.backButtonText}>‹</Text>
            </Pressable>

            <Text style={styles.backRowTitle}>Money Tracker</Text>

            <Pressable
              disabled={isLoading}
              onPress={loadDashboard}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.pressed,
                isLoading && styles.disabled,
              ]}
            >
              <Text style={styles.backButtonText}>{isLoading ? "…" : "⟳"}</Text>
            </Pressable>
          </View>

          <View style={styles.header}>
            <LinearGradient
              colors={colors.accentSoft}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatarCircle}
            >
              <Text style={styles.avatarText}>
                {(user?.email || "?").charAt(0).toUpperCase()}
              </Text>
            </LinearGradient>

            {/* minWidth 0 wajib: tanpa itu blok teks nolak menyusut dan
                judulnya yang patah jadi dua-tiga baris. */}
            <View style={{ flex: 1, minWidth: 0, paddingHorizontal: 10 }}>
              <Text style={styles.eyebrow} numberOfLines={1} ellipsizeMode="tail">
                {user?.email?.split("@")[0]}
              </Text>
              <Text
                style={styles.monthPill}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {formatDisplayDate(currentMonth() + "-01").split(" ").slice(1).join(" ")}
              </Text>
              <Text style={styles.buildTag} numberOfLines={1}>
                v{APP_VERSION} · {BUILD_DATE}
              </Text>
            </View>
          </View>

          <LinearGradient
            colors={["#073f63", "#0d6a9c", "#1a93cf"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.lifetimeCard}
          >
            <Text style={styles.lifetimeLabel}>Uang yang sudah keluar</Text>
            <Text style={styles.lifetimeSubtitle}>Januari 2026 - Sekarang</Text>
            <Text style={styles.lifetimeValue}>{formatCurrency(totalSpentSince2026)}</Text>
            <View style={styles.lifetimeDivider} />
          </LinearGradient>

          <LinearGradient
            colors={["#0d5c8a", "#1683c0"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <Text style={styles.heroLabel}>Selisih bulan ini</Text>
            <Text
              style={[
                styles.heroValue,
                monthTotals.net >= 0 ? styles.heroValuePositive : styles.heroValueNegative,
              ]}
            >
              {monthTotals.net >= 0 ? "+" : "-"}
              {formatCurrency(Math.abs(monthTotals.net))}
            </Text>

            {/* Proporsi masuk vs keluar -- dua angka berdampingan nggak
                langsung nunjukin mana yang lebih besar. */}
            <View style={styles.heroBar}>
              <View style={[styles.heroBarIncome, { flex: Math.max(incomeShare, 0.001) }]} />
              <View
                style={[styles.heroBarSpending, { flex: Math.max(1 - incomeShare, 0.001) }]}
              />
            </View>

            <View style={styles.heroSplitRow}>
              <View style={styles.heroSplitItem}>
                <Text style={styles.heroSplitLabel}>↙ Pemasukan</Text>
                <Text style={styles.heroSplitValue} numberOfLines={1}>
                  {formatCurrency(monthTotals.income)}
                </Text>
              </View>
              <View style={styles.heroSplitDivider} />
              <View style={styles.heroSplitItem}>
                <Text style={styles.heroSplitLabel}>↗ Pengeluaran</Text>
                <Text style={styles.heroSplitValue} numberOfLines={1}>
                  {formatCurrency(monthTotals.spending)}
                </Text>
              </View>
            </View>

            {spendingComparison ? (
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>
                  {spendingComparison.isIncrease ? "▲" : "▼"} {spendingComparison.percent}%{" "}
                  pengeluaran dari bulan lalu
                </Text>
              </View>
            ) : null}
          </LinearGradient>

          <View style={styles.moneyRow}>
            <View style={styles.moneyCard}>
              <View style={styles.moneyIconWrap}>
                <Text style={styles.moneyIconText}>🐷</Text>
              </View>
              <View style={styles.moneyCardBody}>
                <View style={styles.statCardHeader}>
                  <Text style={styles.moneyLabel}>Budget</Text>
                  {!isEditingBudget ? (
                    <Pressable onPress={handleBudgetEditOpen} style={styles.editIconButton}>
                      <Text style={styles.editIconText}>✎</Text>
                    </Pressable>
                  ) : null}
                </View>
                {!isEditingBudget ? (
                  <Text
                    style={styles.moneyValue}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {formatCurrency(budget)}
                  </Text>
                ) : (
                  <View style={styles.budgetEditRow}>
                    <TextInput
                      style={styles.budgetInput}
                      keyboardType="numeric"
                      placeholder="5.000.000"
                      placeholderTextColor="#94a3b8"
                      value={budgetInput}
                      onChangeText={(v) => setBudgetInput(formatThousands(v))}
                      autoFocus
                    />
                    <Pressable
                      style={styles.iconButtonDark}
                      onPress={handleBudgetSave}
                      disabled={isSavingBudget}
                    >
                      <Text style={styles.iconButtonDarkText}>✓</Text>
                    </Pressable>
                    <Pressable style={styles.iconButtonLight} onPress={handleBudgetCancel}>
                      <Text style={styles.editIconText}>✕</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.moneyCard}>
              <View style={[styles.moneyIconWrap, styles.moneyIconWrapRose]}>
                <Text style={styles.moneyIconText}>💸</Text>
              </View>
              <View style={styles.moneyCardBody}>
                <Text style={styles.moneyLabel}>Sisa Budget</Text>
                <Text
                  style={[styles.moneyValue, leftBudget <= 0 && styles.statCardValueDanger]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {formatCurrency(leftBudget)}
                </Text>
              </View>
            </View>
          </View>

          {/* Dulu tombol bulat melayang di atas tab bar. Posisi itu menutupi
              baris transaksi paling bawah, dan sesudah tab bertambah jadi lima
              dia harus berbagi tempat dengan celah di tengah tab bar. Di sini
              dia tidak menutupi apa pun, dan duduk tepat setelah angka sisa
              budget -- yang memang jadi alasan orang membuka app ini untuk
              mencatat belanja. */}
          <Pressable
            onPress={openAddForm}
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Text style={styles.addButtonPlus}>+</Text>
            <Text style={styles.addButtonText}>Tambah Transaksi</Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab("monthly")}
            style={({ pressed }) => [styles.aiBanner, pressed && styles.pressed]}
          >
            <Text style={styles.aiBannerText}>✨ Lihat AI Review bulan ini</Text>
            <Text style={styles.aiBannerArrow}>→</Text>
          </Pressable>

          {isLoading ? (
            <View style={styles.loadingPanel}>
              <ActivityIndicator color="#0f766e" />
              <Text style={styles.muted}>Loading data dari database...</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorPanel}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Transaksi Bulan Ini</Text>
            <Text style={styles.sectionMeta}>{filteredTransactions.length} item</Text>
          </View>

          <TextInput
            style={styles.searchInput}
            placeholder="Search"
            placeholderTextColor="#94a3b8"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          <View style={styles.filterRow}>
            <View style={styles.filterDropdown}>
              <Dropdown
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[
                  { label: "All categories", value: "all" },
                  ...categories.map((c) => ({ label: c, value: c })),
                  ...incomeCategories.map((c) => ({ label: c, value: c })),
                ]}
              />
            </View>

            <View style={styles.filterDropdown}>
              <Dropdown
                value={sourceFilter}
                onChange={setSourceFilter}
                options={[
                  { label: "All sources", value: "all" },
                  ...fundSources.map((s) => ({ label: s, value: s })),
                ]}
              />
            </View>
          </View>

          <View style={styles.filterRow}>
            <View style={styles.filterDropdown}>
              <Dropdown
                value={danaFilter}
                onChange={setDanaFilter}
                options={[
                  { label: "Semua dana", value: "all" },
                  ...danaDipakaiOptions.map((d) => ({ label: d, value: d })),
                ]}
              />
            </View>
          </View>

          <View style={styles.transactionList}>
            {groupedTransactions.map((group) => (
              <View key={group.date} style={styles.dayGroup}>
                <View style={styles.dayGroupHeader}>
                  <Text style={styles.dayGroupTitle}>{formatDayHeader(group.date)}</Text>
                  <Text style={styles.dayGroupTotal}>
                    Total {formatCurrency(group.total)}
                  </Text>
                </View>

                {group.items.map((transaction) => {
                  const isIncome = transaction.type === "income";
                  const icon = getCategoryIcon(transaction.category);
                  return (
                    <Pressable
                      key={`${transaction.rowNumber}-${transaction.id || transaction.title}`}
                      onPress={() => openEditForm(transaction)}
                      style={({ pressed }) => [
                        styles.transactionRow,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.transactionIconWrap,
                          { backgroundColor: isIncome ? "#dcfce7" : icon.bg },
                        ]}
                      >
                        <Text style={styles.transactionIconText}>
                          {isIncome ? "💰" : icon.emoji}
                        </Text>
                      </View>
                      <View style={styles.transactionCopy}>
                        <Text style={styles.transactionTitle} numberOfLines={1}>
                          {transaction.title}
                        </Text>
                        <Text style={styles.transactionMeta}>
                          {transaction.source}
                          {transaction.danaDipakai ? ` · ${transaction.danaDipakai}` : ""}
                          {transaction.time ? ` · ${transaction.time}` : ""}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.transactionAmount,
                          isIncome && styles.transactionAmountIncome,
                        ]}
                      >
                        {isIncome ? "+" : "-"}
                        {formatCurrency(transaction.amount)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {totalTransactionPages > 1 ? (
            <View style={styles.pagerRow}>
              <Pressable
                onPress={() => setTransactionPage((p) => Math.max(1, p - 1))}
                disabled={transactionPage === 1}
                style={[styles.pagerButton, transactionPage === 1 && styles.disabled]}
              >
                <Text style={styles.pagerButtonText}>‹ Prev</Text>
              </Pressable>

              <Text style={styles.pagerLabel}>
                Halaman {transactionPage} / {totalTransactionPages}
              </Text>

              <Pressable
                onPress={() => setTransactionPage((p) => Math.min(totalTransactionPages, p + 1))}
                disabled={transactionPage === totalTransactionPages}
                style={[
                  styles.pagerButton,
                  transactionPage === totalTransactionPages && styles.disabled,
                ]}
              >
                <Text style={styles.pagerButtonText}>Next ›</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
      ) : null}

      {activeApp === "tracker" && activeTab === "accounts" ? (
        <AccountsScreen
          accounts={accounts}
          onAdd={handleAddAccount}
          onDelete={handleDeleteAccount}
          onUpdateBalance={handleUpdateAccountBalance}
          onUpdateFields={handleUpdateAccountFields}
          installments={installments}
          onDeleteInstallment={handleDeleteInstallment}
          transactions={transactions}
          onDeleteTransaction={handleDeleteTransactionById}
          onMarkPaid={handleMarkTransactionPaid}
          onUpdateTransaction={updateTransaction}
          onUpdateInstallment={updateInstallment}
        />
      ) : null}

      {activeApp === "tracker" && activeTab === "plan" ? (
        <PlanScreen
          goals={goals}
          onAdd={handleAddGoal}
          onUpdate={handleUpdateGoal}
          onDelete={handleDeleteGoal}
        />
      ) : null}

      {activeApp === "tracker" && activeTab === "monthly" ? (
        <MonthlyReportScreen
          transactions={transactions}
          budget={budget}
          onDeleteTransaction={handleDeleteTransactionById}
        />
      ) : null}

      {activeApp === "tracker" && activeTab === "yearly" ? (
        <YearlyReportScreen
          transactions={transactions}
          onRemap={handleRemapTransaction}
          onDelete={handleDeleteTransactionById}
        />
      ) : null}

      {activeApp === "tracker" ? (
      <>
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={styles.tabItem}
            >
              <Text
                style={[styles.tabLabel, active && styles.tabLabelActive]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <TransactionForm
        visible={formVisible}
        initial={editingTransaction}
        onClose={closeForm}
        onSubmit={handleFormSubmit}
        onDelete={editingTransaction ? handleFormDelete : null}
      />
      </>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bgGradient[1],
  },
  content: {
    padding: 20,
    paddingBottom: 60,
    gap: 18,
  },
  hubContent: { gap: 16, padding: 20, paddingBottom: 40 },
  hubActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 12,
  },
  hubHeader: { alignItems: "center", flexDirection: "row", marginBottom: 6 },
  hubGreeting: { color: colors.text, fontSize: 22, fontWeight: "900" },
  hubIconButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  hubIconText: { fontSize: 15 },
  hubSubtitle: { color: colors.textMuted, fontSize: 13, fontWeight: "700", marginTop: 2 },
  hubAvatar: {
    alignItems: "center",
    borderRadius: radius.pill,
    height: 44,
    justifyContent: "center",
    marginLeft: 10,
    width: 44,
    ...shadow.card,
  },
  hubCard: {
    borderRadius: radius.lg,
    justifyContent: "flex-end",
    minHeight: 136,
    overflow: "hidden",
    padding: 18,
    ...shadow.card,
  },
  hubCardDisabled: { opacity: 0.6 },
  // Ilustrasinya cuma hiasan di pojok, jadi sengaja ditaruh di belakang teks.
  hubCardArt: {
    bottom: 6,
    fontSize: 86,
    opacity: 0.28,
    position: "absolute",
    right: 10,
  },
  hubCardChip: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  hubCardChipIcon: { fontSize: 13 },
  hubCardChipText: { color: "#ffffff", fontSize: 11, fontWeight: "800" },
  hubCardHeadline: { color: "#ffffff", fontSize: 18, fontWeight: "900", lineHeight: 24 },
  hubCardMeta: { color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: "700", marginTop: 6 },
  backRow: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  backButton: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  backButtonText: { color: colors.text, fontSize: 20, fontWeight: "900" },
  backRowTitle: { color: colors.text, fontSize: 28, fontWeight: "900" },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  eyebrow: {
    color: "#9cbed4",
    fontSize: 14,
    fontWeight: "700",
  },
  buildTag: {
    color: colors.textFaint,
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
    opacity: 0.75,
  },
  title: {
    color: "#e8f3fb",
    fontSize: 34,
    fontWeight: "800",
    marginTop: 2,
  },
  refreshButton: {
    backgroundColor: "#0e7490",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  refreshText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.55,
  },
  balancePanel: {
    backgroundColor: "#0b5f8d",
    borderRadius: 28,
    padding: 20,
  },
  panelLabel: {
    color: "#a7f3d0",
    fontSize: 14,
    fontWeight: "700",
  },
  balanceValue: {
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "900",
    marginTop: 10,
  },
  loadingPanel: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    ...shadow.card,
    borderRadius: 24,
    gap: 10,
    padding: 18,
  },
  muted: {
    color: "#9cbed4",
    fontSize: 14,
    fontWeight: "600",
  },
  errorPanel: {
    backgroundColor: "rgba(251,113,133,0.16)",
    borderColor: "rgba(251,113,133,0.22)",
    borderRadius: 24,
    borderWidth: 1,
    padding: 14,
  },
  errorText: {
    color: "#fda4af",
    fontSize: 14,
    fontWeight: "700",
  },
  sectionHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 2,
  },
  sectionTitle: {
    color: "#e8f3fb",
    fontSize: 20,
    fontWeight: "900",
  },
  sectionMeta: {
    color: "#9cbed4",
    fontSize: 13,
    fontWeight: "700",
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    borderColor: "#0f5479",
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#e8f3fb",
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
  },
  filterDropdown: {
    flex: 1,
  },
  statRow: {
    gap: 10,
  },
  statCard: {
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    ...shadow.card,
    borderRadius: 24,
    padding: 16,
  },
  statCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statCardLabel: {
    color: "#9cbed4",
    fontSize: 12,
    fontWeight: "700",
  },
  statCardValue: {
    color: "#e8f3fb",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 8,
  },
  statCardValueSmall: {
    color: "#e8f3fb",
    fontSize: 16,
    fontWeight: "900",
  },
  statCardValueDanger: {
    color: "#fb7185",
  },
  editIconButton: {
    width: 30,
    height: 30,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0f5479",
    backgroundColor: "#083c5a",
    alignItems: "center",
    justifyContent: "center",
  },
  editIconText: {
    color: "#9cbed4",
    fontSize: 13,
  },
  budgetEditRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  budgetInput: {
    flex: 1,
    backgroundColor: "#06324c",
    borderColor: "#0f5479",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#e8f3fb",
  },
  iconButtonDark: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: "#0b5f8d",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonDarkText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  iconButtonLight: {
    width: 34,
    height: 34,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0f5479",
    backgroundColor: "#083c5a",
    alignItems: "center",
    justifyContent: "center",
  },
  budgetDivider: {
    height: 1,
    backgroundColor: "#06324c",
    marginVertical: 12,
  },
  pagerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  pagerButton: {
    backgroundColor: "#083c5a",
    borderColor: "#0f5479",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pagerButtonText: {
    color: "#e8f3fb",
    fontSize: 13,
    fontWeight: "800",
  },
  pagerLabel: {
    color: "#9cbed4",
    fontSize: 12,
    fontWeight: "700",
  },
  transactionList: {
    gap: 10,
  },
  transactionRow: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  transactionCopy: {
    flex: 1,
    paddingRight: 12,
  },
  transactionTitle: {
    color: "#e8f3fb",
    fontSize: 15,
    fontWeight: "900",
  },
  transactionMeta: {
    color: "#9cbed4",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
  },
  transactionAmount: {
    color: "#fb7185",
    flexShrink: 0,
    fontSize: 15,
    fontWeight: "900",
  },
  transactionAmountIncome: {
    color: "#6ee7b7",
  },
  logoutButton: {
    backgroundColor: "rgba(251,113,133,0.16)",
    borderColor: "rgba(251,113,133,0.22)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutText: {
    color: "#fda4af",
    fontSize: 13,
    fontWeight: "700",
  },
  addButton: {
    alignItems: "center",
    backgroundColor: colors.accent[0],
    borderRadius: radius.md,
    elevation: 4,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 12,
    paddingVertical: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  addButtonPlus: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    marginTop: -2,
  },
  addButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceBorder,
    paddingBottom: 18,
    paddingTop: 14,
    // Jaraknya dibagi rata ANTAR tulisan, bukan lebar kotaknya yang disamakan.
    // Dengan kotak sama lebar, tiap label memang duduk di tengah kotaknya
    // masing-masing -- tapi karena panjang katanya beda jauh ("Plan" vs
    // "Tahunan"), jarak yang kelihatan jadi timpang: "Bulanan Tahunan" nempel
    // sementara "Akun" dan "Plan" berjauhan. space-evenly menyamakan enam
    // celahnya, termasuk yang di kiri dan kanan layar.
    justifyContent: "space-evenly",
  },
  tabItem: {
    alignItems: "center",
    paddingVertical: 4,
    // Kotaknya ikut lebar tulisan, jadi area sentuhnya diberi sedikit ruang
    // tambahan supaya "Plan" tidak jadi target yang sempit.
    paddingHorizontal: 6,
  },
  tabLabel: {
    color: colors.textFaint,
    // 14: lima tab dibagi rata tanpa celah FAB lagi, jadi ada ruang lebih
    // dari waktu mereka masih berebut tempat dengan tombol bulat di tengah.
    fontSize: 14,
    fontWeight: "800",
  },
  tabLabelActive: {
    color: colors.accent[0],
  },
  avatarCircle: {
    alignItems: "center",
    borderRadius: radius.md,
    height: 44,
    justifyContent: "center",
    width: 44,
    ...shadow.raised,
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  monthPill: {
    color: "#e8f3fb",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2,
    textTransform: "capitalize",
  },
  heroCard: {
    borderRadius: 28,
    padding: 22,
  },
  heroLabel: {
    color: "#f5d0fe",
    fontSize: 14,
    fontWeight: "700",
  },
  heroValue: {
    color: "#ffffff",
    fontSize: 32,
    fontWeight: "900",
    marginTop: 10,
  },
  heroChip: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroChipText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  heroValuePositive: {
    color: "#a7f3d0",
  },
  heroValueNegative: {
    color: "#fecdd3",
  },
  heroBar: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 999,
    flexDirection: "row",
    height: 8,
    marginTop: 16,
    overflow: "hidden",
  },
  heroBarIncome: {
    backgroundColor: "#34d399",
  },
  heroBarSpending: {
    backgroundColor: "#fb7185",
  },
  heroSplitRow: {
    flexDirection: "row",
    marginTop: 16,
  },
  heroSplitItem: {
    flex: 1,
  },
  heroSplitDivider: {
    backgroundColor: "rgba(255,255,255,0.25)",
    marginHorizontal: 14,
    width: 1,
  },
  heroSplitLabel: {
    color: "#f5d0fe",
    fontSize: 12,
    fontWeight: "700",
  },
  heroSplitValue: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
    marginTop: 3,
  },
  lifetimeCard: {
    borderRadius: 28,
    padding: 20,
  },
  lifetimeLabel: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  lifetimeSubtitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 2,
  },
  lifetimeValue: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "900",
    marginTop: 14,
  },
  lifetimeDivider: {
    backgroundColor: "rgba(255,255,255,0.5)",
    borderRadius: 2,
    height: 3,
    marginTop: 14,
    width: "100%",
  },
  moneyRow: {
    gap: 10,
  },
  moneyCard: {
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.surfaceBorder,
    borderWidth: 1,
    ...shadow.card,
    borderRadius: 24,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  moneyIconWrap: {
    alignItems: "center",
    backgroundColor: "rgba(251,191,36,0.16)",
    borderRadius: 16,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  moneyIconWrapRose: {
    backgroundColor: "rgba(251,113,133,0.16)",
  },
  moneyIconText: {
    fontSize: 16,
  },
  moneyCardBody: {
    flex: 1,
  },
  moneyLabel: {
    color: "#9cbed4",
    fontSize: 11,
    fontWeight: "700",
  },
  moneyValue: {
    color: "#e8f3fb",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 4,
  },
  aiBanner: {
    alignItems: "center",
    backgroundColor: "#0b5f8d",
    borderRadius: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  aiBannerText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
  },
  aiBannerArrow: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  dayGroup: {
    gap: 8,
  },
  dayGroupHeader: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 2,
  },
  dayGroupTitle: {
    color: "#e8f3fb",
    fontSize: 13,
    fontWeight: "900",
  },
  dayGroupTotal: {
    color: "#9cbed4",
    fontSize: 11,
    fontWeight: "700",
  },
  transactionIconWrap: {
    alignItems: "center",
    borderRadius: 16,
    height: 40,
    justifyContent: "center",
    marginRight: 12,
    width: 40,
  },
  transactionIconText: {
    fontSize: 18,
  },
});
