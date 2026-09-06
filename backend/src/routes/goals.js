const { Router } = require("express");
const { asyncHandler } = require("../middleware/asyncHandler");

module.exports = function goalRoutes(pool) {
    const router = Router();

    // GET /api/goals
    router.get("/", asyncHandler("GET /goals", async (req, res) => {
        const { rows } = await pool.query(
            `SELECT id, name, icon, color, required, collected, deadline, note, created_at
             FROM goals WHERE user_id = $1 ORDER BY created_at ASC`,
            [req.userId]
        );
        res.json(rows.map(mapFromDB));
    }));

    // POST /api/goals
    router.post("/", asyncHandler("POST /goals", async (req, res) => {
        const g = req.body;
        await pool.query(
            `INSERT INTO goals (id, name, icon, color, required, collected, deadline, note, user_id, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
            [g.id, g.title, g.icon || null, g.color || null, Number(g.targetAmount) || 0, Number(g.savedAmount) || 0, g.deadline || null, g.note || null, req.userId]
        );

        res.status(201).json({ success: true });
    }));

    // PUT /api/goals/:id
    router.put("/:id", asyncHandler("PUT /goals", async (req, res) => {
        const g = { ...req.body, id: req.params.id };
        await pool.query(
            `UPDATE goals
             SET name = $2, icon = $3, color = $4, required = $5, collected = $6,
                 deadline = $7, note = $8, updated_at = NOW()
             WHERE id = $1 AND user_id = $9`,
            [g.id, g.title, g.icon || null, g.color || null, Number(g.targetAmount) || 0, Number(g.savedAmount) || 0, g.deadline || null, g.note || null, req.userId]
        );

        res.json({ success: true });
    }));

    // DELETE /api/goals/:id
    router.delete("/:id", asyncHandler("DELETE /goals", async (req, res) => {
        await pool.query("DELETE FROM goals WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
        res.json({ success: true });
    }));

    return router;
};

// DB uses name/required/collected; API uses title/targetAmount/savedAmount
function mapFromDB(row) {
    return {
        id: row.id,
        title: row.name,
        icon: row.icon || "🎯",
        color: row.color || "#8b5cf6",
        targetAmount: Number(row.required),
        savedAmount: Number(row.collected),
        deadline: row.deadline,
        note: row.note,
        createdAt: row.created_at,
    };
}
