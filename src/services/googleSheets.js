const GOOGLE_SHEET_API_URL =
    "https://script.google.com/macros/s/AKfycbxxciBr4xLfeymr25UAzlVerEJW61gzS0FeQQ2HkTy9o70qvAE9fbP7ABkx8MKfalbdug/exec";

export const getTransactionsFromGoogleSheet = async () => {
    const response = await fetch(GOOGLE_SHEET_API_URL);

    return response.json();
};

export const syncTransactionToGoogleSheet = async (transaction) => {
    await fetch(GOOGLE_SHEET_API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
            "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
            id: transaction.id,
            date: transaction.date,
            notes: transaction.title,
            category: transaction.category,
            nominal: transaction.amount,
            ambil: transaction.danaDipakai,
            sof: transaction.source,
        }),
    });
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
    await fetch(GOOGLE_SHEET_API_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
            "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify({
            action: "saveBudget",
            budget: Number(budget),
        }),
    });
};