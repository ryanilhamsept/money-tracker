import { useEffect, useRef, useState } from "react";
import { normalizeDate } from "../utils/date";
import { parseAmountInput } from "../utils/parser";
import {
    deduplicateTransactionsById,
    normalizeTransaction,
} from "../utils/transactions";
import {
    syncTransactionToSupabase,
    deleteTransactionFromSupabase,
    getTransactionsFromSupabase,
    updateTransactionToSupabase,
} from "../services/supabase";

const assertSuccessfulSync = (result) => {
    if (result?.success === false) {
        throw new Error(result.error || "Database rejected the request.");
    }
};

const PENDING_ADDS_STORAGE_KEY = "money-tracker.pending-adds.v1";
const AUTO_RETRY_INTERVAL_MS = 8000;

const readPendingAdds = () => {
    if (typeof window === "undefined") return [];

    try {
        const raw = window.localStorage.getItem(PENDING_ADDS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("FAILED TO READ PENDING TRANSACTIONS:", error);
        return [];
    }
};

const writePendingAdds = (transactions) => {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.setItem(
            PENDING_ADDS_STORAGE_KEY,
            JSON.stringify(transactions)
        );
    } catch (error) {
        console.error("FAILED TO STORE PENDING TRANSACTIONS:", error);
    }
};

