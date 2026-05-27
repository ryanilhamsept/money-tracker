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

        const newTransaction = {
            id: crypto.randomUUID(),
            ...form,
            title: form.title.trim(),
            amount,
            date: normalizeDate(form.date),
        };

        setTransactions((current) => [newTransaction, ...current]);

        try {
            setSyncStatus("Syncing to Google Sheets...");

            await syncTransactionToGoogleSheet(newTransaction);

            await loadTransactions();

            setSyncStatus("Saved to Google Sheets.");
        } catch (error) {
            console.error("ADD TRANSACTION ERROR:", error);
            setSyncStatus("Failed to sync to Google Sheets.");
        }
    };

    const updateTransaction = async (id, updatedForm) => {
        const amount = parseAmountInput(String(updatedForm.amount));

        if (!updatedForm.title.trim() || !amount) return;

        const updatedTransaction = {
            id,
            title: updatedForm.title.trim(),
            amount,
            category: updatedForm.category,
            source: updatedForm.source,
            danaDipakai: updatedForm.danaDipakai,
            date: normalizeDate(updatedForm.date),
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

        try {
            setSyncStatus("Updating transaction...");

            await updateTransactionToGoogleSheet(updatedTransaction);

            await loadTransactions();

            setSyncStatus("Transaction updated.");
        } catch (error) {
            console.error("UPDATE TRANSACTION ERROR:", error);
            setSyncStatus("Failed to update transaction.");
        }
    };

    const deleteTransaction = async (id) => {
        const deletedTransaction = transactions.find(
            (item) => item.id === id
        );

        setTransactions((current) =>
            current.filter((item) => item.id !== id)
        );

        try {
            setSyncStatus("Deleting from Google Sheets...");

            await deleteTransactionFromGoogleSheet(id);

            await loadTransactions();

            setSyncStatus(
                deletedTransaction
                    ? `Deleted "${deletedTransaction.title}" from Google Sheets.`
                    : "Deleted from Google Sheets."
            );
        } catch (error) {
            console.error("DELETE TRANSACTION ERROR:", error);
            setSyncStatus("Failed to delete from Google Sheets.");
        }
    };

    return {
        transactions,
        isLoading,
        syncStatus,
        addTransaction,
        updateTransaction,
        deleteTransaction,
    };
};