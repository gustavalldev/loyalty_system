import { Router } from "express";
import bcrypt from "bcryptjs";
import pool from "../db.js";
import { generateOtpCode, hashOtp } from "../utils/crypto.js";
import { signAccessToken, signRefreshToken, verifyToken } from "../utils/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { ensureReferralCode, getAccountIdByUserId, normalizeEmail, normalizePhone } from "../services/users.js";
import { sendOtpMessage } from "../services/otp-delivery.js";

const router = Router();

const OTP_PURPOSES = {
  LOGIN: "login",
  REGISTRATION: "registration",
  PASSWORD_RESET: "password_reset",
  PASSWORD_CHANGE: "password_change"
};

function normalizeEmailTarget(target) {
  const normalized = normalizeEmail(target);
  return normalized && normalized.includes("@") ? normalized : "";
}

async function assertRegistrationTargetAvailable(client, { email, phone }) {
  const emailExists = await client.query(
    `SELECT id FROM users WHERE email = $1 LIMIT 1`,
    [email]
  );
  if (emailExists.rows.length) {
    return { status: 409, body: { error: "user_exists" } };
  }

  if (phone) {
    const phoneExists = await client.query(
      `SELECT id FROM users WHERE phone = $1 LIMIT 1`,
      [phone]
    );
    if (phoneExists.rows.length) {
      return { status: 409, body: { error: "phone_in_use" } };
    }
  }

  return null;
}

