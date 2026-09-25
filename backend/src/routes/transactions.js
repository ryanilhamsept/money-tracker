const { Router } = require("express");
const { mirrorToGoogleSheet } = require("../services/googleSheets");
const { asyncHandler } = require("../middleware/asyncHandler");

module.exports = function transactionRoutes(pool) {
    const router = Router();

    // GET /api/transactions
    router.get("/", asyncHandler("GET /transactions", async (req, res) => {
        const { rows } = await pool.query(
            `SELECT id, date, time, title, category, amount, source, dana_dipakai,
                    type, installment_total_loan, created_at
             FROM transactions
             WHERE user_id = $1
             ORDER BY date DESC, time DESC NULLS LAST, created_at DESC`,
            [req.userId]
        );

        res.json(rows.map(mapFromDB));
    }));

    // POST /api/transactions
    router.post("/", asyncHandler("POST /transactions", async (req, res) => {
        const t = req.body;

        // dana_dipakai is NOT NULL, and income has no funding source to name,
        // so the form sends "". Coercing that to null rejected every income
        // transaction at the database; the empty string is the honest value
        // and the column accepts it.

        // Content-level duplicate check, distinct from the id-level upsert
        // below: a second row with a different id but the same date, title
        // and amount is almost always the same purchase entered twice (or
        // the same bank email imported twice). Source is deliberately not
        // compared -- one purchase can arrive under two source labels (Blu
        // vs BCA) and that is the double entry to catch. Refuse with 409 and
        // hand back the existing row so the client can show it. Identical
        // purchases do happen (two Grab rides in a day), so the client may
        // resend with allowDuplicate: true to save regardless. Same rule as
        // findDuplicateTransaction in src/utils/transactions.js.
        if (t.allowDuplicate !== true) {
            const { rows: existing } = await pool.query(
                `SELECT id, date, time, title, category, amount, source, dana_dipakai,
                        type, installment_total_loan, created_at
                 FROM transactions
                 WHERE user_id = $1
                   AND id <> $2
                   AND date = $3
                   AND lower(btrim(title)) = lower(btrim($4))
                   AND amount = $5
                 LIMIT 1`,
                [req.userId, t.id, t.date, t.title, Number(t.amount)]
            );

            if (existing.length > 0) {
                return res.status(409).json({
                    success: false,
                    code: "DUPLICATE_TRANSACTION",
                    error: "Transaksi dengan tanggal, judul, dan nominal yang sama sudah ada.",
                    duplicateOf: mapFromDB(existing[0]),
                });
            }
        }

        // ON CONFLICT DO UPDATE makes this safe to retry with the same id --
        // the client's offline queue (useTransactions.js retryPendingSync)
        // resends the exact same create request if a LATER step (balance
        // sync) fails, and a plain INSERT would throw a duplicate-key error
        // on that retry, permanently stranding the transaction: the row
        // already exists but its balance effect never gets applied because
        // the retry never gets past this insert to reach the balance step.
        const { rows } = await pool.query(
            `INSERT INTO transactions (id, date, time, title, category, amount, source, dana_dipakai, type, installment_total_loan, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO UPDATE SET
                 date = EXCLUDED.date,
                 time = EXCLUDED.time,
                 title = EXCLUDED.title,
                 category = EXCLUDED.category,
                 amount = EXCLUDED.amount,
                 source = EXCLUDED.source,
                 dana_dipakai = EXCLUDED.dana_dipakai,
                 type = EXCLUDED.type,
                 installment_total_loan = EXCLUDED.installment_total_loan
             RETURNING *`,
            [t.id, t.date, t.time || null, t.title, t.category, Number(t.amount), t.source, t.danaDipakai || "", t.type, t.installmentTotalLoan ?? null, req.userId]
        );

        mirrorToGoogleSheet({
            action: "add",
            id: t.id,
            date: t.date,
            notes: t.title,
            category: t.category,
            nominal: String(t.amount),
            ambil: t.danaDipakai,
            sof: t.source,
        });

        res.status(201).json({ success: true, data: mapFromDB(rows[0]) });
    }));

    // PUT /api/transactions/:id
    router.put("/:id", asyncHandler("PUT /transactions", async (req, res) => {
        const t = { ...req.body, id: req.params.id };
        console.log("🔄 UPDATE transaction:", { id: t.id, title: t.title, installmentTotalLoan: t.installmentTotalLoan });
        const { rows } = await pool.query(
            `UPDATE transactions
             SET date = $2, time = $3, title = $4, category = $5, amount = $6,
                 source = $7, dana_dipakai = $8, type = $9, installment_total_loan = $10
             WHERE id = $1 AND user_id = $11
             RETURNING *`,
            [t.id, t.date, t.time || null, t.title, t.category, Number(t.amount), t.source, t.danaDipakai || "", t.type, t.installmentTotalLoan ?? null, req.userId]
        );
        console.log("✅ UPDATE success:", rows[0]?.id);

        mirrorToGoogleSheet({
            action: "update",
            id: t.id,
            date: t.date,
            notes: t.title,
            category: t.category,
            nominal: String(t.amount),
            ambil: t.danaDipakai,
            sof: t.source,
        });

        res.json({ success: true, data: mapFromDB(rows[0]) });
    }));

    // DELETE /api/transactions/:id
    router.delete("/:id", asyncHandler("DELETE /transactions", async (req, res) => {
        // Hard delete. rowCount must be checked: a DELETE whose WHERE matches
        // nothing is not an error to Postgres, so without this the route
        // reported success while the row was still there (wrong user, or a
        // row the offline queue had not sent yet). 404 lets the client tell
        // "already gone" apart from "the delete failed".
        const { rowCount } = await pool.query(
            "DELETE FROM transactions WHERE id = $1 AND user_id = $2",
            [req.params.id, req.userId]
        );

        if (rowCount === 0) {
            return res.status(404).json({
                success: false,
                code: "NOT_FOUND",
                error: "Transaksi tidak ditemukan di database.",
            });
        }

        mirrorToGoogleSheet({ action: "delete", id: req.params.id });

        res.json({ success: true, deleted: rowCount });
    }));

    return router;
};

// --- Mapper ---
function mapFromDB(row) {
    return {
        id: row.id,
        date: row.date,
        time: row.time || "",
        title: row.title,
        category: row.category,
        amount: Number(row.amount),
        source: row.source,
        danaDipakai: row.dana_dipakai || "",
        type: row.type === "income" ? "income" : "expense",
        installmentTotalLoan: row.installment_total_loan != null ? Number(row.installment_total_loan) : null,
        createdAt: row.created_at,
    };
}
