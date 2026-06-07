import { useState, useEffect, useCallback } from "react";
import {
    getAccountsFromGoogleSheet,
    addAccountToGoogleSheet,
    deleteAccountFromGoogleSheet,
    updateStartingBalanceInGoogleSheet,
} from "../services/googleSheets";

const DEFAULT_ACCOUNTS = [
    { id: "acc-1", name: "BCA", type: "Bank", startingBalance: 20000000 },
    { id: "acc-2", name: "9080", type: "Savings", startingBalance: 70000000 },
    { id: "acc-3", name: "Mandiri", type: "Bank", startingBalance: 15000000 },
    { id: "acc-4", name: "Blu", type: "Bank", startingBalance: 5000000 },
    { id: "acc-5", name: "Superbank", type: "Bank", startingBalance: 2000000 },
];

export const useAccounts = () => {
    const [accounts, setAccounts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const loadAccounts = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await getAccountsFromGoogleSheet();

            // Check if returned data is an array
            if (Array.isArray(data)) {
                if (data.length === 0) {
                    // Auto-initialize default accounts in sheet
                    setAccounts(DEFAULT_ACCOUNTS);

                    // Sync to Sheet sequentially to avoid Google Apps Script lock/concurrency errors
                    const initAccountsSequentially = async () => {
                        for (const acc of DEFAULT_ACCOUNTS) {
                            try {
                                await addAccountToGoogleSheet(acc);
                            } catch (err) {
                                console.error("Error auto-initializing account:", acc.name, err);
                            }
                        }
                    };
                    initAccountsSequentially();
                } else {
                    setAccounts(data);
                }
                setError(null);
            } else {
                console.error("Fetched accounts is not an array:", data);
                setError("Invalid accounts data format received.");
            }
        } catch (err) {
            console.error("FAILED TO LOAD ACCOUNTS:", err);
            setError("Failed to load accounts from Google Sheets.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadAccounts();
    }, [loadAccounts]);

    const addAccount = async (account) => {
        const newAccount = {
            id: `acc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            name: account.name.trim(),
            type: account.type || "Bank",
            startingBalance: Number(account.startingBalance) || 0,
        };

        // Optimistic update
        setAccounts((prev) => [...prev, newAccount]);

        try {
            await addAccountToGoogleSheet(newAccount);
        } catch (err) {
            console.error("Error syncing new account to Google Sheets:", err);
            // Revert on error
            setAccounts((prev) => prev.filter((acc) => acc.id !== newAccount.id));
            setError("Failed to sync new account to Google Sheets.");
        }
    };

    const deleteAccount = async (id) => {
        const deletedAccount = accounts.find((acc) => acc.id === id);
        if (!deletedAccount) return;

        // Optimistic update
        setAccounts((prev) => prev.filter((acc) => acc.id !== id));

        try {
            await deleteAccountFromGoogleSheet(id);
        } catch (err) {
            console.error("Error deleting account from Google Sheets:", err);
            // Revert
            setAccounts((prev) => [...prev, deletedAccount]);
            setError("Failed to delete account from Google Sheets.");
        }
    };

    const updateStartingBalance = async (id, newBalance) => {
        const originalAccount = accounts.find((acc) => acc.id === id);
        if (!originalAccount) return;

        // Optimistic update
        setAccounts((prev) =>
            prev.map((acc) =>
                acc.id === id
                    ? { ...acc, startingBalance: Number(newBalance) || 0 }
                    : acc
            )
        );

        try {
            await updateStartingBalanceInGoogleSheet(id, newBalance);
        } catch (err) {
            console.error("Error updating starting balance in Google Sheets:", err);
            // Revert
            setAccounts((prev) =>
                prev.map((acc) => (acc.id === id ? originalAccount : acc))
            );
            setError("Failed to update starting balance in Google Sheets.");
        }
    };

    return {
        accounts,
        isLoading,
        error,
        addAccount,
        deleteAccount,
        updateStartingBalance,
        reloadAccounts: loadAccounts,
    };
};
