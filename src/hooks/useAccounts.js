import { useState, useEffect, useCallback, useRef } from "react";
import {
    getAccountsFromSupabase,
    addAccountToSupabase,
    deleteAccountFromSupabase,
    updateStartingBalanceInSupabase,
} from "../services/supabase";
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

    const replaceAccounts = useCallback((nextAccounts) => {
        accountsRef.current = nextAccounts;
        setAccounts(nextAccounts);
    }, []);

    const loadAccounts = useCallback(async ({ showLoading = true } = {}) => {
        try {
            if (showLoading) {
                setIsLoading(true);
            }

            const data = await getAccountsFromSupabase();

            // Check if returned data is an array
            if (Array.isArray(data)) {
                replaceAccounts(data);
                setError(null);
                return true;
            } else {
                console.error("Fetched accounts is not an array:", data);
                setError("Invalid accounts data format received.");
                return false;
            }
        } catch (err) {
            console.error("FAILED TO LOAD ACCOUNTS:", err);
            setError("Failed to load accounts from database.");
            return false;
        } finally {
            if (showLoading) {
                setIsLoading(false);
            }
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
            await addAccountToSupabase(newAccount);
            setError(null);
            return true;
        } catch (err) {
            console.error("Error syncing new account to database:", err);
            // Revert on error
            replaceAccounts(
                accountsRef.current.filter((acc) => acc.id !== newAccount.id)
            );
            setError("Failed to sync new account to database.");
            return false;
        }
    };

    const deleteAccount = async (id) => {
        const deletedAccount = accounts.find((acc) => acc.id === id);
        if (!deletedAccount) return;

        // Optimistic update
        replaceAccounts(accountsRef.current.filter((acc) => acc.id !== id));

        try {
            await deleteAccountFromSupabase(id);
            setError(null);
            return true;
        } catch (err) {
            console.error("Error deleting account from database:", err);
            // Revert
            replaceAccounts([...accountsRef.current, deletedAccount]);
            setError("Failed to delete account from database.");
            return false;
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
            const result = await updateStartingBalanceInSupabase(id, newBalance);
            if (result?.success === false) {
                throw new Error(result.error || "Database rejected balance update.");
            }
            return true;
        } catch (err) {
            console.error("Error updating starting balance in database:", err);
            // Revert
            replaceAccounts(
                accountsRef.current.map((acc) =>
                    acc.id === id ? originalAccount : acc
                )
            );
            setError("Failed to update starting balance in database.");
            return false;
        }
    };

    const applyTransactionBalanceChange = useCallback(
        (previousTransaction, nextTransaction) => {
            const deltas = getAccountBalanceDeltas(
                accountsRef.current,
                previousTransaction,
                nextTransaction
            );

            if (deltas.length === 0) return;

            replaceAccounts(
                accountsRef.current.map((account) => {
                    const delta = deltas.find(
                        (item) => item.account.id === account.id
                    );

                    if (!delta) return account;

                    return {
                        ...account,
                        startingBalance:
                            (Number(account.startingBalance) || 0) + delta.amount,
                    };
                })
            );
        },
        [replaceAccounts]
    );

    const syncAccountBalancesForTransaction = useCallback(
        async (previousTransaction, nextTransaction) => {
            const deltas = getAccountBalanceDeltas(
                accountsRef.current,
                previousTransaction,
                nextTransaction
            );

            if (deltas.length === 0) return true;

            try {
                await Promise.all(
                    deltas.map((delta) => {
                        const currentAccount = accountsRef.current.find(
                            (account) => account.id === delta.account.id
                        );

                        if (!currentAccount) return Promise.resolve();

                        return updateStartingBalanceInSupabase(
                            currentAccount.id,
                            currentAccount.startingBalance
                        );
                    })
                );

                setError(null);
                return true;
            } catch (err) {
                console.error("Error syncing account balance after transaction:", err);
                setError("Transaction saved, but account balance sync is retrying.");
                throw err;
            }
        },
        []
    );

    return {
        accounts,
        isLoading,
        error,
        addAccount,
        deleteAccount,
        updateStartingBalance,
        applyTransactionBalanceChange,
        syncAccountBalancesForTransaction,
        reloadAccounts: () => loadAccounts({ showLoading: false }),
    };
};
