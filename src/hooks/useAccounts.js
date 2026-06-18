import { useState, useEffect, useCallback, useRef } from "react";
import {
    getAccountsFromGoogleSheet,
    addAccountToGoogleSheet,
    deleteAccountFromGoogleSheet,
    updateStartingBalanceInGoogleSheet,
} from "../services/googleSheets";
import { getAccountBalanceDeltas } from "../utils/accountBalance";

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
    const accountsRef = useRef([]);
    const balanceUpdateQueueRef = useRef(Promise.resolve());

    const replaceAccounts = useCallback((nextAccounts) => {
        accountsRef.current = nextAccounts;
        setAccounts(nextAccounts);
    }, []);

    const loadAccounts = useCallback(async () => {
        try {
            setIsLoading(true);
            const data = await getAccountsFromGoogleSheet();

            // Check if returned data is an array
            if (Array.isArray(data)) {
                if (data.length === 0) {
                    // Auto-initialize default accounts in sheet
                    replaceAccounts(DEFAULT_ACCOUNTS);

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
                    replaceAccounts(data);
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
    }, [replaceAccounts]);

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
        replaceAccounts([...accountsRef.current, newAccount]);

        try {
            await addAccountToGoogleSheet(newAccount);
        } catch (err) {
            console.error("Error syncing new account to Google Sheets:", err);
            // Revert on error
            replaceAccounts(
                accountsRef.current.filter((acc) => acc.id !== newAccount.id)
            );
            setError("Failed to sync new account to Google Sheets.");
        }
    };

    const deleteAccount = async (id) => {
        const deletedAccount = accounts.find((acc) => acc.id === id);
        if (!deletedAccount) return;

        // Optimistic update
        replaceAccounts(accountsRef.current.filter((acc) => acc.id !== id));

        try {
            await deleteAccountFromGoogleSheet(id);
        } catch (err) {
            console.error("Error deleting account from Google Sheets:", err);
            // Revert
            replaceAccounts([...accountsRef.current, deletedAccount]);
            setError("Failed to delete account from Google Sheets.");
        }
    };

    const updateStartingBalance = async (id, newBalance) => {
        const originalAccount = accounts.find((acc) => acc.id === id);
        if (!originalAccount) return;

        // Optimistic update
        replaceAccounts(
            accountsRef.current.map((acc) =>
                acc.id === id
                    ? { ...acc, startingBalance: Number(newBalance) || 0 }
                    : acc
            )
        );

        try {
            const result = await updateStartingBalanceInGoogleSheet(id, newBalance);
            if (result?.success === false) {
                throw new Error(result.error || "Google Sheets rejected balance update.");
            }
            return true;
        } catch (err) {
            console.error("Error updating starting balance in Google Sheets:", err);
            // Revert
            replaceAccounts(
                accountsRef.current.map((acc) =>
                    acc.id === id ? originalAccount : acc
                )
            );
            setError("Failed to update starting balance in Google Sheets.");
            return false;
        }
    };

    const syncTransactionBalanceChange = useCallback(
        (previousTransaction, nextTransaction) => {
            const runUpdate = async () => {
                const deltas = getAccountBalanceDeltas(
                    accountsRef.current,
                    previousTransaction,
                    nextTransaction
                );

                const appliedUpdates = [];

                try {
                    for (const delta of deltas) {
                        const currentAccount = accountsRef.current.find(
                            (account) => account.id === delta.account.id
                        );

                        if (!currentAccount) continue;

                        const previousBalance =
                            Number(currentAccount.startingBalance) || 0;
                        const nextBalance = previousBalance + delta.amount;
                        const result = await updateStartingBalanceInGoogleSheet(
                            currentAccount.id,
                            nextBalance
                        );

                        if (result?.success === false) {
                            throw new Error(
                                result.error ||
                                    `Failed to update ${currentAccount.name}.`
                            );
                        }

                        appliedUpdates.push({
                            account: currentAccount,
                            previousBalance,
                        });

                        replaceAccounts(
                            accountsRef.current.map((account) =>
                                account.id === currentAccount.id
                                    ? {
                                          ...account,
                                          startingBalance: nextBalance,
                                      }
                                    : account
                            )
                        );
                    }

                    setError(null);
                    return true;
                } catch (err) {
                    console.error("Error syncing account balance:", err);

                    for (const applied of appliedUpdates.reverse()) {
                        try {
                            await updateStartingBalanceInGoogleSheet(
                                applied.account.id,
                                applied.previousBalance
                            );
                        } catch (rollbackError) {
                            console.error(
                                "Failed to roll back account balance:",
                                rollbackError
                            );
                        }
                    }

                    await loadAccounts();
                    setError("Failed to sync account balance with transaction.");
                    throw err;
                }
            };

            const queuedUpdate = balanceUpdateQueueRef.current.then(runUpdate);
            balanceUpdateQueueRef.current = queuedUpdate.catch(() => {});
            return queuedUpdate;
        },
        [loadAccounts, replaceAccounts]
    );

    return {
        accounts,
        isLoading,
        error,
        addAccount,
        deleteAccount,
        updateStartingBalance,
        syncTransactionBalanceChange,
        reloadAccounts: loadAccounts,
    };
};
