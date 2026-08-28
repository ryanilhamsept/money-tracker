require("dotenv").config();
const { Pool, types } = require("pg");
types.setTypeParser(1082, (v) => v);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: dupes } = await client.query(
      "SELECT id, source, amount, dana_dipakai FROM transactions WHERE created_at >= '2026-08-28T04:00:00Z'"
    );
    console.log("Rows to delete:", dupes.length);

    const refundBySource = {};
    for (const row of dupes) {
      if (row.dana_dipakai === "Spend CC") continue;
      refundBySource[row.source] = (refundBySource[row.source] || 0) + Number(row.amount);
    }
    console.log("Balance refunds needed:", refundBySource);

    const ids = dupes.map((r) => r.id);
    await client.query("DELETE FROM transactions WHERE id = ANY($1)", [ids]);

    const { rows: accounts } = await client.query("SELECT id, name, starting_balance FROM accounts");
    for (const [source, refund] of Object.entries(refundBySource)) {
      const normSource = source.trim().toLowerCase();
      let account = accounts.find((a) => String(a.name || "").trim().toLowerCase() === normSource);
      if (!account && normSource === "blu") {
        account = accounts.find((a) => String(a.name || "").trim().toLowerCase().indexOf("blu") !== -1);
      }
      if (!account) {
        console.log("WARNING: no account found for source=" + source + ", refund " + refund + " NOT applied");
        continue;
      }
      const newBalance = Number(account.starting_balance) + refund;
      await client.query("UPDATE accounts SET starting_balance = $1 WHERE id = $2", [newBalance, account.id]);
      console.log("Refunded " + refund + " to " + account.name + " -> new balance " + newBalance);
    }

    await client.query("COMMIT");
    console.log("Done.");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("FAILED, rolled back:", e.message);
  } finally {
    client.release();
    pool.end();
  }
})();
