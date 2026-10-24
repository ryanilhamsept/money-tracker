// Mirror dari src/utils/transactions.js (web).

export const deduplicateTransactionsById = (rows) => {
  const seenIds = new Set();
  const uniqueRows = [];
  let duplicateCount = 0;

  for (const row of rows) {
    const id = String(row.id || "").trim();

    if (id && seenIds.has(id)) {
      duplicateCount += 1;
      continue;
    }

    if (id) {
      seenIds.add(id);
    }

    uniqueRows.push(row);
  }

  return { rows: uniqueRows, duplicateCount };
};

const normalizeTitle = (value) => String(value || "").trim().toLowerCase();

// Dua transaksi dianggap pembelian yang sama kalau tanggal, judul dan nominal
// cocok. Sumber dana sengaja TIDAK dibandingkan: satu pembelian bisa masuk dua
// kali dengan label sumber berbeda (pembayaran Blu kebaca sebagai "Blu" dan
// "BCA" dari dua notifikasi bank), dan justru dobel itulah yang mau ditangkap.
// Waktu juga nggak dipakai: entri manual sering nggak punya. Ini peringatan,
// bukan aturan keras -- dua Grab identik dalam sehari itu wajar, jadi pemanggil
// harus ngasih jalan buat tetap simpan. Sama persis dengan cek SQL di backend
// POST /api/transactions.
export const findDuplicateTransaction = (transactions, candidate) => {
  const title = normalizeTitle(candidate.title);
  const amount = Number(candidate.amount) || 0;

  return (
    transactions.find(
      (t) =>
        t.id !== candidate.id &&
        t.date === candidate.date &&
        normalizeTitle(t.title) === title &&
        (Number(t.amount) || 0) === amount
    ) || null
  );
};
