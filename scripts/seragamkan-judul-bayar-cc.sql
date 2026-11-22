-- Menyeragamkan judul bayar tagihan kartu kredit jadi "Bayar CC <kartu>".
--
-- KENAPA: app mengenali bayar tagihan dari judul berawalan "Bayar CC" (lihat
-- isCcBillPayment di src/utils/report.js). Baris yang ditulis importir Gmail
-- sudah ikut format itu. Yang ditulis manual judulnya bebas -- dan selama
-- judulnya belum cocok, barisnya masih dihitung sebagai pengeluaran, jadi
-- belanja kartunya kehitung dua kali.
--
-- CARA PAKAI: jalankan LANGKAH 1 dulu dan baca hasilnya. Langkah 1 cuma
-- SELECT, tidak mengubah apa pun. Baru setelah daftarnya kelihatan benar,
-- jalankan LANGKAH 3.
--
-- DUA HAL YANG SENGAJA DIBUAT HATI-HATI:
--
-- 1. Nama kartu diambil dari JUDUL, bukan dari `source`. `source` di baris
--    bayar tagihan menyebut rekening PEMBAYAR, bukan kartunya -- bayar kartu
--    BNI dari rekening BCA bikin source='BCA' padahal kartunya BNI.
--
-- 2. Kategori 'Account Transfer' TIDAK cukup jadi alasan mengganti judul.
--    Kategori itu dipakai juga buat pindah uang antar rekening sendiri, dan
--    judul seperti "Transfer ke BCA" kebetulan menyebut nama kartu. Kalau
--    diganti jadi "Bayar CC BCA", app bakal mengurangi utang kartu yang
--    sebenarnya tidak dibayar. Jadi penggantian otomatis menuntut judulnya
--    benar-benar menyebut tagihan/kartu, dan baris yang cuma berkategori
--    Account Transfer tetap didaftar di langkah 1 buat diperiksa sendiri.


-- ===========================================================================
-- LANGKAH 0 (opsional) -- pastikan dugaan soal index uniknya benar.
-- Index ini yang bisa menolak pergantian judul. Dari kode app kuncinya
-- date + title + amount, tapi lebih baik dilihat langsung.
-- ===========================================================================
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'transactions';


-- ===========================================================================
-- LANGKAH 1 -- DRY RUN. Lihat apa yang akan berubah. Tidak mengubah apa pun.
-- ===========================================================================
WITH kartu(nama) AS (
  -- Tambahkan di sini kalau punya kartu lain.
  VALUES ('BCA'), ('BNI')
),
kandidat AS (
  SELECT t.id, t.date, t.title, t.amount, t.category, t.source, t.dana_dipakai,
         -- judulnya benar-benar bicara soal tagihan/kartu?
         (t.title ILIKE '%tagihan%' OR t.title ILIKE '%cc%'
          OR t.title ILIKE '%kartu%' OR t.title ILIKE '%pelunasan%')
         AND t.title NOT ILIKE '%transfer%'                   AS judul_soal_kartu,
         (SELECT array_agg(k.nama ORDER BY k.nama)
            FROM kartu k
           WHERE t.title ILIKE '%' || k.nama || '%')           AS kartu_cocok
  FROM transactions t
  WHERE t.type <> 'income'
    AND t.title NOT ILIKE 'bayar cc%'          -- yang sudah benar dilewati
    AND (
      t.category = 'Account Transfer'
      OR t.title ILIKE '%tagihan%'
      OR t.title ILIKE '%bayar%cc%'
      OR t.title ILIKE '%bayar%kartu%'
      OR t.title ILIKE '%pelunasan%'
    )
),
dinilai AS (
  SELECT k.*,
         CASE WHEN k.judul_soal_kartu AND array_length(k.kartu_cocok, 1) = 1
              THEN 'Bayar CC ' || k.kartu_cocok[1]
         END AS judul_baru
  FROM kandidat k
)
SELECT d.date,
       d.title                              AS judul_sekarang,
       d.judul_baru,
       d.amount,
       d.category,
       d.source,
       d.dana_dipakai,
       CASE
         WHEN NOT d.judul_soal_kartu
           THEN 'CEK MANUAL -- judul tidak menyebut tagihan/kartu, jadi belum tentu bayar CC'
         WHEN d.kartu_cocok IS NULL
           THEN 'CEK MANUAL -- judul tidak menyebut nama kartu'
         WHEN array_length(d.kartu_cocok, 1) > 1
           THEN 'CEK MANUAL -- judul menyebut lebih dari satu kartu: '
                || array_to_string(d.kartu_cocok, ', ')
         WHEN EXISTS (
           SELECT 1 FROM transactions x
           WHERE x.id <> d.id
             AND x.date = d.date
             AND x.amount = d.amount
             AND lower(btrim(x.title)) = lower(d.judul_baru)
         ) THEN 'CEK MANUAL -- bentrok baris lain (date+title+amount sama)'
         ELSE 'SIAP'
       END AS status
