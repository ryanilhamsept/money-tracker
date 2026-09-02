const { Router } = require("express");
const { mirrorToGoogleSheet } = require("../services/googleSheets");

module.exports = function transactionRoutes(pool) {
    const router = Router();

    // GET /api/transactions
    router.get("/", async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT id, date, time, title, category, amount, source, dana_dipakai,
                        type, installment_total_loan, created_at
                 FROM transactions
                 WHERE user_id = $1
                 ORDER BY date DESC, time DESC NULLS LAST, created_at DESC`,
                [req.userId]
            );

            res.json(rows.map(mapFromDB));
        } catch (err) {
            console.error("GET /transactions error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/transactions
    router.post("/", async (req, res) => {
        try {
            const t = req.body;
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
                [t.id, t.date, t.time || null, t.title, t.category, Number(t.amount), t.source, t.danaDipakai || null, t.type, t.installmentTotalLoan ?? null, req.userId]
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
        } catch (err) {
            console.error("POST /transactions error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/transactions/:id
    router.put("/:id", async (req, res) => {
        try {
            const t = { ...req.body, id: req.params.id };
            console.log("🔄 UPDATE transaction:", { id: t.id, title: t.title, installmentTotalLoan: t.installmentTotalLoan });
            const { rows } = await pool.query(
                `UPDATE transactions
                 SET date = $2, time = $3, title = $4, category = $5, amount = $6,
                     source = $7, dana_dipakai = $8, type = $9, installment_total_loan = $10
                 WHERE id = $1 AND user_id = $11
                 RETURNING *`,
                [t.id, t.date, t.time || null, t.title, t.category, Number(t.amount), t.source, t.danaDipakai || null, t.type, t.installmentTotalLoan ?? null, req.userId]
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
        } catch (err) {
            console.error("❌ PUT /transactions error:", err.message);
            console.error("Stack:", err.stack);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/transactions/:id
    router.delete("/:id", async (req, res) => {
        try {
            await pool.query("DELETE FROM transactions WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);

            mirrorToGoogleSheet({ action: "delete", id: req.params.id });

            res.json({ success: true });
        } catch (err) {
            console.error("DELETE /transactions error:", err);
            res.status(500).json({ error: err.message });
        }
    });

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
