/**
 * API client for the Go backend.
 * Replaces direct Supabase calls for all data operations.
 * Supabase client is still used for auth (login/signup/session) only.
 */

import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

/**
 * Get the current Supabase session token for API auth.
 */
const getToken = async () => {
    const {
        data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token || "";
};

/**
 * Make an authenticated API request to the Go backend.
 */
const apiFetch = async (path, options = {}) => {
    const token = await getToken();

    const res = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...options.headers,
        },
    });

    if (!res.ok) {
        let errorMsg;
        try {
            const errBody = await res.json();
            errorMsg = errBody.error || `Request failed (${res.status})`;
        } catch {
            errorMsg = `Request failed (${res.status})`;
        }
        throw new Error(errorMsg);
    }

    return res.json();
};

// --- Transactions API ---

export const getTransactions = async () => {
    return apiFetch("/api/transactions");
};

export const createTransaction = async (transaction) => {
    return apiFetch("/api/transactions", {
        method: "POST",
        body: JSON.stringify(transaction),
    });
};

export const updateTransaction = async (transaction) => {
    return apiFetch(`/api/transactions/${transaction.id}`, {
        method: "PUT",
        body: JSON.stringify(transaction),
    });
};

export const deleteTransaction = async (id) => {
    return apiFetch(`/api/transactions/${id}`, {
        method: "DELETE",
    });
};

// --- Accounts API ---

export const getAccounts = async () => {
    return apiFetch("/api/accounts");
};

export const createAccount = async (account) => {
    return apiFetch("/api/accounts", {
        method: "POST",
        body: JSON.stringify(account),
    });
};

export const updateAccountFields = async (id, fields) => {
    return apiFetch(`/api/accounts/${id}`, {
        method: "PUT",
        body: JSON.stringify(fields),
    });
};

export const deleteAccount = async (id) => {
    return apiFetch(`/api/accounts/${id}`, {
        method: "DELETE",
    });
};

// Convenience: update just the starting balance
export const updateStartingBalance = async (id, balance) => {
    return updateAccountFields(id, { startingBalance: Number(balance) });
};

// --- Budget API ---

export const getBudget = async () => {
    return apiFetch("/api/budgets");
};

export const saveBudget = async (amount) => {
    return apiFetch("/api/budgets", {
        method: "PUT",
        body: JSON.stringify({ amount: Number(amount) }),
    });
};

// --- Goals API ---

export const getGoals = async () => {
    return apiFetch("/api/goals");
};

export const createGoal = async (goal) => {
    return apiFetch("/api/goals", {
        method: "POST",
        body: JSON.stringify(goal),
    });
};

export const updateGoal = async (goal) => {
    return apiFetch(`/api/goals/${goal.id}`, {
        method: "PUT",
        body: JSON.stringify(goal),
    });
};

export const deleteGoal = async (id) => {
    return apiFetch(`/api/goals/${id}`, {
        method: "DELETE",
    });
};

// --- Installments API ---

export const getInstallments = async () => {
    return apiFetch("/api/installments");
};

export const createInstallment = async (installment) => {
    return apiFetch("/api/installments", {
        method: "POST",
        body: JSON.stringify(installment),
    });
};

export const updateInstallment = async (id, fields) => {
    return apiFetch(`/api/installments/${id}`, {
        method: "PUT",
        body: JSON.stringify(fields),
    });
};

export const deleteInstallment = async (id) => {
    return apiFetch(`/api/installments/${id}`, {
        method: "DELETE",
    });
};

// --- AI Review API ---

export const reviewSpending = async (summary) => {
    const data = await apiFetch("/api/ai/review", {
        method: "POST",
        body: JSON.stringify(summary),
    });
    return data.review;
};

export const replyToReview = async (summary, previousReview, userComment) => {
    const data = await apiFetch("/api/ai/reply", {
        method: "POST",
        body: JSON.stringify({ summary, previousReview, userComment }),
    });
    return data.reply;
};
