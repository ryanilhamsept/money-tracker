const GOOGLE_SHEET_API_URL =
    "https://script.google.com/macros/s/AKfycbypRR0Ic6Psac61W2HJYOITJa4qZ89IMOdbIqQXyREiVlkJrJoWMqZMIfMIE38QoPh5eQ/exec";

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