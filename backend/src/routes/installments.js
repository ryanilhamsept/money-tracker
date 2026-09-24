const { Router } = require("express");
const { asyncHandler } = require("../middleware/asyncHandler");
const { buildSetClause } = require("../utils/db");

module.exports = function installmentRoutes(pool) {
    const router = Router();

    // GET /api/installments
    router.get("/", asyncHandler("GET /installments", async (req, res) => {
        const { rows } = await pool.query(
            `SELECT id, account_id, transaction_id, name, provider,
                    total_loan, remaining_balance, monthly_installment,
                    remaining_term, due_date, created_at
             FROM installments WHERE user_id = $1 ORDER BY created_at DESC`,
            [req.userId]
        );
        res.json(rows.map(mapFromDB));
    }));

    // POST /api/installments
    router.post("/", asyncHandler("POST /installments", async (req, res) => {
        const i = req.body;

        // One purchase gets one installment plan. Nothing stopped a second
        // POST for the same purchase, so a double submit wrote two identical
        // rows a second apart -- the card then showed whichever came first
        // while the other sat there as invisible clutter. transaction_id is
        // the natural key here, so a repeat is answered with the row that
        // already exists instead of creating another.
        if (i.transactionId) {
            const { rows: existing } = await pool.query(
                `SELECT id FROM installments WHERE user_id = $1 AND transaction_id = $2 LIMIT 1`,
                [req.userId, i.transactionId]
            );

            if (existing.length > 0) {
                return res.status(200).json({ success: true, id: existing[0].id, alreadyExists: true });
            }
        }

        // Retrying with the same generated id must not fail either: the client
        // resends on network errors, and a plain INSERT would 500 on that.
        await pool.query(
            `INSERT INTO installments (id, account_id, transaction_id, name, provider,
                    total_loan, remaining_balance, monthly_installment, remaining_term, due_date, user_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             ON CONFLICT (id) DO NOTHING`,
            [i.id, i.accountId, i.transactionId || null, i.name, i.provider || null,
             Number(i.totalLoan) || 0, Number(i.remainingBalance) || 0, Number(i.monthlyInstallment) || 0,
             i.remainingTerm ?? null, i.dueDate ?? null, req.userId]
        );

        res.status(201).json({ success: true });
    }));

    // PUT /api/installments/:id
    router.put("/:id", asyncHandler("PUT /installments", async (req, res) => {
        const id = req.params.id;
        const fields = req.body;

        const fieldMap = {
            remainingBalance: "remaining_balance",
            remainingTerm: "remaining_term",
            dueDate: "due_date",
        };

        const { setClauses, values: fieldValues, nextParamIndex } = buildSetClause(fieldMap, fields);

        if (setClauses.length === 0) {
            return res.status(400).json({ error: "No valid fields to update" });
        }

        const values = [id, ...fieldValues, req.userId];
        await pool.query(
            `UPDATE installments SET ${setClauses.join(", ")} WHERE id = $1 AND user_id = $${nextParamIndex}`,
            values
        );

        res.json({ success: true });
    }));

    // DELETE /api/installments/:id
    router.delete("/:id", asyncHandler("DELETE /installments", async (req, res) => {
        await pool.query("DELETE FROM installments WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
        res.json({ success: true });
    }));

    return router;
};

function mapFromDB(row) {
    return {
        id: row.id,
        accountId: row.account_id,
        transactionId: row.transaction_id,
        name: row.name,
        provider: row.provider || "",
        totalLoan: Number(row.total_loan) || 0,
        remainingBalance: Number(row.remaining_balance) || 0,
        monthlyInstallment: Number(row.monthly_installment) || 0,
        remainingTerm: row.remaining_term != null ? Number(row.remaining_term) : null,
        dueDate: row.due_date != null ? Number(row.due_date) : null,
        createdAt: row.created_at,
    };
}
