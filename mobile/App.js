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
  addAccount,
  deleteAccount,
  getBudget,
  saveBudget,
  getGoals,
  addGoal,
  updateGoal,
  deleteGoal,
  getSplitBills,
  addSplitBill,
  updateSplitBill,
  deleteSplitBill,
  supabase,
} from "./src/services/supabase";
import { formatCurrency, formatDate } from "./src/utils/formatters";
import { getAccountBalanceDeltas } from "./src/utils/accountBalance";
import {
  currentMonth,
  formatDisplayDate,
  getTransactionMonth,
  normalizeDate,
  shiftMonth,
} from "./src/utils/date";
import { categories, incomeCategories, fundSources } from "./src/constants/options";
import Login from "./src/components/Login";
import TransactionForm from "./src/components/TransactionForm";
import Dropdown from "./src/components/Dropdown";
import AccountsScreen from "./src/components/AccountsScreen";
import PlanScreen from "./src/components/PlanScreen";
import SplitBillScreen from "./src/components/SplitBillScreen";
import MonthlyReportScreen from "./src/components/MonthlyReportScreen";
import PinLockScreen from "./src/components/PinLockScreen";
import { hasPinSet } from "./src/utils/pinStorage";

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

const TABS_LEFT = [
  { key: "transactions", label: "Home" },
  { key: "accounts", label: "Akun" },
];
const TABS_RIGHT = [
  { key: "plan", label: "Plan" },
  { key: "monthly", label: "Monthly" },
];

