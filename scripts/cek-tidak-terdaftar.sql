-- Apa saja yang masuk ke baris "Tidak Terdaftar" di tab Tahunan.
--
-- Tempel di Supabase Dashboard > SQL Editor, lalu Run.
--
-- Daftar di bawah disalin dari dua tempat yang dipakai app:
--   web    : .env  (VITE_CATEGORIES / VITE_FUND_SOURCES / VITE_DANA_DIPAKAI_OPTIONS)
--   mobile : mobile/src/constants/options.js
-- Keduanya sudah dicek sama persis. Apa pun di tabel yang TIDAK ada di sini
-- itulah yang dikumpulkan jadi "Tidak Terdaftar".

WITH terdaftar AS (
  SELECT
    ARRAY['Account Transfer','Food','Transportation','Groceries','Utilities',
          'Entertainment','Internet','Shopping','Health','Education',
          'Miscellaneous']                                            AS kategori,
    ARRAY['Mandiri','BCA','BNI','Credit Card - BCA','Credit Card - BNI',
          'Blu','Superbank']                                          AS sumber,
    ARRAY['Spend Bulanan','Ambil dari tabungan','Bagian THR','Spend CC',
          'Other','Liburan']                                          AS dana
),
pengeluaran AS (
  -- Cakupannya disamakan dengan kartu "Uang yang sudah keluar": pengeluaran
  -- saja, dan mulai 2026.
  SELECT t.*, d.kategori, d.sumber, d.dana
  FROM transactions t
  CROSS JOIN terdaftar d
  WHERE t.type <> 'income'
    AND t.date >= '2026-01-01'
)
SELECT 'category'     AS kolom,
       COALESCE(NULLIF(btrim(category), ''), '(kosong)')     AS nilai,
       count(*)::int                                         AS transaksi,
       sum(amount)::bigint                                   AS total,
       min(date)                                             AS pertama,
       max(date)                                             AS terakhir,
       (array_agg(DISTINCT title))[1:3]                      AS contoh
FROM pengeluaran
WHERE COALESCE(btrim(category), '') <> ALL (kategori)
GROUP BY 2

UNION ALL
SELECT 'source',
       COALESCE(NULLIF(btrim(source), ''), '(kosong)'),
       count(*)::int, sum(amount)::bigint, min(date), max(date),
       (array_agg(DISTINCT title))[1:3]
FROM pengeluaran
WHERE COALESCE(btrim(source), '') <> ALL (sumber)
GROUP BY 2

UNION ALL
SELECT 'dana_dipakai',
       COALESCE(NULLIF(btrim(dana_dipakai), ''), '(kosong)'),
       count(*)::int, sum(amount)::bigint, min(date), max(date),
       (array_agg(DISTINCT title))[1:3]
FROM pengeluaran
WHERE COALESCE(btrim(dana_dipakai), '') <> ALL (dana)
GROUP BY 2

ORDER BY total DESC NULLS LAST;


-- ---------------------------------------------------------------------
-- Kalau sudah ketahuan nilainya apa, ini buat lihat barisnya satu per satu.
-- Ganti 'Gajian' dan nama kolomnya sesuai hasil di atas.
-- ---------------------------------------------------------------------
-- SELECT date, time, title, category, source, dana_dipakai, amount
-- FROM transactions
-- WHERE type <> 'income'
--   AND date >= '2026-01-01'
--   AND dana_dipakai = 'Gajian'
-- ORDER BY amount DESC;


-- ---------------------------------------------------------------------
-- Sekalian: SEMUA nilai yang ada di tabel, terdaftar maupun tidak.
-- Berguna buat lihat salah ketik ("BCA " dengan spasi, "bca" huruf kecil).
-- ---------------------------------------------------------------------
-- SELECT 'dana_dipakai' AS kolom, dana_dipakai AS nilai,
--        count(*)::int AS transaksi, sum(amount)::bigint AS total
-- FROM transactions WHERE type <> 'income' AND date >= '2026-01-01'
-- GROUP BY 2
-- UNION ALL
-- SELECT 'source', source, count(*)::int, sum(amount)::bigint
-- FROM transactions WHERE type <> 'income' AND date >= '2026-01-01'
-- GROUP BY 2
-- UNION ALL
-- SELECT 'category', category, count(*)::int, sum(amount)::bigint
-- FROM transactions WHERE type <> 'income' AND date >= '2026-01-01'
-- GROUP BY 2
-- ORDER BY kolom, total DESC;
