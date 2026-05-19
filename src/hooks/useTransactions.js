import { useEffect, useState } from "react";
import { normalizeDate } from "../utils/date";
import { parseAmountInput } from "../utils/parser";
import {
    syncTransactionToGoogleSheet,
    deleteTransactionFromGoogleSheet,
    getTransactionsFromGoogleSheet,
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

            if (Array.isArray(data)) {
                const normalizedData = data
                    .filter((item) => item.title)
                    .map((item) => ({
                        rowNumber: Number(item.rowNumber) || 0,
                        id: item.id || crypto.randomUUID(),
                        title: item.title,
                        amount: Number(item.amount) || 0,
                        category: item.category || "Food",
                        source: item.source || "Mandiri",
                        danaDipakai:
                            item.danaDipakai || "Spend Bulanan",
                        date: normalizeDate(item.date),
                    }))
                    .sort((a, b) => b.rowNumber - a.rowNumber);

                setTransactions(normalizedData);
                setSyncStatus("");
            }
        } catch {
            setSyncStatus(
                "Failed to load data from Google Sheets."
            );
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

        const isDuplicate = transactions.some((item) => {
            return (
                item.title.trim().toLowerCase() ===
                newTransaction.title.trim().toLowerCase() &&
                Number(item.amount) ===
                Number(newTransaction.amount) &&
                item.category === newTransaction.category &&
                item.source === newTransaction.source &&
                item.danaDipakai ===
                newTransaction.danaDipakai &&
                item.date === newTransaction.date
            );
        });

        if (isDuplicate) {
            setSyncStatus(
                "Duplicate transaction detected. Data not saved."
            );

            return;
        }

        setTransactions((current) => [
            newTransaction,
            ...current,
        ]);

        try {
            setSyncStatus("Syncing to Google Sheets...");

            await syncTransactionToGoogleSheet(
                newTransaction
            );

            await loadTransactions();

            setSyncStatus("Saved to Google Sheets.");
        } catch {
            setSyncStatus(
                "Failed to sync to Google Sheets."
            );
        }
    };

    const updateTransactionDate = (id, newDate) => {
        setTransactions((current) =>
            current.map((item) =>
                item.id === id
                    ? {
                        ...item,
                        date: normalizeDate(newDate),
                    }
                    : item
            )
        );
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
        } catch {
            setSyncStatus(
                "Failed to delete from Google Sheets."
            );
        }
    };

    return {
        transactions,
        isLoading,
        syncStatus,
        addTransaction,
        updateTransactionDate,
        deleteTransaction,
    };
};