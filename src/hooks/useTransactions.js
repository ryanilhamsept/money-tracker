import { useEffect, useState } from "react";
import { today, normalizeDate } from "../utils/date";
import { parseAmountInput } from "../utils/parser";
import {
    syncTransactionToGoogleSheet,
    deleteTransactionFromGoogleSheet,
} from "../services/googleSheets";

const STORAGE_KEY = "pwa-money-tracker-transactions-v6";

const sampleTransactions = [
    {
        id: crypto.randomUUID(),
        title: "Lunch",
        amount: 45000,
        category: "Food",
        source: "BCA",
        danaDipakai: "Spend Bulanan",
        date: today(),
    },
];

export const useTransactions = () => {
    const [transactions, setTransactions] = useState(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            return stored ? JSON.parse(stored) : sampleTransactions;
        } catch {
            return sampleTransactions;
        }
    });

    const [syncStatus, setSyncStatus] = useState("");

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    }, [transactions]);

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
                Number(item.amount) === Number(newTransaction.amount) &&
                item.category === newTransaction.category &&
                item.source === newTransaction.source &&
                item.danaDipakai === newTransaction.danaDipakai &&
                item.date === newTransaction.date
            );
        });

        if (isDuplicate) {
            setSyncStatus("Duplicate transaction detected. Data not saved.");
            return;
        }

        setTransactions((current) => [newTransaction, ...current]);

        try {
            setSyncStatus("Syncing to Google Sheets...");
            await syncTransactionToGoogleSheet(newTransaction);
            setSyncStatus("Request sent to Google Sheets. Check your Sheet tab 'Bulan'.");
        } catch {
            setSyncStatus("Failed to sync to Google Sheets.");
        }
    };

    const updateTransactionDate = (id, newDate) => {
        setTransactions((current) =>
            current.map((item) =>
                item.id === id ? { ...item, date: normalizeDate(newDate) } : item
            )
        );
    };

    const deleteTransaction = async (id) => {
        const deletedTransaction = transactions.find((item) => item.id === id);

        setTransactions((current) => current.filter((item) => item.id !== id));

        try {
            setSyncStatus("Deleting from Google Sheets...");
            await deleteTransactionFromGoogleSheet(id);
            setSyncStatus(
                deletedTransaction
                    ? `Deleted "${deletedTransaction.title}" from Google Sheets.`
                    : "Deleted from Google Sheets."
            );
        } catch {
            setSyncStatus("Failed to delete from Google Sheets.");
        }
    };

    return {
        transactions,
        syncStatus,
        addTransaction,
        updateTransactionDate,
        deleteTransaction,
    };
};