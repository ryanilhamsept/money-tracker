import { useEffect, useRef, useState } from "react";
import { normalizeDate } from "../utils/date";
import { parseAmountInput } from "../utils/parser";
import {
    deduplicateTransactionsById,
    findDuplicateTransaction,
    normalizeTransaction,
} from "../utils/transactions";
import {
    createTransaction as syncTransactionToSupabase,
    deleteTransaction as deleteTransactionFromSupabase,
    setTransactionPaid as setTransactionPaidOnServer,
    getTransactions as getTransactionsFromSupabase,
    updateTransaction as updateTransactionToSupabase,
} from "../services/api";

const assertSuccessfulSync = (result) => {
    if (result?.success === false) {
        throw new Error(result.error || "Database rejected the request.");
    }
};

const getStorageKey = (userId) => `money-tracker.pending-adds.v1.${userId || "anon"}`;
const AUTO_RETRY_INTERVAL_MS = 8000;

const readPendingAdds = (userId) => {
    if (typeof window === "undefined") return [];

    try {
        const raw = window.localStorage.getItem(getStorageKey(userId));
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error("FAILED TO READ PENDING TRANSACTIONS:", error);
        return [];
    }
};

const writePendingAdds = (userId, transactions) => {
    if (typeof window === "undefined") return;

    try {
        window.localStorage.setItem(
            getStorageKey(userId),
            JSON.stringify(transactions)
        );
    } catch (error) {
        console.error("FAILED TO STORE PENDING TRANSACTIONS:", error);
    }
};

