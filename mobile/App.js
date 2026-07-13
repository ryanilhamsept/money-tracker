import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getAccounts, getTransactions } from "./src/services/googleSheets";
import { formatCurrency, formatDate } from "./src/utils/formatters";

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      setError("");
      setIsLoading(true);

      const [nextAccounts, nextTransactions] = await Promise.all([
        getAccounts(),
        getTransactions(),
      ]);

      setAccounts(nextAccounts);
      setTransactions(
        nextTransactions
          .filter((item) => item.title)
          .sort((a, b) => Number(b.rowNumber || 0) - Number(a.rowNumber || 0))
          .slice(0, 8)
      );
    } catch (err) {
      setError(err.message || "Gagal mengambil data tracker.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard();
  }, [loadDashboard]);

  const totalBalance = useMemo(
    () =>
      accounts.reduce(
        (sum, account) => sum + (Number(account.startingBalance) || 0),
        0
      ),
    [accounts]
  );

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Money Tracker</Text>
            <Text style={styles.title}>V2 Native</Text>
          </View>

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
        </View>

        <View style={styles.balancePanel}>
          <Text style={styles.panelLabel}>Total saldo akun</Text>
          <Text style={styles.balanceValue}>{formatCurrency(totalBalance)}</Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator color="#0f766e" />
            <Text style={styles.muted}>Loading data dari Google Sheets...</Text>
          </View>
        ) : null}

        {error ? (
          <View style={styles.errorPanel}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Akun</Text>
          <Text style={styles.sectionMeta}>{accounts.length} akun</Text>
        </View>

        <View style={styles.accountList}>
          {accounts.map((account) => (
            <View key={account.id} style={styles.accountRow}>
              <View>
                <Text style={styles.accountName}>{account.name}</Text>
                <Text style={styles.accountType}>{account.type}</Text>
              </View>
              <Text style={styles.accountBalance}>
                {formatCurrency(account.startingBalance)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Transaksi terbaru</Text>
          <Text style={styles.sectionMeta}>{transactions.length} item</Text>
        </View>

        <View style={styles.transactionList}>
          {transactions.map((transaction) => (
            <View
              key={`${transaction.rowNumber}-${transaction.id || transaction.title}`}
              style={styles.transactionRow}
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
            </View>
          ))}
        </View>
      </ScrollView>
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
  accountList: {
    gap: 10,
  },
  accountRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  accountName: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "900",
  },
  accountType: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
  },
  accountBalance: {
    color: "#0f172a",
    flexShrink: 0,
    fontSize: 16,
    fontWeight: "900",
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
});
