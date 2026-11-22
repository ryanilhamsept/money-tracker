// Membuat ulang angsuran "ke 1" yang terhapus waktu "Tandai Lunas" masih
// berarti DELETE. Belanjanya benar-benar terjadi, jadi harus tetap ada di
// riwayat -- dibuat ulang dengan paid_at terisi, sehingga tercatat sebagai
// pengeluaran tapi tidak lagi membebani saldo kartu (getTransactionAccountEffects
// mengabaikan baris yang sudah lunas).
//
// Penanda total pinjaman dikembalikan ke "ke 1" seperti aslinya, dan dilepas
// dari "ke 2" supaya tidak ada dua induk dalam satu kelompok.
// Aman diulang: yang sudah ada dilewati. Semua dalam satu transaksi.
const BASE = require("path").join(__dirname, "..", "backend");
require(BASE + "/node_modules/dotenv").config({ path: BASE + "/.env" });
const { Pool } = require(BASE + "/node_modules/pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const USER = "d09a1edc-3042-4e9f-886d-d5136ff379cc";

// Tanggal, jam dan nominal asli, dicatat dari tabel sebelum terhapus.
const PAID = [
    { name: "Chakolab",            date: "2026-09-28", time: "18:45", amount: 216667, loan: 650000 },
    { name: "Aye Denim",           date: "2026-09-23", time: "18:50", amount: 304667, loan: 914000 },
    { name: "SHOPEE.CO.ID 0%3BLN", date: "2026-09-02", time: "23:26", amount: 205010, loan: 615028 },
];

(async () => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        for (const p of PAID) {
            const title = `${p.name} ke 1`;

            const { rows: exists } = await client.query(
                "SELECT id FROM transactions WHERE user_id=$1 AND lower(btrim(title))=lower($2)",
                [USER, title]);
            if (exists.length > 0) {
                console.log(`${title}: sudah ada, dilewati`);
                continue;
            }

            const id = crypto.randomUUID();
            await client.query(
                `INSERT INTO transactions (id, date, time, title, category, amount, source,
                                           dana_dipakai, type, installment_total_loan, user_id, paid_at)
                 VALUES ($1,$2,$3,$4,'Shopping',$5,'Credit Card - BCA','Spend CC','expense',$6,$7,now())`,
                [id, p.date, p.time, title, p.amount, p.loan, USER]);

            // Induk kembali ke "ke 1"; lepas dari "ke 2" agar tidak dobel.
            await client.query(
                `UPDATE transactions SET installment_total_loan = NULL
                 WHERE user_id=$1 AND lower(btrim(title))=lower($2)`,
                [USER, `${p.name} ke 2`]);

            await client.query(
                "UPDATE installments SET transaction_id=$2 WHERE user_id=$1 AND lower(name)=lower($3)",
                [USER, id, p.name]);

            console.log(`${title}: dibuat ulang (${p.date}, Rp ${p.amount.toLocaleString("id-ID")}, ditandai lunas)`);
        }

        await client.query("COMMIT");

        const check = await client.query(
            `SELECT date::text tgl, title, amount::int amount,
                    installment_total_loan::int loan,
                    CASE WHEN paid_at IS NULL THEN 'belum' ELSE 'LUNAS' END status
             FROM transactions WHERE user_id=$1 AND dana_dipakai='Spend CC'
               AND source ILIKE '%bca%' AND source NOT ILIKE '%bni%' AND date >= '2026-08-25'
             ORDER BY title, date`, [USER]);
        console.log("\n=== transaksi kartu CC BCA ===");
        console.table(check.rows);
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("GAGAL, semua dibatalkan:", e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
})();