export const useTransactions = ({
    userId,
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
    const pendingAddsRef = useRef([]);
    const pendingSyncRunningRef = useRef(false);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);

    const replacePendingAdds = (nextPendingAdds) => {
        pendingAddsRef.current = nextPendingAdds;
        setPendingSyncCount(nextPendingAdds.length);
        writePendingAdds(userId, nextPendingAdds);
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
            (transaction) => !syncedIds.has(String(transaction.id || "").trim())
        );

        if (remainingPendingAdds.length !== pendingAddsRef.current.length) {
            replacePendingAdds(remainingPendingAdds);
        }

        // Fresh rows from Supabase come first so they win over any stale
        // locally-cached pending entry sharing the same id.
        const { rows: deduped } = deduplicateTransactionsById([
            ...rows,
            ...remainingPendingAdds.map((transaction) => ({
                ...transaction,
                syncState: "pending",
            })),
        ]);

        return deduped;
    };

    // `silent` refetches without flipping isLoading, which App.jsx uses to
    // swap the whole screen for a loader -- fine on first load, jarring for a
    // background correction mid-session.
    const loadTransactions = async ({ silent = false } = {}) => {
        try {
            if (!silent) setIsLoading(true);

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
            if (!silent) setIsLoading(false);
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
        let rejectedAsDuplicate = 0;

        try {
            for (const transaction of pendingAdds) {
                // `pendingAdds` is a snapshot from before the loop. If the user
                // deleted this one while an earlier item was still in flight,
                // it is gone from the live queue -- do not resurrect it.
                if (!pendingAddsRef.current.some((t) => t.id === transaction.id)) {
                    continue;
                }

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
                    // The server already holds an equivalent row (added from
                    // another device between our load and this sync). Retrying
                    // can never succeed, so drop the local copy, undo its
                    // optimistic balance effect and reload so the server's
                    // row shows up instead of ours.
                    if (error.status === 409) {
                        rejectedAsDuplicate += 1;
                        removePendingAdd(transaction.id);
                        setTransactions((current) =>
                            current.filter((item) => item.id !== transaction.id)
                        );
                        applyTransactionBalanceChange?.(transaction, null);
                        continue;
                    }

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

            if (rejectedAsDuplicate > 0) {
                void loadTransactions({ silent: true });
                setSyncStatus(
                    `${rejectedAsDuplicate} transaksi tidak disimpan karena sudah ada di database.`
                );
                setTimeout(() => setSyncStatus(""), 5000);
                if (failedCount === 0) return true;
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
        if (userId) {
            pendingAddsRef.current = readPendingAdds(userId);
            setPendingSyncCount(pendingAddsRef.current.length);
            loadTransactions();
        } else {
            pendingAddsRef.current = [];
            setPendingSyncCount(0);
            setTransactions([]);
            setIsLoading(false);
            setSyncStatus("");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

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

    // Returns { ok: true } once queued, { ok: false, reason: "invalid" } for
    // empty input, or { ok: false, reason: "duplicate", duplicateOf } when an
    // equivalent transaction already exists -- nothing is added in that case,
    // so the caller can ask the user and retry with allowDuplicate: true.
    const addTransaction = (form, { allowDuplicate = false } = {}) => {
        const amount = parseAmountInput(form.amount);

        if (!form.title.trim() || !amount) return { ok: false, reason: "invalid" };

        const maxRowNumber = transactions.length > 0
            ? Math.max(...transactions.map((t) => t.rowNumber || 0))
            : 0;

        const newTransaction = {
            id: crypto.randomUUID(),
            ...form,
            title: form.title.trim(),
            amount,
            date: normalizeDate(form.date),
            type: form.type || "expense",
            createdAt: new Date().toISOString(),
            rowNumber: maxRowNumber + 1,
            syncState: "pending",
        };

        // Check locally first so a duplicate never enters the optimistic list
        // or the offline queue; the backend repeats the same check on insert.
        if (!allowDuplicate) {
            const duplicateOf = findDuplicateTransaction(transactions, newTransaction);
            if (duplicateOf) return { ok: false, reason: "duplicate", duplicateOf };
        }

        setTransactions((current) => [newTransaction, ...current]);
        applyTransactionBalanceChange?.(null, newTransaction);
        // The flag rides along on the queued copy only, so the backend honours
        // the user's decision even when the request is replayed later.
        queuePendingAdd(allowDuplicate ? { ...newTransaction, allowDuplicate: true } : newTransaction);
        setSyncStatus("Saved locally. Auto-sync is running.");

        void retryPendingSync({ showStatus: false });

        return { ok: true };
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
            time: updatedForm.time !== undefined ? updatedForm.time : existing?.time || "",
            type: updatedForm.type || existing?.type || "expense",
            rowNumber: existing ? existing.rowNumber : 0,
            installmentTotalLoan:
                updatedForm.installmentTotalLoan !== undefined
                    ? updatedForm.installmentTotalLoan
                    : existing?.installmentTotalLoan ?? null,
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

    // Menandai lunas, bukan menghapus: belanjanya benar-benar terjadi dan harus
    // tetap ada di riwayat. Efek ke saldo kartu sama seperti dulu waktu baris
    // ini dihapus, karena getTransactionAccountEffects mengabaikan yang lunas.
    const markTransactionPaid = async (id, paid = true) => {
        const existing = transactions.find((item) => item.id === id);
        if (!existing) return false;

        const updated = { ...existing, paidAt: paid ? new Date().toISOString() : null };

        setTransactions((current) =>
            current.map((item) => (item.id === id ? updated : item))
        );
        applyTransactionBalanceChange?.(existing, updated);

        setSyncStatus(paid ? "Menandai lunas..." : "Membatalkan status lunas...");
        startMutation();

        try {
            const result = await setTransactionPaidOnServer(id, paid);
            assertSuccessfulSync(result);
            await syncAccountBalancesForTransaction?.(existing, updated);

            setSyncStatus(paid ? "Ditandai lunas." : "Status lunas dibatalkan.");
            setTimeout(() => setSyncStatus(""), 3000);
            return true;
        } catch (error) {
            console.error("MARK PAID ERROR:", error);

            setTransactions((current) =>
                current.map((item) => (item.id === id ? existing : item))
            );
            applyTransactionBalanceChange?.(updated, existing);
            setSyncStatus("Gagal menandai lunas. Coba lagi.");
            return false;
        } finally {
            finishMutation();
        }
    };

    const deleteTransaction = async (id) => {
        const deletedTransaction = transactions.find(
            (item) => item.id === id
        );

        // Drop it from the offline queue FIRST. A row still waiting there was
        // never sent to the server, so the DELETE below finds nothing -- and
        // without this the next auto-retry would POST it again, resurrecting
        // a transaction the user just deleted.
        removePendingAdd(id);

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
            // 404: the server holds no such row for this user -- it never got
            // there (was still queued) or is already gone. The local removal
            // stands; there is nothing to revert and no server balance to fix.
            if (error.status === 404) {
                setSyncStatus(
                    deletedTransaction
                        ? `Deleted "${deletedTransaction.title}" (it had not reached the database).`
                        : "Deleted."
                );
                setTimeout(() => setSyncStatus(""), 3000);
                return true;
            }

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
        markTransactionPaid,
        retryPendingSync,
        reloadTransactions: loadTransactions,
    };
};
