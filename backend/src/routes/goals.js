const { Router } = require("express");

module.exports = function goalRoutes(pool) {
    const router = Router();

    // GET /api/goals
    router.get("/", async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT id, name, icon, color, required, collected, deadline, note, created_at
                 FROM goals ORDER BY created_at ASC`
            );
            res.json(rows.map(mapFromDB));
        } catch (err) {
            console.error("GET /goals error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/goals
    router.post("/", async (req, res) => {
        try {
            const g = req.body;
            await pool.query(
                `INSERT INTO goals (id, name, icon, color, required, collected, deadline, note, user_id, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
                [g.id, g.title, g.icon || null, g.color || null, Number(g.targetAmount) || 0, Number(g.savedAmount) || 0, g.deadline || null, g.note || null, req.userId]
            );

            res.status(201).json({ success: true });
        } catch (err) {
            console.error("POST /goals error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/goals/:id
    router.put("/:id", async (req, res) => {
        try {
            const g = { ...req.body, id: req.params.id };
            await pool.query(
                `UPDATE goals
                 SET name = $2, icon = $3, color = $4, required = $5, collected = $6,
                     deadline = $7, note = $8, updated_at = NOW()
                 WHERE id = $1`,
                [g.id, g.title, g.icon || null, g.color || null, Number(g.targetAmount) || 0, Number(g.savedAmount) || 0, g.deadline || null, g.note || null]
            );

            res.json({ success: true });
        } catch (err) {
            console.error("PUT /goals error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/goals/:id
    router.delete("/:id", async (req, res) => {
        try {
            await pool.query("DELETE FROM goals WHERE id = $1", [req.params.id]);
            res.json({ success: true });
        } catch (err) {
            console.error("DELETE /goals error:", err);
            res.status(500).json({ error: err.message });
        }
    });

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
