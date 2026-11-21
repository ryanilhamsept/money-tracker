-- Berapa besar bayar tagihan kartu kredit tadinya dobel-hitung.
--
-- Tempel di Supabase Dashboard > SQL Editor, lalu Run. Query ini cuma SELECT,
-- tidak mengubah apa pun.
--
-- Bayar tagihan CC bukan pengeluaran baru: belanjanya sudah tercatat satu per
-- satu waktu kartunya dipakai. App mengenalinya dari judul berawalan
-- "Bayar CC" (lihat isCcBillPayment di src/utils/report.js).

-- 1. Daftar barisnya, terbesar dulu.
SELECT date, title, amount, category, source, dana_dipakai
FROM transactions
WHERE type <> 'income'
  AND title ILIKE 'bayar cc%'
ORDER BY amount DESC;


-- 2. Totalnya -- inilah angka yang dulu kelebihan di "Uang yang sudah keluar".
SELECT count(*)::int AS baris,
       sum(amount)::bigint AS total_dobel_hitung,
       min(date) AS pertama,
       max(date) AS terakhir
FROM transactions
WHERE type <> 'income'
  AND title ILIKE 'bayar cc%'
  AND date >= '2026-01-01';


-- 3. Per bulan, buat mencocokkan dengan laporan bulanan.
SELECT to_char(date::date, 'YYYY-MM') AS bulan,
       count(*)::int AS baris,
       sum(amount)::bigint AS total
FROM transactions
WHERE type <> 'income'
  AND title ILIKE 'bayar cc%'
GROUP BY 1
ORDER BY 1 DESC;


-- 4. PENTING -- bayar tagihan yang judulnya TIDAK berawalan "Bayar CC".
--    Baris seperti ini tidak dikenali app, jadi masih kehitung sebagai
--    pengeluaran. Kalau ada hasilnya, judulnya perlu diseragamkan jadi
--    "Bayar CC <kartu>" supaya ikut dikecualikan.
SELECT date, title, amount, category, source, dana_dipakai
FROM transactions
WHERE type <> 'income'
  AND title NOT ILIKE 'bayar cc%'
  AND (
    category = 'Account Transfer'
    OR title ILIKE '%tagihan%'
    OR title ILIKE '%bayar%cc%'
    OR title ILIKE '%bayar%kartu%'
    OR title ILIKE '%pelunasan%'
  )
ORDER BY amount DESC;
