import { StatusBar } from "expo-status-bar";
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
  supabase,
} from "./src/services/supabase";
import { formatCurrency, formatDate } from "./src/utils/formatters";
import { getAccountBalanceDeltas } from "./src/utils/accountBalance";
import { currentMonth, getTransactionMonth } from "./src/utils/date";
import { categories, fundSources } from "./src/constants/options";
import Login from "./src/components/Login";
import TransactionForm from "./src/components/TransactionForm";
import Dropdown from "./src/components/Dropdown";
import AccountsScreen from "./src/components/AccountsScreen";
import DailyReportScreen from "./src/components/DailyReportScreen";
import MonthlyReportScreen from "./src/components/MonthlyReportScreen";

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

const TABS = [
  { key: "transactions", label: "Transaksi" },
  { key: "accounts", label: "Akun" },
  { key: "daily", label: "Daily" },
  { key: "monthly", label: "Monthly" },
];

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
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

  const loadDashboard = useCallback(async () => {
    if (!user) return;
    try {
      setError("");
      setIsLoading(true);

      const [nextAccounts, nextTransactions, nextBudget] = await Promise.all([
        getAccounts(),
        getTransactions(),
        getBudget(user.id),
      ]);

      setAccounts(nextAccounts);
      setTransactions(
        nextTransactions
          .filter((item) => item.title)
          .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
      );
      setBudget(nextBudget);
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

  const totalTransactionPages = Math.max(
    1,
    Math.ceil(filteredTransactions.length / TRANSACTIONS_PAGE_SIZE)
  );

  const paginatedTransactions = useMemo(
    () =>
      filteredTransactions.slice(
        (transactionPage - 1) * TRANSACTIONS_PAGE_SIZE,
        transactionPage * TRANSACTIONS_PAGE_SIZE
      ),
    [filteredTransactions, transactionPage]
  );

  const totalSpending = useMemo(
    () => currentMonthTransactions.reduce((sum, t) => sum + Number(t.amount), 0),
    [currentMonthTransactions]
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

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />

      {activeTab === "transactions" ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={styles.eyebrow} numberOfLines={1} ellipsizeMode="tail">{user?.email?.split('@')[0]}</Text>
              <Text style={styles.title}>V2 Native</Text>
            </View>

            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
              <Pressable
                disabled={isLoading}
                onPress={loadDashboard}
                style={({ pressed }) => [
                  styles.refreshButton,
                  pressed && styles.pressed,
                  isLoading && styles.disabled,
                ]}
              >
                <Text style={styles.refreshText}>Refresh</Text>
              </Pressable>

              <Pressable
                onPress={() => supabase.auth.signOut()}
                style={({ pressed }) => [
                  styles.logoutButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.logoutText}>Keluar</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.balancePanel}>
            <Text style={styles.panelLabel}>Total Spending</Text>
            <Text style={styles.balanceValue}>{formatCurrency(totalSpending)}</Text>
          </View>

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

          <View style={styles.statRow}>
            <View style={styles.statCard}>
              <View style={styles.statCardHeader}>
                <Text style={styles.statCardLabel}>Budget Manual</Text>
                {!isEditingBudget ? (
                  <Pressable onPress={handleBudgetEditOpen} style={styles.editIconButton}>
                    <Text style={styles.editIconText}>✎</Text>
                  </Pressable>
                ) : null}
              </View>

              {!isEditingBudget ? (
                <Text style={styles.statCardValue}>{formatCurrency(budget)}</Text>
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

              <View style={styles.budgetDivider} />
              <View style={styles.statCardHeader}>
                <Text style={styles.statCardLabel}>Sisa Budget</Text>
                <Text
                  style={[
                    styles.statCardValueSmall,
                    leftBudget <= 0 && styles.statCardValueDanger,
                  ]}
                >
                  {formatCurrency(leftBudget)}
                </Text>
              </View>
            </View>
          </View>

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
            {paginatedTransactions.map((transaction) => (
              <Pressable
                key={`${transaction.rowNumber}-${transaction.id || transaction.title}`}
                onPress={() => openEditForm(transaction)}
                style={({ pressed }) => [
                  styles.transactionRow,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.transactionCopy}>
                  <Text style={styles.transactionTitle}>{transaction.title}</Text>
                  <Text style={styles.transactionMeta}>
                    {formatDate(transaction.date)} · {transaction.source} ·{" "}
                    {transaction.danaDipakai}
                  </Text>
                </View>
                <Text style={styles.transactionAmount}>
                  -{formatCurrency(transaction.amount)}
                </Text>
              </Pressable>
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

      {activeTab === "daily" ? <DailyReportScreen transactions={transactions} /> : null}

      {activeTab === "monthly" ? <MonthlyReportScreen transactions={transactions} /> : null}

      {activeTab === "transactions" ? (
        <Pressable
          onPress={openAddForm}
          style={({ pressed }) => [styles.fab, pressed && styles.pressed]}
        >
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      ) : null}

      <View style={styles.tabBar}>
        {TABS.map((tab) => {
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
    paddingBottom: 40,
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
    bottom: 76,
    elevation: 6,
    height: 60,
    justifyContent: "center",
    position: "absolute",
    right: 24,
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
});
