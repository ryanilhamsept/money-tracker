-- Satu query buat lihat kondisi data sekarang. Read-only.
-- Tempel di Supabase Dashboard > SQL Editor, lalu Run.
--
-- Baca kolom "harusnya": kalau angkanya sesuai, bagian itu beres.

SELECT 'A. Masih source Perlu Dicek' AS cek,
       count(*)::int AS baris,
       COALESCE(sum(amount), 0)::bigint AS total,
       '0 -- kalau masih ada, remap-nya belum kelar' AS harusnya
FROM transactions WHERE source = 'Perlu Dicek'

UNION ALL
SELECT 'B. Credit Card - BNI + Spend CC',
       count(*)::int, COALESCE(sum(amount), 0)::bigint,
       'hasil remap yang benar -- angka ini yang diharapkan naik'
FROM transactions WHERE source = 'Credit Card - BNI' AND dana_dipakai = 'Spend CC'

UNION ALL
SELECT 'C. Credit Card - BNI tapi dana_dipakai masih lain',
       count(*)::int, COALESCE(sum(amount), 0)::bigint,
       '0 -- kalau ada, belanja kartu masih makan budget bulanan'
FROM transactions WHERE source = 'Credit Card - BNI' AND COALESCE(dana_dipakai, '') <> 'Spend CC'

UNION ALL
SELECT 'D. Kategori Perlu Dicek (ekstraksi gagal)',
       count(*)::int, COALESCE(sum(amount), 0)::bigint,
       'cek manual -- yang amount-nya 0 biasanya email promo'
FROM transactions WHERE category = 'Perlu Dicek'

UNION ALL
SELECT 'E. Bayar tagihan CC (sudah dikecualikan dari total)',
       count(*)::int, COALESCE(sum(amount), 0)::bigint,
       'segini yang tadinya dobel-hitung di uang keluar'
FROM transactions WHERE type <> 'income' AND title ILIKE 'bayar cc%'

UNION ALL
SELECT 'F. Bayar tagihan CC yang judulnya belum seragam',
       count(*)::int, COALESCE(sum(amount), 0)::bigint,
       '0 -- kalau ada, masih kehitung sebagai belanja'
FROM transactions
WHERE type <> 'income'
  AND title NOT ILIKE 'bayar cc%'
  AND title NOT ILIKE '%transfer%'
  AND (title ILIKE '%tagihan%' OR title ILIKE '%pelunasan%' OR title ILIKE '%bayar%kartu%')

ORDER BY cek;


-- Saldo kartu kredit yang tersimpan sekarang.
-- Bandingkan "Used" kartu BNI dengan angka B di atas: kalau remap di Home
-- jalan, saldo terpakainya sudah ikut naik sebesar itu.
SELECT name, type, balance, starting_balance
FROM accounts
WHERE lower(type) = 'kartu kredit'
ORDER BY name;
