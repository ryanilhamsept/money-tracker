const GOOGLE_SHEET_API_URL =
    "https://script.google.com/macros/s/AKfycbx7vXtYC6Y8EsI6Kjm2dgdTW0FGfYsidzohTWPVQt-1jDF0kXqUuM4s5YUofrUy3xsKVg/exec";

const fetchJson = async (url) => {
    const response = await fetch(url, {
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`Google Sheets request failed (${response.status}).`);
    }

    const data = await response.json();

    if (data?.success === false) {
        throw new Error(data.error || "Google Sheets rejected the request.");
    }

    return data;
};

export const getTransactionsFromGoogleSheet = async () => {
    return fetchJson(GOOGLE_SHEET_API_URL);
};

export const syncTransactionToGoogleSheet = async (transaction) => {
    const params = new URLSearchParams({
        action: "add",
        id: transaction.id,
        date: transaction.date,
        notes: transaction.title,
        category: transaction.category,
        nominal: String(transaction.amount),
        ambil: transaction.danaDipakai,
        sof: transaction.source,
    });

    return fetchJson(`${GOOGLE_SHEET_API_URL}?${params.toString()}`);
};

export const updateTransactionToGoogleSheet = async (transaction) => {
    const params = new URLSearchParams({
        action: "update",
        id: transaction.id,
        date: transaction.date,
        notes: transaction.title,
        category: transaction.category,
        nominal: String(transaction.amount),
        ambil: transaction.danaDipakai,
        sof: transaction.source,
    });

    return fetchJson(`${GOOGLE_SHEET_API_URL}?${params.toString()}`);
};

export const deleteTransactionFromGoogleSheet = async (id) => {
    return fetchJson(
        `${GOOGLE_SHEET_API_URL}?action=delete&id=${encodeURIComponent(id)}`
    );
};

export const getBudgetFromGoogleSheet = async () => {
    return fetchJson(`${GOOGLE_SHEET_API_URL}?type=budget`);
};

export const saveBudgetToGoogleSheet = async (budget) => {
    return fetchJson(
        `${GOOGLE_SHEET_API_URL}?action=saveBudget&budget=${Number(budget)}`
    );
};

export const getAccountsFromGoogleSheet = async () => {
    return fetchJson(`${GOOGLE_SHEET_API_URL}?type=accounts`);
};

export const addAccountToGoogleSheet = async (account) => {
    const params = new URLSearchParams({
        action: "addAccount",
        id: account.id,
        name: account.name,
        type: account.type,
        startingBalance: String(account.startingBalance),
    });
    return fetchJson(`${GOOGLE_SHEET_API_URL}?${params.toString()}`);
};

export const deleteAccountFromGoogleSheet = async (id) => {
    return fetchJson(
        `${GOOGLE_SHEET_API_URL}?action=deleteAccount&id=${encodeURIComponent(id)}`
    );
};

export const updateStartingBalanceInGoogleSheet = async (id, balance) => {
    return fetchJson(
        `${GOOGLE_SHEET_API_URL}?action=updateStartingBalance&id=${encodeURIComponent(
            id
        )}&balance=${Number(balance)}`
    );
};

export const getOtherSourcesFromGoogleSheet = async () => {
    return fetchJson(`${GOOGLE_SHEET_API_URL}?type=otherSources`);
};

export const addOtherSourceToGoogleSheet = async (name) => {
    const params = new URLSearchParams({
        action: "addOtherSource",
        id: `src-${Date.now()}`,
        name: name.trim(),
    });
    return fetchJson(`${GOOGLE_SHEET_API_URL}?${params.toString()}`);
};
