const { Router } = require("express");
const { mirrorToGoogleSheet } = require("../services/googleSheets");

module.exports = function budgetRoutes(pool) {
    const router = Router();

    // GET /api/budgets
    router.get("/", async (req, res) => {
        try {
            const { rows } = await pool.query(
                "SELECT id, user_id, amount FROM budgets WHERE user_id = $1",
                [req.userId]
            );

            const budget = rows[0]?.amount ?? 0;
            res.json({ budget: Number(budget) });
        } catch (err) {
            console.error("GET /budgets error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/budgets
    router.put("/", async (req, res) => {
        try {
            const { amount } = req.body;
            const userId = req.userId;

            const { rows } = await pool.query(
                `INSERT INTO budgets (id, user_id, amount, updated_at)
                 VALUES ($1, $1, $2, NOW())
                 ON CONFLICT (id) DO UPDATE SET amount = $2, updated_at = NOW()
                 RETURNING id, user_id, amount`,
                [userId, Number(amount)]
            );

            mirrorToGoogleSheet({ action: "saveBudget", budget: Number(amount) });

            res.json(rows[0]);
        } catch (err) {
            console.error("PUT /budgets error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};
