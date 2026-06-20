import { useEffect, useState } from "react";
import { normalizeDate } from "../utils/date";
import { parseAmountInput } from "../utils/parser";
import {
    deduplicateTransactionsById,
    normalizeTransaction,
} from "../utils/transactions";
import {
    syncTransactionToGoogleSheet,
    deleteTransactionFromGoogleSheet,
    getTransactionsFromGoogleSheet,
    updateTransactionToGoogleSheet,
} from "../services/googleSheets";

const assertSuccessfulSync = (result) => {
    if (result?.success === false) {
        throw new Error(result.error || "Google Sheets rejected the request.");
    }
};

export const useTransactions = ({ reloadAccounts } = {}) => {
    const [transactions, setTransactions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const [syncStatus, setSyncStatus] = useState(
        "Loading data from Google Sheets..."
    );

    const loadTransactions = async () => {
        try {
            setIsLoading(true);

            const data = await getTransactionsFromGoogleSheet();

            const rows = Array.isArray(data) ? data : data.rows;

            if (!Array.isArray(rows)) {
                console.error("Google Sheets response is not array:", data);
                setSyncStatus(
                    data?.error || "Google Sheets response is not valid."
                );
                return;
            }

            const deduplicated = deduplicateTransactionsById(rows);

            if (deduplicated.duplicateCount > 0) {
                console.warn(
                    `Ignored ${deduplicated.duplicateCount} duplicate transaction rows from Google Sheets.`
                );
            }

            const normalizedData = deduplicated.rows
                .map(normalizeTransaction)
                .filter((item) => item.title)
                .map((item) => ({
                    ...item,
                    id: item.id || `legacy-row-${item.rowNumber}`,
                    date: normalizeDate(item.date),
                }))
                .sort((a, b) => b.rowNumber - a.rowNumber);

            setTransactions(normalizedData);
            setSyncStatus("");
            return true;
        } catch (error) {
            console.error("LOAD TRANSACTIONS ERROR:", error);
            setSyncStatus("Failed to load data from Google Sheets.");
            return false;
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadTransactions();
    }, []);

    const addTransaction = async (form) => {
        const amount = parseAmountInput(form.amount);

        if (!form.title.trim() || !amount) return;

        const maxRowNumber = transactions.length > 0
            ? Math.max(...transactions.map((t) => t.rowNumber || 0))
            : 0;

        const newTransaction = {
            id: crypto.randomUUID(),
            ...form,
            title: form.title.trim(),
            amount,
            date: normalizeDate(form.date),
            rowNumber: maxRowNumber + 1,
        };

        setTransactions((current) => [newTransaction, ...current]);

        setSyncStatus("Syncing to Google Sheets...");

        try {
            const result = await syncTransactionToGoogleSheet(newTransaction);
            assertSuccessfulSync(result);

            await reloadAccounts?.();

            setSyncStatus(
                result.duplicate
                    ? "Transaction already existed; duplicate ignored."
                    : "Transaction and account balance saved."
            );
            setTimeout(() => setSyncStatus(""), 3000);
            return true;
        } catch (error) {
            console.error("ADD TRANSACTION ERROR:", error);

            // Transaction failed to save — remove optimistic entry
            setTransactions((current) =>
                current.filter((item) => item.id !== newTransaction.id)
            );
            setSyncStatus("Failed to save transaction. Please try again.");
            return false;
        }
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

        setSyncStatus("Updating transaction...");

        try {
            const result = await updateTransactionToGoogleSheet(updatedTransaction);
            assertSuccessfulSync(result);

            await reloadAccounts?.();

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
            }
            setSyncStatus("Failed to update transaction. Please try again.");
            return false;
        }
    };

    const deleteTransaction = async (id) => {
        const deletedTransaction = transactions.find(
            (item) => item.id === id
        );

        setTransactions((current) =>
            current.filter((item) => item.id !== id)
        );

        setSyncStatus("Deleting from Google Sheets...");

        try {
            const result = await deleteTransactionFromGoogleSheet(id);
            assertSuccessfulSync(result);

            await reloadAccounts?.();

            setSyncStatus(
                deletedTransaction
                    ? `Deleted "${deletedTransaction.title}" and balance restored.`
                    : "Deleted from Google Sheets."
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
            }
            setSyncStatus("Failed to delete transaction. Please try again.");
            return false;
        }
    };

    return {
        transactions,
        isLoading,
        syncStatus,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        reloadTransactions: loadTransactions,
    };
};
