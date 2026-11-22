/**
 * Hapus transaksi tertentu berdasarkan id.
 *
 * Dipakai buat baris yang nggak bisa dihapus lewat app -- misalnya bulan lalu
 * waktu tab Transaksi masih cuma nampilin bulan berjalan. Sekarang tab Monthly
 * sudah punya tombol hapus sendiri, jadi skrip ini cadangan aja.
 *
 * Saldo akun SENGAJA tidak diutak-atik. Dua baris yang jadi alasan skrip ini
 * dibuat sama-sama tidak boleh mengubah saldo:
 *   - "Grab* A-AX9Q587GWQ9RAV" Rp 15 -> source "Perlu Dicek" bukan akun
 *     beneran, jadi saldo tidak pernah kepotong sejak awal.
 *   - "Internet Transaction Journal" Rp 150.000 -> transfer antar rekening
 *     sendiri; duitnya memang keluar dari BCA, jadi saldo BCA sudah benar.
 *     Yang dihapus cuma tampilannya sebagai "pengeluaran".
 * Kalau nanti dipakai buat baris lain yang benar-benar memotong saldo, saldonya
 * harus disesuaikan manual -- atau lebih baik hapus lewat tombol di app, karena
 * jalur itu sudah mengurus saldo dan rencana cicilan sekaligus.
 *
 * Pakai:
 *   node scripts/hapus-transaksi.cjs           -> cuma menampilkan (aman)
 *   node scripts/hapus-transaksi.cjs --hapus   -> benar-benar menghapus
 */
const path = require("path");
const backend = path.join(__dirname, "..", "backend");
require(path.join(backend, "node_modules", "dotenv")).config({ path: path.join(backend, ".env") });
const { Pool } = require(path.join(backend, "node_modules", "pg"));

const USER_ID = "d09a1edc-3042-4e9f-886d-d5136ff379cc";

const IDS = [
    "9a4bf215-0976-4aba-87b9-d16b8fcf681b", // 31 Okt 22:55 - Grab* A-AX9Q587GWQ9RAV - Rp 15
    "f7d4544f-68b2-49b9-a164-0d45a2d7f938", // 31 Okt 19:54 - Internet Transaction Journal - Rp 150.000
];

const fmt = (v) => "Rp " + Number(v || 0).toLocaleString("id-ID");
const benarHapus = process.argv.includes("--hapus");

(async () => {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    });
    const c = await pool.connect();

    try {
        await c.query("BEGIN");

        const target = await c.query(
            `select id, to_char(date,'YYYY-MM-DD') d, coalesce(time,'') t, title, amount, source
             from transactions
             where user_id = $1 and id = any($2::uuid[])
             for update`,
            [USER_ID, IDS]
        );

        if (target.rowCount !== IDS.length) {
            console.log(
                "Ketemu " + target.rowCount + " dari " + IDS.length + " baris. " +
                "Yang lain mungkin sudah dihapus lewat app. Tidak ada yang diubah."
            );
            await c.query("ROLLBACK");
            return;
        }

        console.log((benarHapus ? "MENGHAPUS" : "AKAN DIHAPUS") + ":\n");
        target.rows.forEach((x) =>
            console.log("  ", x.d, String(x.t).padEnd(6), fmt(x.amount).padStart(12), "|",
                String(x.source).padEnd(13), "|", x.title)
        );
        console.log("\nSaldo akun tidak diubah (lihat penjelasan di atas file ini).");

        if (!benarHapus) {
            console.log("\n-- Ini baru tampilan. Jalankan lagi pakai --hapus kalau sudah yakin. --");
            await c.query("ROLLBACK");
            return;
        }

        const del = await c.query(
            "delete from transactions where user_id = $1 and id = any($2::uuid[])",
            [USER_ID, IDS]
        );
        await c.query("COMMIT");
        console.log("\nSelesai. " + del.rowCount + " baris dihapus.");
    } catch (err) {
        await c.query("ROLLBACK");
        console.error("GAGAL, semua dibatalkan:", err.message);
        process.exitCode = 1;
    } finally {
        c.release();
        await pool.end();
    }
})();