const CATEGORY_ICONS = {
  "Account Transfer": { emoji: "🔁", bg: "#dcfce7", color: "#15803d" },
  Food: { emoji: "🍔", bg: "#ffedd5", color: "#c2410c" },
  Transportation: { emoji: "🚗", bg: "#dbeafe", color: "#1d4ed8" },
  Groceries: { emoji: "🛒", bg: "#fef9c3", color: "#a16207" },
  Utilities: { emoji: "💡", bg: "#fef3c7", color: "#b45309" },
  Entertainment: { emoji: "🎮", bg: "#fce7f3", color: "#be185d" },
  Internet: { emoji: "🌐", bg: "#cffafe", color: "#0e7490" },
  Shopping: { emoji: "🛍️", bg: "#ede9fe", color: "#6d28d9" },
  Health: { emoji: "❤️", bg: "#ffe4e6", color: "#be123c" },
  Education: { emoji: "📚", bg: "#e0e7ff", color: "#4338ca" },
  Miscellaneous: { emoji: "✨", bg: "#f1f5f9", color: "#475569" },
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
  const [goals, setGoals] = useState([]);
  const [splitBills, setSplitBills] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [formVisible, setFormVisible] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [activeTab, setActiveTab] = useState("transactions");
  const [budget, setBudget] = useState(0);
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
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

      const [nextAccounts, nextTransactions, nextBudget, nextGoals, nextSplitBills] = await Promise.all([
        getAccounts(),
        getTransactions(),
        getBudget(user.id),
        getGoals(),
        getSplitBills(),
      ]);

      setAccounts(nextAccounts);
      setTransactions(
        nextTransactions
          .filter((item) => item.title)
          .sort((a, b) => {
            const dateCompare = String(b.date).localeCompare(String(a.date));
            if (dateCompare !== 0) return dateCompare;
            return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
          })
      );
      setBudget(nextBudget);
      setGoals(nextGoals);
      setSplitBills(nextSplitBills);
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
      return matchesQuery && matchesCategory && matchesSource;
    });
  }, [currentMonthTransactions, searchQuery, categoryFilter, sourceFilter]);

  useEffect(() => {
    setTransactionPage(1);
  }, [searchQuery, categoryFilter, sourceFilter]);

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

  const totalSpending = useMemo(
    () =>
      currentMonthTransactions
        .filter((t) => t.type !== "income")
        .reduce((sum, t) => sum + Number(t.amount), 0),
    [currentMonthTransactions]
  );

  const totalSpentSince2026 = useMemo(
    () =>
      transactions
        .filter((t) => t.type !== "income" && String(t.date) >= "2026-01-01")
        .reduce((sum, t) => sum + Number(t.amount), 0),
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
    setBudgetInput(String(budget || ""));
    setIsEditingBudget(true);
  };

  const handleBudgetSave = async () => {
    const newBudget = Number(String(budgetInput).replace(/[^\d]/g, ""));
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

      await Promise.all(
        deltas.map((delta) =>
          updateAccountBalance(
            delta.account.id,
            Number(delta.account.startingBalance) + delta.amount
          )
        )
      );
    },
    [accounts]
  );

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

  const handleFormSubmit = async (form) => {
    if (editingTransaction) {
      const payload = { ...form, id: editingTransaction.id };
      await updateTransaction(payload);
      await applyBalanceDeltas(editingTransaction, payload);
    } else {
      const payload = { ...form, id: generateId() };
      await addTransaction(payload);
      await applyBalanceDeltas(null, payload);
    }
    closeForm();
    await loadDashboard();
  };

  const handleFormDelete = async () => {
    if (!editingTransaction) return;
    await deleteTransaction(editingTransaction.id);
    await applyBalanceDeltas(editingTransaction, null);
    closeForm();
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

  const handleAddSplitBill = async (bill) => {
    await addSplitBill(bill);
    await loadDashboard();
  };

  const handleUpdateSplitBill = async (bill) => {
    await updateSplitBill(bill);
    await loadDashboard();
  };

  const handleDeleteSplitBill = async (id) => {
    await deleteSplitBill(id);
    await loadDashboard();
  };

  if (isAuthChecking) {
    return (
      <View style={[styles.screen, { justifyContent: "center", alignItems: "center", backgroundColor: "#0a051b", flex: 1 }]}>
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
      <View style={[styles.screen, { justifyContent: "center", alignItems: "center", backgroundColor: "#0a051b", flex: 1 }]}>
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
      <StatusBar style="dark" />

      {activeTab === "transactions" ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {(user?.email || "?").charAt(0).toUpperCase()}
              </Text>
            </View>

            <View style={{ flex: 1, paddingHorizontal: 12 }}>
              <Text style={styles.eyebrow} numberOfLines={1} ellipsizeMode="tail">
                {user?.email?.split("@")[0]}
              </Text>
              <Text style={styles.monthPill}>{formatDisplayDate(currentMonth() + "-01").split(" ").slice(1).join(" ")}</Text>
            </View>

            <Pressable
              disabled={isLoading}
              onPress={loadDashboard}
              style={({ pressed }) => [
                styles.iconCircleButton,
                pressed && styles.pressed,
                isLoading && styles.disabled,
              ]}
            >
              <Text style={styles.iconCircleText}>{isLoading ? "…" : "↻"}</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowPinManager(true)}
              style={({ pressed }) => [styles.iconCircleButton, pressed && styles.pressed]}
            >
              <Text style={styles.iconCircleText}>🔒</Text>
            </Pressable>

            <Pressable
              onPress={() => supabase.auth.signOut()}
              style={({ pressed }) => [styles.iconCircleButton, pressed && styles.pressed]}
            >
              <Text style={styles.iconCircleText}>⎋</Text>
            </Pressable>
          </View>

          <LinearGradient
            colors={["#6366f1", "#a855f7", "#ec4899"]}
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
            colors={["#ec4899", "#8b5cf6"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroCard}
          >
            <Text style={styles.heroLabel}>Total Spending</Text>
            <Text style={styles.heroValue}>{formatCurrency(totalSpending)}</Text>
            {spendingComparison ? (
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>
                  {spendingComparison.isIncrease ? "▲" : "▼"} {spendingComparison.percent}%{" "}
                  dari bulan lalu
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
                  <Text style={styles.moneyValue} numberOfLines={1}>
                    {formatCurrency(budget)}
                  </Text>
                ) : (
                  <View style={styles.budgetEditRow}>
                    <TextInput
                      style={styles.budgetInput}
                      keyboardType="numeric"
                      placeholder="5000000"
                      placeholderTextColor="#94a3b8"
                      value={budgetInput}
                      onChangeText={setBudgetInput}
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
                >
                  {formatCurrency(leftBudget)}
                </Text>
              </View>
            </View>

            <Pressable
              style={({ pressed }) => [styles.splitBillButton, pressed && styles.pressed]}
              onPress={() => setActiveTab("splitbill")}
            >
              <Text style={styles.splitBillButtonText}>🧾+</Text>
            </Pressable>
          </View>

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

      {activeTab === "accounts" ? (
        <AccountsScreen
          accounts={accounts}
          onAdd={handleAddAccount}
          onDelete={handleDeleteAccount}
          onUpdateBalance={handleUpdateAccountBalance}
        />
      ) : null}

      {activeTab === "plan" ? (
        <PlanScreen
          goals={goals}
          onAdd={handleAddGoal}
          onUpdate={handleUpdateGoal}
          onDelete={handleDeleteGoal}
        />
      ) : null}

      {activeTab === "monthly" ? (
        <MonthlyReportScreen transactions={transactions} budget={budget} />
      ) : null}

      {activeTab === "splitbill" ? (
        <SplitBillScreen
          bills={splitBills}
          onAdd={handleAddSplitBill}
          onUpdate={handleUpdateSplitBill}
          onDelete={handleDeleteSplitBill}
          onBack={() => setActiveTab("transactions")}
        />
      ) : null}

      <View style={styles.tabBar}>
        {TABS_LEFT.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={styles.tabItem}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}

        <View style={styles.tabSpacer} />

        {TABS_RIGHT.map((tab) => {
          const active = activeTab === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={styles.tabItem}
            >
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={openAddForm}
        style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <TransactionForm
        visible={formVisible}
        initial={editingTransaction}
        onClose={closeForm}
        onSubmit={handleFormSubmit}
        onDelete={editingTransaction ? handleFormDelete : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#f4f7fb",
  },
  content: {
    padding: 20,
    paddingBottom: 110,
    gap: 18,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  eyebrow: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "700",
  },
  title: {
    color: "#0f172a",
    fontSize: 34,
    fontWeight: "800",
    marginTop: 2,
  },
  refreshButton: {
    backgroundColor: "#0f766e",
    borderRadius: 8,
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
    backgroundColor: "#0f172a",
    borderRadius: 8,
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
    backgroundColor: "#ffffff",
    borderRadius: 8,
    gap: 10,
    padding: 18,
  },
  muted: {
    color: "#64748b",
    fontSize: 14,
    fontWeight: "600",
  },
  errorPanel: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  errorText: {
    color: "#be123c",
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
    color: "#0f172a",
    fontSize: 20,
    fontWeight: "900",
  },
  sectionMeta: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
  },
  searchInput: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: "#0f172a",
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
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
  },
  statCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statCardLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  statCardValue: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 8,
  },
  statCardValueSmall: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
  },
  statCardValueDanger: {
    color: "#e11d48",
  },
  editIconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  editIconText: {
    color: "#475569",
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
    backgroundColor: "#f4f7fb",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: "#0f172a",
  },
  iconButtonDark: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#0f172a",
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
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
  },
  budgetDivider: {
    height: 1,
    backgroundColor: "#f1f5f9",
    marginVertical: 12,
  },
  pagerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  pagerButton: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pagerButtonText: {
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "800",
  },
  pagerLabel: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  transactionList: {
    gap: 10,
  },
  transactionRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  transactionCopy: {
    flex: 1,
    paddingRight: 12,
  },
  transactionTitle: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
  },
  transactionMeta: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 5,
  },
  transactionAmount: {
    color: "#e11d48",
    flexShrink: 0,
    fontSize: 15,
    fontWeight: "900",
  },
  transactionAmountIncome: {
    color: "#16a34a",
  },
  logoutButton: {
    backgroundColor: "#fff1f2",
    borderColor: "#fecdd3",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  logoutText: {
    color: "#be123c",
    fontSize: 13,
    fontWeight: "700",
  },
  fab: {
    alignItems: "center",
    backgroundColor: "#ec4899",
    borderRadius: 30,
    bottom: 38,
    elevation: 6,
    height: 60,
    justifyContent: "center",
    left: "50%",
    marginLeft: -30,
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    width: 60,
  },
  fabText: {
    color: "#ffffff",
    fontSize: 30,
    fontWeight: "900",
    marginTop: -2,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    paddingBottom: 18,
    paddingTop: 14,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  tabLabel: {
    color: "#94a3b8",
    fontSize: 15,
    fontWeight: "800",
  },
  tabLabelActive: {
    color: "#ec4899",
  },
  tabSpacer: {
    width: 60,
  },
  avatarCircle: {
    alignItems: "center",
    backgroundColor: "#8b5cf6",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  monthPill: {
    color: "#0f172a",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 2,
    textTransform: "capitalize",
  },
  iconCircleButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    marginLeft: 8,
    width: 40,
  },
  iconCircleText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "800",
  },
  heroCard: {
    borderRadius: 8,
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
    borderRadius: 20,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  heroChipText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  lifetimeCard: {
    borderRadius: 20,
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
    flexDirection: "row",
    gap: 10,
  },
  moneyCard: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  moneyIconWrap: {
    alignItems: "center",
    backgroundColor: "#fef3c7",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  moneyIconWrapRose: {
    backgroundColor: "#ffe4e6",
  },
  moneyIconText: {
    fontSize: 16,
  },
  moneyCardBody: {
    flex: 1,
  },
  moneyLabel: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  moneyValue: {
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "900",
    marginTop: 4,
  },
  splitBillButton: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 16,
    justifyContent: "center",
    width: 52,
  },
  splitBillButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
  },
  aiBanner: {
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 16,
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
    color: "#0f172a",
    fontSize: 13,
    fontWeight: "900",
  },
  dayGroupTotal: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "700",
  },
  transactionIconWrap: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    marginRight: 12,
    width: 40,
  },
  transactionIconText: {
    fontSize: 18,
  },
});
