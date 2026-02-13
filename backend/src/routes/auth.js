import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { generateCode, generateOtpCode, hashOtp } from "../utils/crypto.js";
import { signAccessToken, signRefreshToken, verifyToken } from "../utils/jwt.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

async function requestOtp(req, res) {
  const { target, channel } = req.body || {};
  if (!target || !channel) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const ttlSeconds = Number(process.env.OTP_TTL_SECONDS || 300);
  const attempts = Number(process.env.OTP_ATTEMPTS || 3);
  const cooldownSeconds = Number(process.env.OTP_COOLDOWN_SECONDS || 60);

  const cooldownResult = await pool.query(
    `SELECT created_at
     FROM auth_codes
     WHERE target = $1 AND channel = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [target, channel]
  );

  if (cooldownResult.rows.length) {
    const lastCreated = new Date(cooldownResult.rows[0].created_at);
    const nextAllowed = new Date(lastCreated.getTime() + cooldownSeconds * 1000);
    if (Date.now() < nextAllowed.getTime()) {
      const retryAfter = Math.ceil((nextAllowed.getTime() - Date.now()) / 1000);
      return res.status(429).json({ error: "cooldown", retry_after: retryAfter });
    }
  }

  const code = generateOtpCode();
  const codeHash = hashOtp(code);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await pool.query(
    `INSERT INTO auth_codes (target, channel, code_hash, expires_at, attempts_left)
     VALUES ($1, $2, $3, $4, $5)`,
    [target, channel, codeHash, expiresAt, attempts]
  );

  const response = { ok: true, cooldown_seconds: cooldownSeconds };
  if (process.env.OTP_ECHO === "true") {
    response.dev_code = code;
  }
  if (process.env.OTP_LOG === "true") {
    console.log(`[OTP] target=${target} channel=${channel} code=${code}`);
  }
  return res.json(response);
}

router.post("/register", async (req, res) => {
  const { full_name, phone } = req.body || {};
  if (!full_name || !phone) {
    return res.status(400).json({ error: "invalid_request" });
  }
  return requestOtp(req, res);
});

router.post("/login", async (req, res) => {
  const { target, password, channel } = req.body || {};
  if (!target || !password) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const isEmail = target.includes("@");
  const field = isEmail ? "email" : "phone";
  const { rows } = await pool.query(
    `SELECT id, password_hash FROM users WHERE ${field} = $1 LIMIT 1`,
    [target]
  );
  if (!rows.length || !rows[0].password_hash) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  req.body = { target, channel: channel || "email" };
  return requestOtp(req, res);
});

router.post("/verify-otp", async (req, res) => {
  const { target, code, purpose, full_name, password, phone } = req.body || {};
  if (!target || !code) {
    return res.status(400).json({ error: "invalid_request" });
  }
  if (!purpose || !["register", "login"].includes(purpose)) {
    return res.status(400).json({ error: "purpose_required" });
  }
  const { rows } = await pool.query(
    `SELECT id, channel, code_hash, attempts_left, expires_at
     FROM auth_codes
     WHERE target = $1 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [target]
  );

  if (!rows.length) {
    return res.status(401).json({ error: "invalid_code" });
  }

  const record = rows[0];
  if (new Date(record.expires_at).getTime() < Date.now()) {
    return res.status(401).json({ error: "expired_code" });
  }
  if (record.attempts_left <= 0) {
    return res.status(401).json({ error: "attempts_exceeded" });
  }

  const incomingHash = hashOtp(code);
  if (incomingHash !== record.code_hash) {
    await pool.query(
      `UPDATE auth_codes
       SET attempts_left = attempts_left - 1
       WHERE id = $1`,
      [record.id]
    );
    return res.status(401).json({ error: "invalid_code" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let userId;
    let role = "client";
    let isNewUser = false;

    const isEmail = target.includes("@");
    const field = isEmail ? "email" : "phone";
    const userResult = await client.query(
      `SELECT id, role FROM users WHERE ${field} = $1 LIMIT 1`,
      [target]
    );

    if (purpose === "register") {
      if (userResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(409).json({ error: "user_exists" });
      }
      if (!full_name || !password || !phone) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "full_name_phone_password_required" });
      }
      if (phone) {
        const phoneExists = await client.query(
          `SELECT id FROM users WHERE phone = $1 LIMIT 1`,
          [phone]
        );
        if (phoneExists.rows.length) {
          await client.query("ROLLBACK");
          return res.status(409).json({ error: "phone_in_use" });
        }
      }
      isNewUser = true;
      const passwordHash = await bcrypt.hash(password, 10);
      const insert = await client.query(
        `INSERT INTO users (${field}, full_name, password_hash, phone)
         VALUES ($1, $2, $3, $4)
         RETURNING id, role`,
        [target, full_name, passwordHash, phone || null]
      );
      userId = insert.rows[0].id;
      role = insert.rows[0].role;
      await client.query(
        `INSERT INTO loyalty_accounts (user_id) VALUES ($1)`,
        [userId]
      );
    } else if (purpose === "login") {
      if (!userResult.rows.length) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "user_not_found" });
      }
      if (!password) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "password_required" });
      }
      const { rows: authRows } = await client.query(
        `SELECT password_hash FROM users WHERE id = $1`,
        [userResult.rows[0].id]
      );
      if (!authRows.length || !authRows[0].password_hash) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: "password_not_set" });
      }
      const ok = await bcrypt.compare(password, authRows[0].password_hash);
      if (!ok) {
        await client.query("ROLLBACK");
        return res.status(401).json({ error: "invalid_credentials" });
      }
      userId = userResult.rows[0].id;
      role = userResult.rows[0].role;
    }

    if (isNewUser) {
      let created = false;
      for (let i = 0; i < 5; i += 1) {
        const codeCandidate = generateCode(10);
        try {
          await client.query(
            `INSERT INTO referral_codes (user_id, code) VALUES ($1, $2)`,
            [userId, codeCandidate]
          );
          created = true;
          break;
        } catch (err) {
          if (err.code !== "23505") {
            throw err;
          }
        }
      }
      if (!created) {
        throw new Error("failed_to_generate_referral_code");
      }
    }

    await client.query(
      `UPDATE users SET last_login_at = now() WHERE id = $1`,
      [userId]
    );

    await client.query(
      `UPDATE auth_codes
       SET consumed_at = now(), user_id = $1
       WHERE id = $2`,
      [userId, record.id]
    );

    await client.query("COMMIT");

    const accessToken = signAccessToken({ sub: userId, role });
    const refreshToken = signRefreshToken({ sub: userId, role });

    return res.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      is_new_user: isNewUser
    });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.post("/request-password-reset", requestOtp);

