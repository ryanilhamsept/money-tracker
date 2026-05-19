const GOOGLE_SHEET_API_URL =
    "https://script.google.com/macros/s/AKfycbzeU8QlaoyfkRsspensFtTXi740ictD0b7zfOTvPKWFL3hTZ9rFfML-IrZYk7dWS6cruw/exec";

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

    const response = await fetch(
        `${GOOGLE_SHEET_API_URL}?${params.toString()}`
    );

    return response.json();
};

export const deleteTransactionFromGoogleSheet = async (id) => {
    await fetch(GOOGLE_SHEET_API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
            "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
            action: "delete",
            id,
        }),
    });
};

export const getBudgetFromGoogleSheet = async () => {
    const response = await fetch(
        `${GOOGLE_SHEET_API_URL}?type=budget`
    );

    return response.json();
};

export const saveBudgetToGoogleSheet = async (budget) => {
    const response = await fetch(
        `${GOOGLE_SHEET_API_URL}?action=saveBudget&budget=${Number(budget)}`
    );

    return response.json();
};