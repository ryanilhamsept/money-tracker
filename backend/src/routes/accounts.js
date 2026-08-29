const { Router } = require("express");
const { mirrorToGoogleSheet } = require("../services/googleSheets");

module.exports = function accountRoutes(pool) {
    const router = Router();

    // GET /api/accounts
    router.get("/", async (req, res) => {
        try {
            const { rows } = await pool.query(
                `SELECT id, name, type, starting_balance, issuer, product_name,
                        shares_limit, total_limit, due_date, color
                 FROM accounts WHERE user_id = $1 ORDER BY name ASC`,
                [req.userId]
            );
            res.json(rows.map(mapFromDB));
        } catch (err) {
            console.error("GET /accounts error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/accounts
    router.post("/", async (req, res) => {
        try {
            const a = req.body;
            const { rows } = await pool.query(
                `INSERT INTO accounts (id, name, type, starting_balance, issuer, product_name, shares_limit, total_limit, due_date, color, user_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                 RETURNING *`,
                [a.id, a.name, a.type, Number(a.startingBalance), a.issuer || null, a.productName || null, Boolean(a.sharesLimit), a.totalLimit ?? null, a.dueDate ?? null, a.color || null, req.userId]
            );

            mirrorToGoogleSheet({
                action: "addAccount",
                id: a.id,
                name: a.name,
                type: a.type,
                startingBalance: String(a.startingBalance),
            });

            res.status(201).json({ success: true, data: mapFromDB(rows[0]) });
        } catch (err) {
            console.error("POST /accounts error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // PUT /api/accounts/:id
    router.put("/:id", async (req, res) => {
        try {
            const id = req.params.id;
            const fields = req.body;

            // Map camelCase → snake_case
            const fieldMap = {
                startingBalance: "starting_balance",
                totalLimit: "total_limit",
                dueDate: "due_date",
                issuer: "issuer",
                productName: "product_name",
                sharesLimit: "shares_limit",
                color: "color",
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

            values.push(req.userId);
            const { rows } = await pool.query(
                `UPDATE accounts SET ${setClauses.join(", ")} WHERE id = $1 AND user_id = $${paramIndex} RETURNING *`,
                values
            );

            mirrorToGoogleSheet({ action: "updateAccountFields", id, ...fields });

            res.json({ success: true, data: mapFromDB(rows[0]) });
        } catch (err) {
            console.error("PUT /accounts error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // DELETE /api/accounts/:id
    router.delete("/:id", async (req, res) => {
        try {
            await pool.query("DELETE FROM accounts WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);

            mirrorToGoogleSheet({ action: "deleteAccount", id: req.params.id });

            res.json({ success: true });
        } catch (err) {
            console.error("DELETE /accounts error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/accounts/:id/pay-cc - Reset CC balance after payment
    router.post("/:id/pay-cc", async (req, res) => {
        try {
            const accountId = req.params.id;
            const { amount, date } = req.body;

            if (!amount || amount <= 0) {
                return res.status(400).json({ error: "Amount must be greater than 0" });
            }
            if (!date) {
                return res.status(400).json({ error: "Date is required" });
            }

            const { rows: accountRows } = await pool.query(
                "SELECT id, name FROM accounts WHERE id = $1 AND user_id = $2",
                [accountId, req.userId]
            );
            if (accountRows.length === 0) {
                return res.status(404).json({ error: "Account not found" });
            }
            const account = accountRows[0];

            // Atomic decrement (clamped at 0) in a single statement -- avoids the
            // read-then-write race that let concurrent writers (Gmail auto-import,
            // another device) clobber each other's balance updates.
            await pool.query("SELECT pay_cc_balance($1, $2)", [accountId, amount]);
            const { rows: updatedRows } = await pool.query(
                "SELECT * FROM accounts WHERE id = $1",
                [accountId]
            );
            const newBalance = Number(updatedRows[0].starting_balance);

            // Log transaction for audit trail
            const txId = require("crypto").randomUUID();
            await pool.query(
                `INSERT INTO transactions (id, date, title, category, amount, source, dana_dipakai, type, user_id)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [txId, date, "CC Payment", "Pembayaran CC", amount, account.name, "Spend CC", "cc_payment", req.userId]
            );

            mirrorToGoogleSheet({
                action: "updateAccountFields",
                id: accountId,
                startingBalance: String(newBalance),
            });

            res.json({ success: true, data: mapFromDB(updatedRows[0]) });
        } catch (err) {
            console.error("POST /accounts/:id/pay-cc error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    // POST /api/accounts/:id/adjust-balance - Atomically increment starting_balance
    // by a delta (used when a transaction is added/edited/deleted). Doing the add
    // in the database instead of computing the new value client-side avoids lost
    // updates when another writer (Gmail auto-import, another device) changes the
    // same account concurrently.
    router.post("/:id/adjust-balance", async (req, res) => {
        try {
            const accountId = req.params.id;
            const { delta } = req.body;

            if (typeof delta !== "number" || !Number.isFinite(delta)) {
                return res.status(400).json({ error: "delta must be a finite number" });
            }

            const { rows: ownedRows } = await pool.query(
                "SELECT id FROM accounts WHERE id = $1 AND user_id = $2",
                [accountId, req.userId]
            );
            if (ownedRows.length === 0) {
                return res.status(404).json({ error: "Account not found" });
            }

            await pool.query("SELECT increment_account_balance($1, $2)", [accountId, delta]);
            const { rows } = await pool.query(
                "SELECT * FROM accounts WHERE id = $1",
                [accountId]
            );

            mirrorToGoogleSheet({
                action: "updateAccountFields",
                id: accountId,
                startingBalance: String(rows[0].starting_balance),
            });

            res.json({ success: true, data: mapFromDB(rows[0]) });
        } catch (err) {
            console.error("POST /accounts/:id/adjust-balance error:", err);
            res.status(500).json({ error: err.message });
        }
    });

    return router;
};

function mapFromDB(row) {
    return {
        id: row.id,
        name: row.name,
        type: row.type,
        startingBalance: Number(row.starting_balance),
        issuer: row.issuer || "",
        productName: row.product_name || "",
        sharesLimit: Boolean(row.shares_limit),
        totalLimit: row.total_limit != null ? Number(row.total_limit) : null,
        dueDate: row.due_date != null ? Number(row.due_date) : null,
        color: row.color || "",
    };
}
