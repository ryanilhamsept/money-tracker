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
                 ORDER BY date DESC, time DESC NULLS LAST, created_at DESC`
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
            const { rows } = await pool.query(
                `INSERT INTO transactions (id, date, time, title, category, amount, source, dana_dipakai, type, installment_total_loan)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [t.id, t.date, t.time || null, t.title, t.category, Number(t.amount), t.source, t.danaDipakai || null, t.type, t.installmentTotalLoan ?? null]
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
            const { rows } = await pool.query(
                `UPDATE transactions
                 SET date = $2, time = $3, title = $4, category = $5, amount = $6,
                     source = $7, dana_dipakai = $8, type = $9, installment_total_loan = $10
                 WHERE id = $1
                 RETURNING *`,
                [t.id, t.date, t.time || null, t.title, t.category, Number(t.amount), t.source, t.danaDipakai || null, t.type, t.installmentTotalLoan ?? null]
            );

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
            console.error("PUT /transactions error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/transactions/:id
    router.delete("/:id", async (req, res) => {
        try {
            await pool.query("DELETE FROM transactions WHERE id = $1", [req.params.id]);

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
