import { Router } from "express";
import pool from "../db.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, full_name, phone, email, role, status, last_login_at
     FROM users
     WHERE id = $1`,
    [req.user.id]
  );
  if (!rows.length) {
    return res.status(404).json({ error: "not_found" });
  }
  return res.json(rows[0]);
});

router.patch("/", requireAuth, async (req, res) => {
  const { full_name } = req.body || {};
  if (!full_name) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const { rows } = await pool.query(
    `UPDATE users
     SET full_name = $1, updated_at = now()
     WHERE id = $2
     RETURNING id, full_name, phone, email, role, status, last_login_at`,
    [full_name, req.user.id]
  );
  return res.json(rows[0]);
});

router.post("/complete-profile", requireAuth, async (req, res) => {
  const { full_name } = req.body || {};
  if (!full_name) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const { rows } = await pool.query(
    `UPDATE users
     SET full_name = $1, updated_at = now()
     WHERE id = $2
     RETURNING id, full_name, phone, email, role, status, last_login_at`,
    [full_name, req.user.id]
  );
  return res.json(rows[0]);
});

export default router;
