import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

router.get("/users", requireAuth, requireRole(["admin"]), async (req, res) => {
  const { q } = req.query || {};
  const values = [];
  let where = "";
  if (q) {
    values.push(`%${q}%`);
    where = `WHERE u.email ILIKE $1`;
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.role, u.status,
            a.balance, a.currency
     FROM users u
     LEFT JOIN loyalty_accounts a ON a.user_id = u.id
     ${where}
     ORDER BY u.created_at DESC
     LIMIT 200`,
    values
  );
  return res.json({ items: rows });
});

router.post("/loyalty/adjustments", requireAuth, requireRole(["admin"]), async (req, res) => {
  const { user_id, amount, reason } = req.body || {};
  const adjAmount = Number(amount);
  if (!user_id || !Number.isFinite(adjAmount) || !reason) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: accRows } = await client.query(
      `SELECT id FROM loyalty_accounts WHERE user_id = $1 LIMIT 1`,
      [user_id]
    );
    if (!accRows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "not_found" });
    }
    const accountId = accRows[0].id;

    const { rows: txRows } = await client.query(
      `INSERT INTO loyalty_transactions (account_id, type, amount, status, reason, external_ref, currency, confirmed_at)
       VALUES ($1, 'adjustment', $2, 'confirmed', $3, $4, 'BONUS', now())
       RETURNING id`,
      [accountId, adjAmount, reason, `admin:adjustment:${accountId}:${Date.now()}`]
    );

    await client.query(
      `UPDATE loyalty_accounts
       SET balance = balance + $1, updated_at = now()
       WHERE id = $2`,
      [adjAmount, accountId]
    );

    await client.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id,
        "loyalty_adjustment",
        "loyalty_accounts",
        accountId,
        { amount: adjAmount, reason }
      ]
    );

    await client.query("COMMIT");
    return res.status(201).json({ id: txRows[0].id });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

export default router;
