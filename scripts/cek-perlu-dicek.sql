-- Apa saja yang masuk sebagai "Perlu Dicek", dan apa akibatnya.
--
-- Tempel di Supabase Dashboard > SQL Editor. Langkah 1-3 cuma SELECT.
--
-- "Perlu Dicek" dipasang importir Gmail di DUA situasi berbeda:
--
--   source = 'Perlu Dicek'    -> alamat pengirim emailnya belum ada di
--                                BANK_CONFIG (UNKNOWN_BANK di gmail-import.gs)
--   category = 'Perlu Dicek'  -> pengirimnya dikenal, tapi nominal/tanggalnya
--                                gagal diekstrak dari badan email
--
-- Yang paling merugikan adalah yang pertama. findAccountForSource() tidak
-- mengenali 'Perlu Dicek' sebagai akun mana pun, jadi barisnya TIDAK
-- menggerakkan saldo akun sama sekali -- padahal uangnya benar-benar keluar
-- dari rekening. Transaksinya tetap kehitung di total pengeluaran, tapi saldo
-- di app tidak ikut berkurang, jadi saldonya pelan-pelan melenceng dari bank.


-- ===========================================================================
-- LANGKAH 1 -- source 'Perlu Dicek': ini yang bikin saldo melenceng.
-- ===========================================================================
SELECT date, title, amount, category, dana_dipakai
FROM transactions
WHERE source = 'Perlu Dicek'
ORDER BY date DESC;

-- Totalnya -- sebesar inilah saldo akun di app lebih tinggi dari bank.
SELECT count(*)::int AS baris,
       sum(amount) FILTER (WHERE type <> 'income')::bigint AS total_keluar_tak_tercatat,
       min(date) AS pertama,
       max(date) AS terakhir
FROM transactions
WHERE source = 'Perlu Dicek';


-- ===========================================================================
-- LANGKAH 2 -- category 'Perlu Dicek': ekstraksi gagal.
-- Perhatikan yang amount = 0 -- itu biasanya email PROMO yang kebawa masuk
-- jadi transaksi, bukan transaksi beneran.
-- ===========================================================================
SELECT date, title, amount, source, dana_dipakai
FROM transactions
WHERE category = 'Perlu Dicek'
ORDER BY amount ASC, date DESC;


-- ===========================================================================
-- LANGKAH 3 -- kandidat sampah: nominalnya nol atau tidak masuk akal.
-- Baris seperti ini datang dari email yang bukan transaksi.
-- ===========================================================================
SELECT date, title, amount, category, source, dana_dipakai
FROM transactions
WHERE amount IS NULL OR amount <= 0 OR amount < 100
ORDER BY date DESC;


-- ===========================================================================
-- LANGKAH 4 -- PERBAIKAN, dan kenapa ini TIDAK boleh borongan.
--
-- source='Perlu Dicek' datang dari LEBIH DARI SATU pengirim. Dari notifikasi
-- importir di Gmail, setidaknya ada dua:
--
--   bnicreditcard@bni.co.id  -> belanja kartu kredit BNI
--                               (mis. "QRIS-TITIK DESA KOTA", "QRIS-Secte
--                               Ayam Pop", "FMS WTC 2" -- 21 Nov 2026)
--   pasporbca@klikbca.com    -> PENGEMBALIAN DANA debit BCA, 9 Nov 2026.
--                               Ini uang MASUK, bukan belanja, dan bukan
--                               kartu kredit.
--
-- Satu UPDATE yang menyapu semua source='Perlu Dicek' bakal mengubah baris
-- refund itu jadi belanja kartu BNI. Makanya di bawah barisnya disebut satu
-- per satu lewat id.
--
-- CARA PAKAI: jalankan LANGKAH 1, lihat daftarnya, lalu salin id baris yang
-- memang belanja kartu kredit BNI ke dalam kurung di bawah.
-- ===========================================================================
UPDATE transactions
SET source = 'Credit Card - BNI',
    dana_dipakai = 'Spend CC'
WHERE id IN (
  -- tempel id dari LANGKAH 1 di sini, dipisah koma:
  -- '...', '...', '...'
)
RETURNING date, title, amount, source, dana_dipakai;

-- Kalau mau lihat id-nya berikut tebakan asalnya dulu:
SELECT id, date, title, amount, type,
       CASE
         WHEN type = 'income' OR title ILIKE '%pengembalian%' OR title ILIKE '%refund%'
           THEN 'JANGAN diubah -- ini uang masuk / refund'
         ELSE 'kemungkinan belanja kartu kredit BNI -- cocokkan dengan email aslinya'
       END AS saran
FROM transactions
WHERE source = 'Perlu Dicek'
ORDER BY date DESC;


-- ===========================================================================
-- CATATAN SALDO -- jangan dilewat.
--
-- Saldo akun DISIMPAN, bukan dihitung ulang dari transaksi. Jadi mengubah
-- source di sini tidak otomatis mengoreksi saldo terpakai kartu BNI.
-- Sesuaikan manual di tab Akun, sebesar total yang dicetak LANGKAH 1.
-- ===========================================================================
