import { normalizeDate } from "./date";

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

// Urutan daftar transaksi: terbaru dulu. Dipakai bareng app web dan mobile --
// dulu mobile cuma mengurut tanggal lalu createdAt, jadi di dalam satu hari
// urutannya mengikuti kapan baris itu masuk dari importer Gmail, bukan jam
// transaksinya. Akibatnya 19:41 bisa nyempil di antara 12:21 dan 12:19.
export const compareTransactionsNewestFirst = (a, b) => {
  const dateCompare = normalizeDate(b.date).localeCompare(normalizeDate(a.date));
  if (dateCompare !== 0) return dateCompare;

  const timeCompare = String(b.time || "").localeCompare(String(a.time || ""));
  if (timeCompare !== 0) return timeCompare;

  return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
};

// Rincian harian di laporan bulanan memakai acuan sendiri: jam digabung ke
// tanggal jadi satu angka, dan baris tanpa jam jatuh ke createdAt.
export const sortTimestamp = (item) => {
  if (item.time) {
      return new Date(`${normalizeDate(item.date)}T${item.time}`).getTime();
  }
  return new Date(item.createdAt || 0).getTime();
};
