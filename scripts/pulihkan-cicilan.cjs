// Memulihkan penanda cicilan yang hilang waktu angsuran "ke 1" ditandai lunas
// (dulu Tandai Lunas menghapus barisnya). Dua penanda dipasang ulang:
//   1. installment_total_loan pada angsuran tersisa yang paling awal
//   2. baris rencana di tabel installments
// Sekalian membuang dua baris "Monetapay" kembar yang sudah yatim.
// Aman diulang: yang sudah benar dilewati. Semua dalam satu transaksi.
const BASE = require("path").join(__dirname, "..", "backend");
require(BASE + "/node_modules/dotenv").config({ path: BASE + "/.env" });
const { Pool } = require(BASE + "/node_modules/pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const USER = "d09a1edc-3042-4e9f-886d-d5136ff379cc";
const CARD = "acc-1787632376758-ylkafirlq"; // CC BCA

// Nilai asli, dicatat dari tabel installments sebelum terhapus. Tidak
// diturunkan dari angsuran karena pembagian tiga menyisakan selisih rupiah.
const PLANS = [
    { name: "Chakolab",            totalLoan: 650000, term: 3, dueDate: 28 },
    { name: "Aye Denim",           totalLoan: 914000, term: 3, dueDate: 23 },
    { name: "SHOPEE.CO.ID 0%3BLN", totalLoan: 615028, term: 3, dueDate: 2  },
];

const baseTitle = (t) => String(t || "").replace(/\s+ke\s+\d+\s*$/i, "").trim();

(async () => {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const junk = await client.query(
            `DELETE FROM installments
             WHERE user_id = $1 AND name ILIKE 'monetapay' AND transaction_id IS NULL
             RETURNING id`, [USER]);
        console.log("Monetapay yatim dihapus :", junk.rowCount);

        for (const plan of PLANS) {
            const { rows: txs } = await client.query(
                `SELECT id, date::text tgl, title, amount::int amount, paid_at
                 FROM transactions
                 WHERE user_id = $1 AND dana_dipakai = 'Spend CC'
                   AND lower(btrim(regexp_replace(title, '\\s+ke\\s+[0-9]+$', '', 'i'))) = lower($2)
                 ORDER BY date`, [USER, plan.name]);

            if (txs.length === 0) {
                console.log(`${plan.name}: tidak ada angsuran tersisa, dilewati`);
                continue;
            }

            const anchor = txs.find((t) => !t.paid_at) || txs[0];

            await client.query(
                "UPDATE transactions SET installment_total_loan = $2 WHERE id = $1",
                [anchor.id, plan.totalLoan]);

            const unpaid = txs.filter((t) => !t.paid_at)
                              .reduce((s, t) => s + t.amount, 0);

            const { rows: existing } = await client.query(
                "SELECT id FROM installments WHERE user_id = $1 AND lower(name) = lower($2) LIMIT 1",
                [USER, plan.name]);

            if (existing.length > 0) {
                await client.query(
                    `UPDATE installments SET account_id=$2, transaction_id=$3, total_loan=$4,
                            remaining_balance=$5, monthly_installment=$6, remaining_term=$7, due_date=$8
                     WHERE id = $1`,
                    [existing[0].id, CARD, anchor.id, plan.totalLoan, unpaid,
                     anchor.amount, plan.term, plan.dueDate]);
                console.log(`${plan.name}: rencana diperbarui (sisa Rp ${unpaid.toLocaleString("id-ID")})`);
            } else {
                await client.query(
                    `INSERT INTO installments (id, account_id, transaction_id, name, provider,
                            total_loan, remaining_balance, monthly_installment, remaining_term, due_date, user_id)
                     VALUES ($1,$2,$3,$4,'',$5,$6,$7,$8,$9,$10)`,
                    ["inst-restored-" + Math.random().toString(36).slice(2, 10), CARD, anchor.id,
                     plan.name, plan.totalLoan, unpaid, anchor.amount, plan.term, plan.dueDate, USER]);
                console.log(`${plan.name}: rencana dibuat ulang (sisa Rp ${unpaid.toLocaleString("id-ID")})`);
            }
        }

        await client.query("COMMIT");

        const check = await client.query(
            "SELECT name, total_loan::int t, remaining_balance::int r, remaining_term, due_date FROM installments WHERE user_id = $1 ORDER BY name",
            [USER]);
        console.log("\n=== installments sekarang ===");
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
