const GOOGLE_SHEET_API_URL = import.meta.env.VITE_GOOGLE_SHEET_API_URL;

const delay = (ms) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

// Generic request helper supporting retries, timeout, and optional method/body.
const requestJson = async (url, { method = "GET", body = null, retries = 2, timeoutMs = 18000, headers = {} } = {}) => {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                method,
                cache: "no-store",
                signal: controller.signal,
                headers: {
                    "Content-Type": "application/json",
                    // Placeholder for auth token; replace with real token source.
                    "Authorization": `Bearer ${import.meta.env.VITE_API_TOKEN || ""}`,
                    ...headers,
                },
                body: body ? JSON.stringify(body) : null,
            });

            if (!response.ok) {
                throw new Error(`Google Sheets request failed (${response.status}).`);
            }

            const data = await response.json();
            if (data?.success === false) {
                throw new Error(data.error || "Google Sheets rejected the request.");
            }
            return data;
        } catch (error) {
            lastError = error;
            if (attempt === retries) break;
            await delay(700 * (attempt + 1));
        } finally {
            clearTimeout(timeoutId);
        }
    }
    throw lastError;
};

export const getTransactionsFromGoogleSheet = async () => {
    return requestJson(GOOGLE_SHEET_API_URL);
};

export const syncTransactionToGoogleSheet = async (transaction) => {
    const payload = {
        action: "add",
        id: transaction.id,
        date: transaction.date,
        notes: transaction.title,
        category: transaction.category,
        nominal: String(transaction.amount),
        ambil: transaction.danaDipakai,
        sof: transaction.source,
    };
    return requestJson(GOOGLE_SHEET_API_URL, { method: "POST", body: payload });
};

export const updateTransactionToGoogleSheet = async (transaction) => {
    const payload = {
        action: "update",
        id: transaction.id,
        date: transaction.date,
        notes: transaction.title,
        category: transaction.category,
        nominal: String(transaction.amount),
        ambil: transaction.danaDipakai,
        sof: transaction.source,
    };
    return requestJson(GOOGLE_SHEET_API_URL, { method: "POST", body: payload });
};

export const deleteTransactionFromGoogleSheet = async (id) => {
    const payload = { action: "delete", id };
    return requestJson(GOOGLE_SHEET_API_URL, { method: "POST", body: payload });
};

export const getBudgetFromGoogleSheet = async () => {
    return requestJson(`${GOOGLE_SHEET_API_URL}?type=budget`);
};

export const saveBudgetToGoogleSheet = async (budget) => {
    const payload = { action: "saveBudget", budget: Number(budget) };
    return requestJson(GOOGLE_SHEET_API_URL, { method: "POST", body: payload });
};

export const getAccountsFromGoogleSheet = async () => {
    return requestJson(`${GOOGLE_SHEET_API_URL}?type=accounts`);
};

export const addAccountToGoogleSheet = async (account) => {
    const payload = {
        action: "addAccount",
        id: account.id,
        name: account.name,
        type: account.type,
        startingBalance: String(account.startingBalance),
    };
    return requestJson(GOOGLE_SHEET_API_URL, { method: "POST", body: payload });
};

export const deleteAccountFromGoogleSheet = async (id) => {
    const payload = { action: "deleteAccount", id };
    return requestJson(GOOGLE_SHEET_API_URL, { method: "POST", body: payload });
};

export const updateStartingBalanceInGoogleSheet = async (id, balance) => {
    const payload = { action: "updateStartingBalance", id, balance: Number(balance) };
    return requestJson(GOOGLE_SHEET_API_URL, { method: "POST", body: payload });
};

export const getOtherSourcesFromGoogleSheet = async () => {
    return requestJson(`${GOOGLE_SHEET_API_URL}?type=otherSources`);
};

export const addOtherSourceToGoogleSheet = async (name) => {
    const payload = {
        action: "addOtherSource",
        id: `src-${Date.now()}`,
        name: name.trim(),
    };
    return requestJson(GOOGLE_SHEET_API_URL, { method: "POST", body: payload });
};
