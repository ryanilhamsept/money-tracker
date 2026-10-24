const { Router } = require("express");
const { asyncHandler } = require("../middleware/asyncHandler");

module.exports = function categoryBudgetRoutes(pool) {
    const router = Router();

    // GET /api/category-budgets
    router.get("/", asyncHandler("GET /category-budgets", async (req, res) => {
        const { rows } = await pool.query(
            `SELECT id, category, amount, updated_at
             FROM category_budgets WHERE user_id = $1
             ORDER BY lower(btrim(category))`,
            [req.userId]
        );
        res.json(rows.map(mapFromDB));
    }));

    // PUT /api/category-budgets
    // Satu panggilan menyimpan seluruh daftar: layar anggaran diedit sebagai
    // satu kesatuan, dan mengirimnya per kategori membuat layar bisa separuh
    // tersimpan kalau koneksi putus di tengah.
    router.put("/", asyncHandler("PUT /category-budgets", async (req, res) => {
        const items = Array.isArray(req.body?.budgets) ? req.body.budgets : [];

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            for (const item of items) {
                const category = String(item.category || "").trim();
                if (!category) continue;

                const amount = Number(item.amount) || 0;

                // Nominal nol berarti kategori itu tidak dianggarkan -- simpan
                // sebagai ketiadaan baris, bukan baris bernilai nol, supaya
                // "belum diatur" dan "dianggarkan nol" tidak tertukar.
                if (amount <= 0) {
                    await client.query(
                        `DELETE FROM category_budgets
                         WHERE user_id = $1 AND lower(btrim(category)) = lower(btrim($2))`,
                        [req.userId, category]
                    );
                    continue;
                }

                await client.query(
                    `INSERT INTO category_budgets (id, user_id, category, amount)
                     VALUES ($1, $2, $3, $4)
                     ON CONFLICT (user_id, lower(btrim(category)))
                     DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()`,
                    [`cbg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                     req.userId, category, amount]
                );
            }

            await client.query("COMMIT");
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }

        const { rows } = await pool.query(
            `SELECT id, category, amount, updated_at
             FROM category_budgets WHERE user_id = $1
             ORDER BY lower(btrim(category))`,
            [req.userId]
        );
        res.json({ success: true, data: rows.map(mapFromDB) });
    }));

    return router;
};

function mapFromDB(row) {
    return {
        id: row.id,
        category: row.category,
        amount: Number(row.amount),
        updatedAt: row.updated_at,
    };
}
