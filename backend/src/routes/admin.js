import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/roles.js";

const router = Router();

const REFERRAL_ATTRIBUTION_STATUSES = new Set([
  "registered",
  "paid",
  "cancelled",
  "lead_created",
  "deal_created"
]);

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

router.get("/referral-attributions", requireAuth, requireRole(["admin"]), async (req, res) => {
  const { status } = req.query || {};
  const values = [];
  let where = "";

  if (status) {
    const normalizedStatus = String(status).trim();
    if (!REFERRAL_ATTRIBUTION_STATUSES.has(normalizedStatus)) {
      return res.status(400).json({ error: "invalid_request" });
    }
    if (normalizedStatus === "registered") {
      where = "WHERE ra.status = 'registered' AND ra.paid_at IS NULL";
    } else if (normalizedStatus === "paid") {
      where = "WHERE ra.status = 'paid' OR ra.paid_at IS NOT NULL";
    } else {
      values.push(normalizedStatus);
      where = `WHERE ra.status = $1`;
    }
  }

  const { rows } = await pool.query(
    `SELECT ra.id, ra.client_contact,
            CASE WHEN ra.paid_at IS NOT NULL THEN 'paid' ELSE ra.status::text END AS status,
            ra.amount_paid, ra.paid_at, ra.created_at,
            rc.code, rc.bonus_referrer,
            u.id AS referrer_user_id, u.full_name AS referrer_full_name,
            u.email AS referrer_email, u.phone AS referrer_phone
     FROM referral_attributions ra
     JOIN referral_codes rc ON rc.id = ra.referral_code_id
     JOIN users u ON u.id = rc.user_id
     ${where}
     ORDER BY ra.created_at DESC
     LIMIT 200`,
    values
  );

  return res.json({ items: rows });
});

router.post("/referral-attributions/:id/confirm-purchase", requireAuth, requireRole(["admin"]), async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: attributionRows } = await client.query(
      `SELECT ra.id, ra.status, ra.paid_at, ra.client_contact,
              rc.code, rc.bonus_referrer, rc.user_id AS referrer_user_id,
              a.id AS referrer_account_id
       FROM referral_attributions ra
       JOIN referral_codes rc ON rc.id = ra.referral_code_id
       JOIN loyalty_accounts a ON a.user_id = rc.user_id
       WHERE ra.id = $1
       FOR UPDATE OF ra`,
      [id]
    );

    if (!attributionRows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "not_found" });
    }

    const attribution = attributionRows[0];
    if (attribution.status !== "registered" || attribution.paid_at) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "referral_already_confirmed" });
    }

    const bonusReferrer = Math.max(0, Number(attribution.bonus_referrer || 0));
    let transactionId = null;

    if (bonusReferrer > 0) {
      const { rows: txRows } = await client.query(
        `INSERT INTO loyalty_transactions (account_id, type, amount, status, reason, external_ref, currency, confirmed_at, meta)
         VALUES ($1, 'accrual', $2, 'confirmed', 'promo_referral_purchase', $3, 'BONUS', now(), $4)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          attribution.referrer_account_id,
          bonusReferrer,
          `referral:purchase:${id}`,
          {
            promo_code: attribution.code,
            referral_attribution_id: id,
            invited_contact: attribution.client_contact
          }
        ]
      );

      if (txRows.length) {
        transactionId = txRows[0].id;
        await client.query(
          `UPDATE loyalty_accounts
           SET balance = balance + $1, updated_at = now()
           WHERE id = $2`,
          [bonusReferrer, attribution.referrer_account_id]
        );
      }
    }

    await client.query(
      `UPDATE referral_attributions
       SET status = 'paid', amount_paid = $1, paid_at = now(), updated_at = now()
       WHERE id = $2`,
      [bonusReferrer, id]
    );

    await client.query(
      `INSERT INTO audit_log (actor_user_id, action, entity, entity_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        req.user.id,
        "referral_purchase_confirmed",
        "referral_attributions",
        id,
        {
          bonus_referrer: bonusReferrer,
          transaction_id: transactionId,
          referrer_user_id: attribution.referrer_user_id
        }
      ]
    );

    await client.query("COMMIT");
    return res.json({ ok: true, transaction_id: transactionId, amount: bonusReferrer });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
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
