import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/account", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT balance, currency, status
     FROM loyalty_accounts
     WHERE user_id = $1`,
    [req.user.id]
  );
  if (!rows.length) {
    return res.status(404).json({ error: "not_found" });
  }
  return res.json(rows[0]);
});

router.get("/transactions", requireAuth, async (req, res) => {
  const { rows: accountRows } = await pool.query(
    `SELECT id FROM loyalty_accounts WHERE user_id = $1`,
    [req.user.id]
  );
  if (!accountRows.length) {
    return res.status(404).json({ error: "not_found" });
  }
  const accountId = accountRows[0].id;
  const { period, type, status } = req.query || {};
  const conditions = ["account_id = $1"];
  const values = [accountId];
  let idx = 2;

  if (type) {
    conditions.push(`type = $${idx++}`);
    values.push(type);
  }
  if (status) {
    conditions.push(`status = $${idx++}`);
    values.push(status);
  }
  if (period) {
    const [from, to] = String(period).split(":");
    if (from) {
      conditions.push(`created_at >= $${idx++}`);
      values.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${idx++}`);
      values.push(to);
    }
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const { rows } = await pool.query(
    `SELECT amount, type, status, reason, external_ref, created_at
     FROM loyalty_transactions
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT 100`,
    values
  );
  return res.json({ items: rows });
});

export default router;
