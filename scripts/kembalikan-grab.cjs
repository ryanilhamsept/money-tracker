// PEMULIHAN: mengembalikan 21 baris Grab yang terhapus oleh dedup yang
// terlalu longgar (mencocokkan tanggal + nominal saja, sehingga perjalanan
// berbeda dengan tarif sama di hari yang sama ikut terhapus).
//
// Kolom `time` tidak sempat tercatat sebelum penghapusan, jadi dikosongkan.
// Kategori dan dana dipakai diisi dengan nilai yang seragam untuk semua
// transaksi Grab sebelumnya (Transportation / Spend Bulanan).
//
// Saldo akun sumbernya ditarik ulang sebesar nominal yang dikembalikan,
// membatalkan pengembalian yang terjadi saat penghapusan.
const BASE = require("path").join(__dirname, "..", "backend");
require(BASE + "/node_modules/dotenv").config({ path: BASE + "/.env" });
const { Pool } = require(BASE + "/node_modules/pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const USER = "d09a1edc-3042-4e9f-886d-d5136ff379cc";

const LOST = [
    ["2026-05-31", "Grab", 13000, "BCA"],
    ["2026-08-24", "Grab", 7500, "Cash"],
    ["2026-08-25", "Grab Bike Hemat", 7500, "Superbank"],
    ["2026-08-27", "Grab", 7500, "Superbank"],
    ["2026-09-01", "Grab", 7500, "Superbank"],
    ["2026-09-04", "Grab", 7500, "Superbank"],
    ["2026-09-11", "Grab", 5500, "Superbank"],
    ["2026-09-11", "Grab* A-9QRBN2IGWKF9AV", 5500, "Blu"],
    ["2026-09-11", "Grab", 5500, "Superbank"],
    ["2026-09-11", "Grab", 9500, "Superbank"],
    ["2026-09-11", "Grab* A-9QR8R92G34FRAV", 9500, "Blu"],
    ["2026-09-11", "Grab", 9500, "Superbank"],
    ["2026-09-12", "Grab", 5500, "Superbank"],
    ["2026-09-12", "Grab", 7000, "Blu"],
    ["2026-09-12", "Grab", 7000, "Blu"],
    ["2026-09-13", "Grab* A-9R2WS6BGXCN5AV", 5500, "Blu"],
    ["2026-09-25", "Grab* A-9SJEIWHWWKN5AV", 7500, "Blu"],
    ["2026-09-27", "Grab", 7500, "Superbank"],
    ["2026-09-27", "Grab", 7500, "Superbank"],
    ["2026-09-27", "Grab", 12700, "Superbank"],
    ["2026-09-27", "Grab", 14100, "Superbank"],
];

(async () => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        for (const [date, title, amount, source] of LOST) {
            await client.query(
                `INSERT INTO transactions (id, date, time, title, category, amount, source,
                                           dana_dipakai, type, installment_total_loan, user_id)
                 VALUES ($1,$2,NULL,$3,'Transportation',$4,$5,'Spend Bulanan','expense',NULL,$6)`,
                [crypto.randomUUID(), date, title, amount, source, USER]);
            await client.query(
                `UPDATE accounts SET starting_balance = starting_balance - $3, updated_at = now()
                 WHERE user_id=$1 AND lower(name)=lower($2)`,
                [USER, source, amount]);
        }
        await client.query("COMMIT");
        console.log("dikembalikan:", LOST.length, "baris");
        const acc = await client.query(
            `SELECT name, starting_balance::numeric b FROM accounts
             WHERE user_id=$1 AND name IN ('BLU BCA','Superbank','BCA') ORDER BY name`, [USER]);
        acc.rows.forEach((r) =>
            console.log(`   ${r.name.padEnd(10)} Rp ${Number(r.b).toLocaleString("id-ID")}`));
    } catch (e) {
        await client.query("ROLLBACK");
        console.error("GAGAL, semua dibatalkan:", e.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
})();