FROM dinilai d
ORDER BY status, d.amount DESC;


-- ===========================================================================
-- LANGKAH 3 -- UPDATE. Hanya baris berstatus SIAP di langkah 1.
--
-- Jalankan HANYA setelah daftar di langkah 1 kelihatan benar. Ini menulis ke
-- database dan tidak ada undo-nya, jadi baca dulu baris-barisnya.
--
-- Judul lama tidak disimpan di mana pun -- kalau mau bisa balik, salin dulu
-- hasil langkah 1 ke spreadsheet sebelum menjalankan ini.
--
-- RETURNING di bawah mencetak tepat baris yang berubah, jadi jumlahnya bisa
-- dicocokkan dengan jumlah baris SIAP di langkah 1.
-- ===========================================================================
WITH kartu(nama) AS (VALUES ('BCA'), ('BNI')),
kandidat AS (
  SELECT t.id, t.date, t.amount,
         (SELECT array_agg(k.nama ORDER BY k.nama)
            FROM kartu k
           WHERE t.title ILIKE '%' || k.nama || '%') AS kartu_cocok
  FROM transactions t
  WHERE t.type <> 'income'
    AND t.title NOT ILIKE 'bayar cc%'
    -- syarat yang sama dengan status SIAP: judulnya harus soal tagihan/kartu
    AND (t.title ILIKE '%tagihan%' OR t.title ILIKE '%cc%'
         OR t.title ILIKE '%kartu%' OR t.title ILIKE '%pelunasan%')
    AND t.title NOT ILIKE '%transfer%'
),
siap AS (
  SELECT k.id, 'Bayar CC ' || k.kartu_cocok[1] AS judul_baru
  FROM kandidat k
  WHERE array_length(k.kartu_cocok, 1) = 1
    AND NOT EXISTS (
      SELECT 1 FROM transactions x
      WHERE x.id <> k.id
        AND x.date = k.date
        AND x.amount = k.amount
        AND lower(btrim(x.title)) = lower('Bayar CC ' || k.kartu_cocok[1])
    )
)
UPDATE transactions t
SET title = s.judul_baru
FROM siap s
WHERE t.id = s.id
RETURNING t.date, t.title AS judul_baru, t.amount;


-- ===========================================================================
-- LANGKAH 4 -- verifikasi. Yang tersisa di sini harus tinggal baris yang
-- memang BUKAN bayar tagihan CC (transfer antar rekening sendiri, dll).
-- ===========================================================================
SELECT date, title, amount, category, source
FROM transactions
WHERE type <> 'income'
  AND title NOT ILIKE 'bayar cc%'
  AND (category = 'Account Transfer'
       OR title ILIKE '%tagihan%' OR title ILIKE '%bayar%cc%'
       OR title ILIKE '%bayar%kartu%' OR title ILIKE '%pelunasan%')
ORDER BY amount DESC;
