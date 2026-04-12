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

router.get("/referral-codes", requireAuth, requireRole(["admin"]), async (req, res) => {
  const { q } = req.query || {};
  const values = [];
  let where = "";
  if (q) {
    values.push(`%${q}%`);
    where = `WHERE rc.code ILIKE $1 OR u.email ILIKE $1 OR COALESCE(u.full_name, '') ILIKE $1`;
  }

  const { rows } = await pool.query(
    `SELECT rc.id, rc.user_id, rc.code, rc.status, rc.created_at,
            rc.bonus_new_user, rc.bonus_referrer, rc.max_uses, rc.uses_count,
            u.full_name, u.email, u.phone
     FROM referral_codes rc
     JOIN users u ON u.id = rc.user_id
     ${where}
     ORDER BY rc.created_at DESC
     LIMIT 200`,
    values
  );
  return res.json({ items: rows });
});

router.patch("/referral-codes/:id", requireAuth, requireRole(["admin"]), async (req, res) => {
  const { id } = req.params;
  const { code, status, bonus_new_user, bonus_referrer, max_uses } = req.body || {};
  const nextCode = code == null ? undefined : String(code).trim().toUpperCase();
  const nextStatus = status == null ? undefined : String(status).trim().toLowerCase();
  const nextBonusNewUser = bonus_new_user == null ? undefined : Number(bonus_new_user);
  const nextBonusReferrer = bonus_referrer == null ? undefined : Number(bonus_referrer);
  const nextMaxUses = max_uses == null || max_uses === "" ? null : Number(max_uses);

  if (nextCode !== undefined && !nextCode) {
    return res.status(400).json({ error: "invalid_request" });
  }
  if (nextStatus !== undefined && !["active", "blocked", "archived"].includes(nextStatus)) {
    return res.status(400).json({ error: "invalid_request" });
  }
  if (nextBonusNewUser !== undefined && (!Number.isFinite(nextBonusNewUser) || nextBonusNewUser < 0)) {
    return res.status(400).json({ error: "invalid_request" });
  }
  if (nextBonusReferrer !== undefined && (!Number.isFinite(nextBonusReferrer) || nextBonusReferrer < 0)) {
    return res.status(400).json({ error: "invalid_request" });
  }
  if (nextMaxUses !== null && nextMaxUses !== undefined && (!Number.isInteger(nextMaxUses) || nextMaxUses < 1)) {
    return res.status(400).json({ error: "invalid_request" });
  }
  if (
    nextCode === undefined &&
    nextStatus === undefined &&
    nextBonusNewUser === undefined &&
    nextBonusReferrer === undefined &&
    nextMaxUses === undefined
  ) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const fields = [];
  const values = [];
  let idx = 1;

  if (nextCode !== undefined) {
    fields.push(`code = $${idx++}`);
    values.push(nextCode);
  }
  if (nextStatus !== undefined) {
    fields.push(`status = $${idx++}`);
    values.push(nextStatus);
  }
  if (nextBonusNewUser !== undefined) {
    fields.push(`bonus_new_user = $${idx++}`);
    values.push(nextBonusNewUser);
  }
  if (nextBonusReferrer !== undefined) {
    fields.push(`bonus_referrer = $${idx++}`);
    values.push(nextBonusReferrer);
  }
  if (nextMaxUses !== undefined) {
    fields.push(`max_uses = $${idx++}`);
    values.push(nextMaxUses);
  }
  values.push(id);

  try {
    const { rows } = await pool.query(
      `UPDATE referral_codes
       SET ${fields.join(", ")}
       WHERE id = $${idx}
       RETURNING id, user_id, code, status, bonus_new_user, bonus_referrer, max_uses, uses_count, created_at`,
      values
    );
    if (!rows.length) {
      return res.status(404).json({ error: "not_found" });
    }
    return res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "code_exists" });
    }
    throw err;
  }
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
