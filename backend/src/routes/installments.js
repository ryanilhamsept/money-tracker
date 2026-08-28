const { Router } = require("express");

module.exports = function installmentRoutes(pool) {
    const router = Router();

    // GET /api/installments
    router.get("/", async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT id, account_id, transaction_id, name, provider,
                        total_loan, remaining_balance, monthly_installment,
                        remaining_term, due_date, created_at
                 FROM installments ORDER BY created_at DESC`
            );
            res.json(rows.map(mapFromDB));
        } catch (err) {
            console.error("GET /installments error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/installments
    router.post("/", async (req, res) => {
        try {
            const i = req.body;
            await pool.query(
                `INSERT INTO installments (id, account_id, transaction_id, name, provider,
                        total_loan, remaining_balance, monthly_installment, remaining_term, due_date)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [i.id, i.accountId, i.transactionId || null, i.name, i.provider || null,
                 Number(i.totalLoan) || 0, Number(i.remainingBalance) || 0, Number(i.monthlyInstallment) || 0,
                 i.remainingTerm ?? null, i.dueDate ?? null]
            );

            res.status(201).json({ success: true });
        } catch (err) {
            console.error("POST /installments error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/installments/:id
    router.put("/:id", async (req, res) => {
        try {
            const id = req.params.id;
            const fields = req.body;

            const fieldMap = {
                remainingBalance: "remaining_balance",
                remainingTerm: "remaining_term",
                dueDate: "due_date",
            };

            const setClauses = [];
            const values = [id];
            let paramIndex = 2;

            for (const [apiKey, val] of Object.entries(fields)) {
                const dbKey = fieldMap[apiKey];
                if (dbKey) {
                    setClauses.push(`${dbKey} = $${paramIndex}`);
                    values.push(val);
                    paramIndex++;
                }
            }

            if (setClauses.length === 0) {
                return res.status(400).json({ error: "No valid fields to update" });
            }

            await pool.query(
                `UPDATE installments SET ${setClauses.join(", ")} WHERE id = $1`,
                values
            );

            res.json({ success: true });
        } catch (err) {
            console.error("PUT /installments error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/installments/:id
    router.delete("/:id", async (req, res) => {
        try {
            await pool.query("DELETE FROM installments WHERE id = $1", [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            console.error("DELETE /installments error:", err);
            res.status(500).json({ error: err.message });
        }
    });

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