async function validateOtpCode(client, { target, channel = "email", purpose, code }) {
  const { rows } = await client.query(
    `SELECT id, code_hash, attempts_left, expires_at
     FROM auth_codes
     WHERE target = $1 AND channel = $2 AND purpose = $3 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [target, channel, purpose]
  );

  if (!rows.length) {
    return { ok: false, status: 401, body: { error: "invalid_code" } };
  }

  const record = rows[0];
  if (new Date(record.expires_at).getTime() < Date.now()) {
    return { ok: false, status: 401, body: { error: "expired_code" } };
  }
  if (record.attempts_left <= 0) {
    return { ok: false, status: 401, body: { error: "attempts_exceeded" } };
  }

  const incomingHash = hashOtp(code);
  if (incomingHash !== record.code_hash) {
    await client.query(
      `UPDATE auth_codes
       SET attempts_left = attempts_left - 1
       WHERE id = $1`,
      [record.id]
    );
    return { ok: false, status: 401, body: { error: "invalid_code" } };
  }

  return { ok: true, record };
}

async function createEmailOtp({ target, purpose }) {
  const normalizedTarget = normalizeEmailTarget(target);
  if (!normalizedTarget) {
    return { status: 400, body: { error: "invalid_email" } };
  }

  const channel = "email";
  const ttlSeconds = Number(process.env.OTP_TTL_SECONDS || 300);
  const attempts = Number(process.env.OTP_ATTEMPTS || 3);
  const cooldownSeconds = Number(process.env.OTP_COOLDOWN_SECONDS || 60);

  const cooldownResult = await pool.query(
    `SELECT created_at
     FROM auth_codes
     WHERE target = $1 AND channel = $2 AND purpose = $3
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedTarget, channel, purpose]
  );

  if (cooldownResult.rows.length) {
    const lastCreated = new Date(cooldownResult.rows[0].created_at);
    const nextAllowed = new Date(lastCreated.getTime() + cooldownSeconds * 1000);
    if (Date.now() < nextAllowed.getTime()) {
      const retryAfter = Math.ceil((nextAllowed.getTime() - Date.now()) / 1000);
      return { status: 429, body: { error: "cooldown", retry_after: retryAfter } };
    }
  }

  const code = generateOtpCode();
  const codeHash = hashOtp(code);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await pool.query(
    `INSERT INTO auth_codes (target, channel, purpose, code_hash, expires_at, attempts_left)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [normalizedTarget, channel, purpose, codeHash, expiresAt, attempts]
  );

  try {
    await sendOtpMessage({
      target: normalizedTarget,
      channel,
      code,
      ttlSeconds,
      purpose
    });
  } catch (err) {
    await pool.query(
      `DELETE FROM auth_codes
       WHERE target = $1 AND channel = $2 AND purpose = $3 AND code_hash = $4 AND consumed_at IS NULL`,
      [normalizedTarget, channel, purpose, codeHash]
    );
    console.error("[OTP][email] delivery failed", err);
    return { status: 502, body: { error: "delivery_failed" } };
  }

  const body = { ok: true, cooldown_seconds: cooldownSeconds };
  if (process.env.OTP_ECHO === "true") {
    body.dev_code = code;
  }
  if (process.env.OTP_LOG === "true") {
    console.log(`[OTP] target=${normalizedTarget} channel=${channel} purpose=${purpose} code=${code}`);
  }

  return { status: 200, body };
}

async function registerUser({ target, full_name, password, phone, promo_code, code }) {
  const normalizedTarget = normalizeEmailTarget(target);
  if (!normalizedTarget) {
    return { status: 400, body: { error: "invalid_email" } };
  }
  const normalizedPhone = normalizePhone(phone);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const unavailable = await assertRegistrationTargetAvailable(client, {
      email: normalizedTarget,
      phone: normalizedPhone
    });
    if (unavailable) {
      await client.query("ROLLBACK");
      return unavailable;
    }

    const otp = await validateOtpCode(client, {
      target: normalizedTarget,
      purpose: OTP_PURPOSES.REGISTRATION,
      code
    });
    if (!otp.ok) {
      await client.query("ROLLBACK");
      return { status: otp.status, body: otp.body };
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const insert = await client.query(
      `INSERT INTO users (email, full_name, password_hash, phone)
       VALUES ($1, $2, $3, $4)
       RETURNING id, role`,
      [normalizedTarget, full_name, passwordHash, normalizedPhone || null]
    );
    const userId = insert.rows[0].id;
    const role = insert.rows[0].role;

    await client.query(`INSERT INTO loyalty_accounts (user_id) VALUES ($1)`, [userId]);
    await ensureReferralCode(client, userId);

    const normalizedPromoCode = String(promo_code || "").trim().toUpperCase();
    if (normalizedPromoCode) {
      const referralCodeResult = await client.query(
        `SELECT id, user_id, status, bonus_new_user, bonus_referrer, max_uses, uses_count
         FROM referral_codes
         WHERE UPPER(code) = $1
         LIMIT 1`,
        [normalizedPromoCode]
      );

      if (!referralCodeResult.rows.length || referralCodeResult.rows[0].status !== "active") {
        await client.query("ROLLBACK");
        return { status: 400, body: { error: "invalid_promo_code" } };
      }

      const promoRow = referralCodeResult.rows[0];
      if (promoRow.max_uses != null && Number(promoRow.uses_count || 0) >= Number(promoRow.max_uses)) {
        await client.query("ROLLBACK");
        return { status: 400, body: { error: "promo_code_limit_reached" } };
      }

      const referrerUserId = promoRow.user_id;
      if (String(referrerUserId) === String(userId)) {
        await client.query("ROLLBACK");
        return { status: 400, body: { error: "invalid_promo_code" } };
      }

      const newUserAccountId = await getAccountIdByUserId(client, userId);
      if (!newUserAccountId) {
        throw new Error("loyalty_account_not_found");
      }

      const bonusNewUser = Math.max(0, Number(promoRow.bonus_new_user || 0));

      await client.query(
        `INSERT INTO referral_attributions (referral_code_id, client_contact, status)
         VALUES ($1, $2, 'registered')`,
        [promoRow.id, normalizedTarget || normalizedPhone || String(userId)]
      );

      if (bonusNewUser > 0) {
        const newUserTx = await client.query(
          `INSERT INTO loyalty_transactions (account_id, type, amount, status, reason, external_ref, currency, confirmed_at, meta)
           VALUES ($1, 'accrual', $2, 'confirmed', 'promo_registration', $3, 'BONUS', now(), $4)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [
            newUserAccountId,
            bonusNewUser,
            `register:promo:new-user:${userId}`,
            { promo_code: normalizedPromoCode, role: "invitee", referrer_user_id: referrerUserId }
          ]
        );
        if (newUserTx.rows.length) {
          await client.query(
            `UPDATE loyalty_accounts SET balance = balance + $1, updated_at = now() WHERE id = $2`,
            [bonusNewUser, newUserAccountId]
          );
        }
      }

      await client.query(
        `UPDATE referral_codes
         SET uses_count = uses_count + 1
         WHERE id = $1`,
        [promoRow.id]
      );
    }

    await client.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userId]);
    await client.query(
      `UPDATE auth_codes
       SET consumed_at = now(), user_id = $1
       WHERE id = $2`,
      [userId, otp.record.id]
    );
    await client.query("COMMIT");

    return {
      status: 201,
      body: {
        access_token: signAccessToken({ sub: userId, role }),
        refresh_token: signRefreshToken({ sub: userId, role }),
        is_new_user: true
      }
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

function sendResult(res, result) {
  return res.status(result.status).json(result.body);
}

router.post("/register/request-code", async (req, res) => {
  const { target, phone } = req.body || {};
  const normalizedTarget = normalizeEmailTarget(target);
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedTarget || !normalizedPhone) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const unavailable = await assertRegistrationTargetAvailable(pool, {
    email: normalizedTarget,
    phone: normalizedPhone
  });
  if (unavailable) {
    return res.status(unavailable.status).json(unavailable.body);
  }

  const result = await createEmailOtp({
    target: normalizedTarget,
    purpose: OTP_PURPOSES.REGISTRATION
  });
  return sendResult(res, result);
});

