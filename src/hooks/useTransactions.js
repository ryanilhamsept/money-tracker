import { useEffect, useState } from "react";
import { normalizeDate } from "../utils/date";
import { parseAmountInput } from "../utils/parser";
import {
    syncTransactionToGoogleSheet,
    deleteTransactionFromGoogleSheet,
    getTransactionsFromGoogleSheet,
    updateTransactionToGoogleSheet,
} from "../services/googleSheets";

export const useTransactions = () => {
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

            const normalizedData = rows
                .filter((item) => item.title)
                .map((item) => ({
                    rowNumber: Number(item.rowNumber) || 0,
                    id: item.id || crypto.randomUUID(),
                    title: item.title,
                    amount: Number(item.amount) || 0,
                    category: item.category || "Food",
                    source: item.source || "Mandiri",
                    danaDipakai: item.danaDipakai || "Spend Bulanan",
                    date: normalizeDate(item.date),
                }))
                .sort((a, b) => b.rowNumber - a.rowNumber);

            setTransactions(normalizedData);
            setSyncStatus("");
        } catch (error) {
            console.error("LOAD TRANSACTIONS ERROR:", error);
            setSyncStatus("Failed to load data from Google Sheets.");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
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
        syncTransactionToGoogleSheet(newTransaction)
            .then(() => {
                setSyncStatus("Saved to Google Sheets.");
                setTimeout(() => setSyncStatus(""), 3000);
            })
            .catch((error) => {
                console.error("ADD TRANSACTION ERROR:", error);
                setSyncStatus("Failed to sync to Google Sheets.");
            });
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
        updateTransactionToGoogleSheet(updatedTransaction)
            .then(() => {
                setSyncStatus("Transaction updated.");
                setTimeout(() => setSyncStatus(""), 3000);
            })
            .catch((error) => {
                console.error("UPDATE TRANSACTION ERROR:", error);
                setSyncStatus("Failed to update transaction.");
            });
    };

    const deleteTransaction = async (id) => {
        const deletedTransaction = transactions.find(
            (item) => item.id === id
        );

        setTransactions((current) =>
            current.filter((item) => item.id !== id)
        );

        setSyncStatus("Deleting from Google Sheets...");
        deleteTransactionFromGoogleSheet(id)
            .then(() => {
                setSyncStatus(
                    deletedTransaction
                        ? `Deleted "${deletedTransaction.title}" from Google Sheets.`
                        : "Deleted from Google Sheets."
                );
                setTimeout(() => setSyncStatus(""), 3000);
            })
            .catch((error) => {
                console.error("DELETE TRANSACTION ERROR:", error);
                setSyncStatus("Failed to delete from Google Sheets.");
            });
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