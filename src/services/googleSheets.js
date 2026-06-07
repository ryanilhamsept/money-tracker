const GOOGLE_SHEET_API_URL =
    "https://script.google.com/macros/s/AKfycbx7vXtYC6Y8EsI6Kjm2dgdTW0FGfYsidzohTWPVQt-1jDF0kXqUuM4s5YUofrUy3xsKVg/exec";

export const getTransactionsFromGoogleSheet = async () => {
    const response = await fetch(GOOGLE_SHEET_API_URL);
    return response.json();
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

    const response = await fetch(`${GOOGLE_SHEET_API_URL}?${params.toString()}`);
    return response.json();
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

    const response = await fetch(`${GOOGLE_SHEET_API_URL}?${params.toString()}`);
    return response.json();
};

export const deleteTransactionFromGoogleSheet = async (id) => {
    const response = await fetch(
        `${GOOGLE_SHEET_API_URL}?action=delete&id=${encodeURIComponent(id)}`
    );

    return response.json();
};

export const getBudgetFromGoogleSheet = async () => {
    const response = await fetch(`${GOOGLE_SHEET_API_URL}?type=budget`);
    return response.json();
};

export const saveBudgetToGoogleSheet = async (budget) => {
    const response = await fetch(
        `${GOOGLE_SHEET_API_URL}?action=saveBudget&budget=${Number(budget)}`
    );

    return response.json();
};

export const getAccountsFromGoogleSheet = async () => {
    const response = await fetch(`${GOOGLE_SHEET_API_URL}?type=accounts`);
    return response.json();
};

export const addAccountToGoogleSheet = async (account) => {
    const params = new URLSearchParams({
        action: "addAccount",
        id: account.id,
        name: account.name,
        type: account.type,
        startingBalance: String(account.startingBalance),
    });
    const response = await fetch(`${GOOGLE_SHEET_API_URL}?${params.toString()}`);
    return response.json();
};

export const deleteAccountFromGoogleSheet = async (id) => {
    const response = await fetch(
        `${GOOGLE_SHEET_API_URL}?action=deleteAccount&id=${encodeURIComponent(id)}`
    );
    return response.json();
};

export const updateStartingBalanceInGoogleSheet = async (id, balance) => {
    const response = await fetch(
        `${GOOGLE_SHEET_API_URL}?action=updateStartingBalance&id=${encodeURIComponent(
            id
        )}&balance=${Number(balance)}`
    );
    return response.json();
};

export const getOtherSourcesFromGoogleSheet = async () => {
    const response = await fetch(`${GOOGLE_SHEET_API_URL}?type=otherSources`);
    return response.json();
};

export const addOtherSourceToGoogleSheet = async (name) => {
    const params = new URLSearchParams({
        action: "addOtherSource",
        id: `src-${Date.now()}`,
        name: name.trim(),
    });
    const response = await fetch(`${GOOGLE_SHEET_API_URL}?${params.toString()}`);
    return response.json();
};