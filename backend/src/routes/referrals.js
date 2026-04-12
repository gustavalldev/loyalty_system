import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/code", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT code, status
     FROM referral_codes
     WHERE user_id = $1
     LIMIT 1`,
    [req.user.id]
  );
  if (!rows.length) {
    return res.status(404).json({ error: "not_found" });
  }
  return res.json(rows[0]);
});

router.get("/attributions", requireAuth, async (req, res) => {
  const { period, status } = req.query || {};
  const conditions = ["rc.user_id = $1"];
  const values = [req.user.id];
  let idx = 2;

  if (status) {
    conditions.push(`ra.status = $${idx++}`);
    values.push(status);
  }
  if (period) {
    const [from, to] = String(period).split(":");
    if (from) {
      conditions.push(`ra.created_at >= $${idx++}`);
      values.push(from);
    }
    if (to) {
      conditions.push(`ra.created_at <= $${idx++}`);
      values.push(to);
    }
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const { rows } = await pool.query(
    `SELECT ra.crm_deal_id, ra.client_contact, ra.status, ra.amount_paid, ra.paid_at, ra.created_at
     FROM referral_attributions ra
     JOIN referral_codes rc ON rc.id = ra.referral_code_id
     ${whereClause}
     ORDER BY ra.created_at DESC
     LIMIT 200`,
    values
  );

  return res.json({ items: rows });
});

export default router;