router.post("/reset-password", async (req, res) => {
  const { target, code, new_password } = req.body || {};
  if (!target || !code || !new_password) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const { rows } = await pool.query(
    `SELECT id, code_hash, attempts_left, expires_at
     FROM auth_codes
     WHERE target = $1 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [target]
  );

  if (!rows.length) {
    return res.status(401).json({ error: "invalid_code" });
  }

  const record = rows[0];
  if (new Date(record.expires_at).getTime() < Date.now()) {
    return res.status(401).json({ error: "expired_code" });
  }
  if (record.attempts_left <= 0) {
    return res.status(401).json({ error: "attempts_exceeded" });
  }

  const incomingHash = hashOtp(code);
  if (incomingHash !== record.code_hash) {
    await pool.query(
      `UPDATE auth_codes SET attempts_left = attempts_left - 1 WHERE id = $1`,
      [record.id]
    );
    return res.status(401).json({ error: "invalid_code" });
  }

  const isEmail = target.includes("@");
  const field = isEmail ? "email" : "phone";
  const { rows: userRows } = await pool.query(
    `SELECT id FROM users WHERE ${field} = $1 LIMIT 1`,
    [target]
  );
  if (!userRows.length) {
    return res.status(404).json({ error: "user_not_found" });
  }

  const passwordHash = await bcrypt.hash(new_password, 10);
  await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
    [passwordHash, userRows[0].id]
  );

  await pool.query(
    `UPDATE auth_codes SET consumed_at = now(), user_id = $1 WHERE id = $2`,
    [userRows[0].id, record.id]
  );

  return res.json({ ok: true });
});

router.post("/change-password/request", requireAuth, async (req, res) => {
  const { current_password } = req.body || {};
  if (!current_password) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const { rows } = await pool.query(
    `SELECT email, password_hash FROM users WHERE id = $1 LIMIT 1`,
    [req.user.id]
  );
  if (!rows.length || !rows[0].email || !rows[0].password_hash) {
    return res.status(400).json({ error: "invalid_user" });
  }
  const ok = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!ok) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  req.body = { target: rows[0].email, channel: "email" };
  return requestOtp(req, res);
});

router.post("/change-password/confirm", requireAuth, async (req, res) => {
  const { code, new_password, current_password } = req.body || {};
  if (!code || !new_password || !current_password) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const { rows: userRows } = await pool.query(
    `SELECT email, password_hash FROM users WHERE id = $1 LIMIT 1`,
    [req.user.id]
  );
  if (!userRows.length || !userRows[0].email || !userRows[0].password_hash) {
    return res.status(400).json({ error: "invalid_user" });
  }
  const ok = await bcrypt.compare(current_password, userRows[0].password_hash);
  if (!ok) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  const target = userRows[0].email;

  const { rows } = await pool.query(
    `SELECT id, code_hash, attempts_left, expires_at
     FROM auth_codes
     WHERE target = $1 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [target]
  );
  if (!rows.length) {
    return res.status(401).json({ error: "invalid_code" });
  }
  const record = rows[0];
  if (new Date(record.expires_at).getTime() < Date.now()) {
    return res.status(401).json({ error: "expired_code" });
  }
  if (record.attempts_left <= 0) {
    return res.status(401).json({ error: "attempts_exceeded" });
  }
  const incomingHash = hashOtp(code);
  if (incomingHash !== record.code_hash) {
    await pool.query(
      `UPDATE auth_codes SET attempts_left = attempts_left - 1 WHERE id = $1`,
      [record.id]
    );
    return res.status(401).json({ error: "invalid_code" });
  }

  const passwordHash = await bcrypt.hash(new_password, 10);
  await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
    [passwordHash, req.user.id]
  );
  await pool.query(
    `UPDATE auth_codes SET consumed_at = now(), user_id = $1 WHERE id = $2`,
    [req.user.id, record.id]
  );

  return res.json({ ok: true });
});

router.post("/refresh", async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) {
    return res.status(400).json({ error: "invalid_request" });
  }
  try {
    const { sub, role } = verifyToken(refresh_token);
    if (!sub) {
      return res.status(401).json({ error: "invalid_token" });
    }
    const accessToken = signAccessToken({ sub, role });
    const refreshToken = signRefreshToken({ sub, role });
    return res.json({ access_token: accessToken, refresh_token: refreshToken });
  } catch (err) {
    return res.status(401).json({ error: "invalid_token" });
  }
});

export default router;
