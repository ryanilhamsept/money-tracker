// Kartu kredit tutup buku ("closing date") tiap tanggal tertentu -- untuk CC BCA
// tanggal 25. Transaksi mulai tanggal tutup buku sampai akhir bulan sudah masuk
// tagihan bulan berikutnya, bukan tagihan yang sedang berjalan.

export const DEFAULT_STATEMENT_DAY = 25;

const pad = (value) => String(value).padStart(2, "0");

const toDateString = (date) =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const getStatementDay = (account) =>
    Number(account?.dueDate) || DEFAULT_STATEMENT_DAY;

// Tanggal tutup buku terakhir yang sudah lewat -- awal siklus tagihan berjalan.
// Dipakai buat nyaring transaksi kartu yang belum ditagih.
export const getCurrentCycleStart = (statementDay, today = new Date()) => {
    const start = new Date(today.getFullYear(), today.getMonth(), statementDay);

    if (today.getDate() < statementDay) {
        start.setMonth(start.getMonth() - 1);
    }

    return toDateString(start);
};

// Cicilan pertama nempel di tagihan pertama setelah belanja: belanja sebelum
// tutup buku ditagih di bulan yang sama, belanja pada/sesudahnya geser sebulan.
export const getFirstInstallmentMonthOffset = (purchaseDay, statementDay) =>
    purchaseDay >= statementDay ? 1 : 0;