router.post("/register", async (req, res) => {
  const { target, full_name, phone, password, promo_code, code } = req.body || {};
  if (!target || !full_name || !phone || !password || !code) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const result = await registerUser({ target, full_name, phone, password, promo_code, code });
  return res.status(result.status).json(result.body);
});

router.post("/login", async (req, res) => {
  const { target, password } = req.body || {};
  if (!target || !password) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const isEmail = target.includes("@");
  const field = isEmail ? "email" : "phone";
  const normalizedTarget = isEmail ? normalizeEmail(target) : normalizePhone(target);
  const { rows } = await pool.query(
    `SELECT id, role, password_hash FROM users WHERE ${field} = $1 LIMIT 1`,
    [normalizedTarget]
  );
  if (!rows.length || !rows[0].password_hash) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  await pool.query(
    `UPDATE users SET last_login_at = now() WHERE id = $1`,
    [rows[0].id]
  );
  return res.json({
    access_token: signAccessToken({ sub: rows[0].id, role: rows[0].role }),
    refresh_token: signRefreshToken({ sub: rows[0].id, role: rows[0].role }),
    is_new_user: false
  });
});

router.post("/verify-otp", async (req, res) => {
  const { target, code, purpose, password } = req.body || {};
  if (!target || !code) {
    return res.status(400).json({ error: "invalid_request" });
  }
  if (purpose !== OTP_PURPOSES.LOGIN) {
    return res.status(400).json({ error: "purpose_required" });
  }
  const isEmail = target.includes("@");
  const normalizedTarget = isEmail ? normalizeEmail(target) : normalizePhone(target);
  const { rows } = await pool.query(
    `SELECT id, channel, code_hash, attempts_left, expires_at
     FROM auth_codes
     WHERE target = $1 AND purpose = $2 AND consumed_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [normalizedTarget, OTP_PURPOSES.LOGIN]
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
    const field = isEmail ? "email" : "phone";
    const userResult = await client.query(
      `SELECT id, role FROM users WHERE ${field} = $1 LIMIT 1`,
      [normalizedTarget]
    );

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
      is_new_user: false
    });
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
});

router.post("/request-password-reset", async (req, res) => {
  const { target } = req.body || {};
  const normalizedTarget = normalizeEmailTarget(target);
  if (!normalizedTarget) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const result = await createEmailOtp({
    target: normalizedTarget,
    purpose: OTP_PURPOSES.PASSWORD_RESET
  });
  return sendResult(res, result);
});

router.post("/reset-password", async (req, res) => {
  const { target, code, new_password } = req.body || {};
  if (!target || !code || !new_password) {
    return res.status(400).json({ error: "invalid_request" });
  }
  const normalizedTarget = normalizeEmailTarget(target);
  if (!normalizedTarget) {
    return res.status(400).json({ error: "invalid_request" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const otp = await validateOtpCode(client, {
      target: normalizedTarget,
      purpose: OTP_PURPOSES.PASSWORD_RESET,
      code
    });
    if (!otp.ok) {
      await client.query("ROLLBACK");
      return res.status(otp.status).json(otp.body);
    }

    const { rows: userRows } = await client.query(
      `SELECT id FROM users WHERE email = $1 LIMIT 1`,
      [normalizedTarget]
    );
    if (!userRows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "user_not_found" });
    }

    const passwordHash = await bcrypt.hash(new_password, 10);
    await client.query(
      `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
      [passwordHash, userRows[0].id]
    );

    await client.query(
      `UPDATE auth_codes SET consumed_at = now(), user_id = $1 WHERE id = $2`,
      [userRows[0].id, otp.record.id]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

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
  const result = await createEmailOtp({
    target: rows[0].email,
    purpose: OTP_PURPOSES.PASSWORD_CHANGE
  });
  return sendResult(res, result);
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const otp = await validateOtpCode(client, {
      target,
      purpose: OTP_PURPOSES.PASSWORD_CHANGE,
      code
    });
    if (!otp.ok) {
      await client.query("ROLLBACK");
      return res.status(otp.status).json(otp.body);
    }

    const passwordHash = await bcrypt.hash(new_password, 10);
    await client.query(
      `UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`,
      [passwordHash, req.user.id]
    );
    await client.query(
      `UPDATE auth_codes SET consumed_at = now(), user_id = $1 WHERE id = $2`,
      [req.user.id, otp.record.id]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

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
