const GOOGLE_SHEET_API_URL =
    "https://script.google.com/macros/s/AKfycbz9SBhoKmC-3L1EUwVdDvhbwGuTdz71OI1YQdWhZHHAOTtAPEGBhv-wC83VMKlZWbtv9A/exec";

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