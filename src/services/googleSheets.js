const GOOGLE_SHEET_API_URL =
    "https://script.google.com/macros/s/AKfycbwaDuZHfiV1Nu6mXArvAACCjIunnoE7DIDaKao9RKSaYvM6JhKs_QWQVbqjp0LuJE7caA/exec";

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