export const useTransactions = ({
    applyTransactionBalanceChange,
    syncAccountBalancesForTransaction,
    reloadAccounts,
} = {}) => {
    const [transactions, setTransactions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [syncStatus, setSyncStatus] = useState(
        "Loading data from database..."
    );
    const pendingMutationCountRef = useRef(0);
    const pendingAddsRef = useRef(readPendingAdds());
    const pendingSyncRunningRef = useRef(false);
    const [pendingSyncCount, setPendingSyncCount] = useState(
        () => readPendingAdds().length
    );

    const replacePendingAdds = (nextPendingAdds) => {
        pendingAddsRef.current = nextPendingAdds;
        setPendingSyncCount(nextPendingAdds.length);
        writePendingAdds(nextPendingAdds);
    };

    const queuePendingAdd = (transaction) => {
        replacePendingAdds([
            ...pendingAddsRef.current.filter((item) => item.id !== transaction.id),
            transaction,
        ]);
    };

    const removePendingAdd = (id) => {
        replacePendingAdds(
            pendingAddsRef.current.filter((transaction) => transaction.id !== id)
        );
    };

    const startMutation = () => {
        pendingMutationCountRef.current += 1;
    };

    const finishMutation = () => {
        pendingMutationCountRef.current = Math.max(
            0,
            pendingMutationCountRef.current - 1
        );

        if (pendingMutationCountRef.current === 0) {
            void reloadAccounts?.();
        }
    };

    const mergePendingAdds = (rows) => {
        const syncedIds = new Set(
            rows.map((transaction) => String(transaction.id || "").trim())
        );

        const remainingPendingAdds = pendingAddsRef.current.filter(
            (transaction) => !syncedIds.has(transaction.id)
        );

        if (remainingPendingAdds.length !== pendingAddsRef.current.length) {
            replacePendingAdds(remainingPendingAdds);
        }

        return [
            ...remainingPendingAdds.map((transaction) => ({
                ...transaction,
                syncState: "pending",
            })),
            ...rows,
        ];
    };

    const loadTransactions = async () => {
        try {
            setIsLoading(true);

            const rows = await getTransactionsFromSupabase();

            if (!Array.isArray(rows)) {
                console.error("Database response is not array:", rows);
                setSyncStatus("Database response is not valid.");
                return;
            }

            const normalizedData = rows
                .map(normalizeTransaction)
                .filter((item) => item.title)
                .map((item) => ({
                    ...item,
                    date: normalizeDate(item.date),
                }));

            setTransactions(mergePendingAdds(normalizedData));
            setSyncStatus("");
            return true;
        } catch (error) {
            console.error("LOAD TRANSACTIONS ERROR:", error);
            setSyncStatus("Failed to load data from database.");
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    const retryPendingSync = async ({ showStatus = true } = {}) => {
        if (pendingSyncRunningRef.current) return false;

        const pendingAdds = pendingAddsRef.current;

        if (pendingAdds.length === 0) {
            if (showStatus) {
                setSyncStatus("All local changes are synced.");
                setTimeout(() => setSyncStatus(""), 2500);
            }
            return true;
        }

        pendingSyncRunningRef.current = true;
        startMutation();

        if (showStatus) {
            setSyncStatus(`Syncing ${pendingAdds.length} queued transaction...`);
        }

        let failedCount = 0;

        try {
            for (const transaction of pendingAdds) {
                try {
                    const result = await syncTransactionToSupabase(
                        transaction
                    );
                    assertSuccessfulSync(result);
                    await syncAccountBalancesForTransaction?.(null, transaction);
                    removePendingAdd(transaction.id);

                    setTransactions((current) =>
                        current.map((item) =>
                            item.id === transaction.id
                                ? { ...item, syncState: "synced" }
                                : item
                        )
                    );
                } catch (error) {
                    failedCount += 1;
                    console.error("PENDING TRANSACTION SYNC ERROR:", error);

                    setTransactions((current) =>
                        current.map((item) =>
                            item.id === transaction.id
                                ? { ...item, syncState: "error" }
                                : item
                        )
                    );
                }
            }

            if (failedCount > 0) {
                setSyncStatus(
                    `${failedCount} transaction saved locally. Auto-sync will keep trying.`
                );
                return false;
            }

            setSyncStatus("Queued transactions synced.");
            setTimeout(() => setSyncStatus(""), 3000);
            return true;
        } finally {
            pendingSyncRunningRef.current = false;
            finishMutation();
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadTransactions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (pendingSyncCount === 0) return undefined;

        const handleOnline = () => {
            void retryPendingSync({ showStatus: true });
        };

        const handleFocus = () => {
            void retryPendingSync({ showStatus: false });
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === "visible") {
                void retryPendingSync({ showStatus: false });
            }
        };

        const immediateRetry = setTimeout(() => {
            void retryPendingSync({ showStatus: false });
        }, 1200);

        const retryTimer = setInterval(() => {
            void retryPendingSync({ showStatus: false });
        }, AUTO_RETRY_INTERVAL_MS);

        window.addEventListener("online", handleOnline);
        window.addEventListener("focus", handleFocus);
        document.addEventListener("visibilitychange", handleVisibilityChange);

        return () => {
            clearTimeout(immediateRetry);
            clearInterval(retryTimer);
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("focus", handleFocus);
            document.removeEventListener(
                "visibilitychange",
                handleVisibilityChange
            );
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingSyncCount]);

    const addTransaction = (form) => {
        const amount = parseAmountInput(form.amount);

        if (!form.title.trim() || !amount) return false;

        const maxRowNumber = transactions.length > 0
            ? Math.max(...transactions.map((t) => t.rowNumber || 0))
            : 0;

        const newTransaction = {
            id: crypto.randomUUID(),
            ...form,
            title: form.title.trim(),
            amount,
            date: normalizeDate(form.date),
            createdAt: new Date().toISOString(),
            rowNumber: maxRowNumber + 1,
            syncState: "pending",
        };

        setTransactions((current) => [newTransaction, ...current]);
        applyTransactionBalanceChange?.(null, newTransaction);
        queuePendingAdd(newTransaction);
        setSyncStatus("Saved locally. Auto-sync is running.");

        void retryPendingSync({ showStatus: false });

        return true;
    };

    const updateTransaction = async (id, updatedForm) => {
        const amount = parseAmountInput(String(updatedForm.amount));

        if (!updatedForm.title.trim() || !amount) return;

        const existing = transactions.find((item) => item.id === id);

        const updatedTransaction = {
            id,
            title: updatedForm.title.trim(),
            amount,
            category: updatedForm.category,
            source: updatedForm.source,
            danaDipakai: updatedForm.danaDipakai,
            date: normalizeDate(updatedForm.date),
            rowNumber: existing ? existing.rowNumber : 0,
        };

        setTransactions((current) =>
            current.map((item) =>
                item.id === id
                    ? {
                          ...item,
                          ...updatedTransaction,
                      }
                    : item
            )
        );
        applyTransactionBalanceChange?.(existing, updatedTransaction);

        setSyncStatus("Updating transaction...");
        startMutation();

        try {
            const result = await updateTransactionToSupabase(updatedTransaction);
            assertSuccessfulSync(result);
            await syncAccountBalancesForTransaction?.(
                existing,
                updatedTransaction
            );

            setSyncStatus("Transaction and account balance updated.");
            setTimeout(() => setSyncStatus(""), 3000);
            return true;
        } catch (error) {
            console.error("UPDATE TRANSACTION ERROR:", error);

            // Revert optimistic update
            if (existing) {
                setTransactions((current) =>
                    current.map((item) => (item.id === id ? existing : item))
                );
                applyTransactionBalanceChange?.(updatedTransaction, existing);
            }
            setSyncStatus("Failed to update transaction. Please try again.");
            return false;
        } finally {
            finishMutation();
        }
    };

    const deleteTransaction = async (id) => {
        const deletedTransaction = transactions.find(
            (item) => item.id === id
        );

        setTransactions((current) =>
            current.filter((item) => item.id !== id)
        );
        applyTransactionBalanceChange?.(deletedTransaction, null);

        setSyncStatus("Deleting from database...");
        startMutation();

        try {
            const result = await deleteTransactionFromSupabase(id);
            assertSuccessfulSync(result);
            await syncAccountBalancesForTransaction?.(deletedTransaction, null);

            setSyncStatus(
                deletedTransaction
                    ? `Deleted "${deletedTransaction.title}" and balance restored.`
                    : "Deleted from database."
            );
            setTimeout(() => setSyncStatus(""), 3000);
            return true;
        } catch (error) {
            console.error("DELETE TRANSACTION ERROR:", error);

            // Revert optimistic removal
            if (deletedTransaction) {
                setTransactions((current) => [
                    deletedTransaction,
                    ...current.filter((item) => item.id !== id),
                ]);
                applyTransactionBalanceChange?.(null, deletedTransaction);
            }
            setSyncStatus("Failed to delete transaction. Please try again.");
            return false;
        } finally {
            finishMutation();
        }
    };

    return {
        transactions,
        isLoading,
        syncStatus,
        pendingSyncCount,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        retryPendingSync,
        reloadTransactions: loadTransactions,
    };
};
