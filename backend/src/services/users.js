import { generateCode } from "../utils/crypto.js";

export function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export async function getOrCreateUserByTarget(client, { phone, email }) {
  if (!phone && !email) {
    return null;
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  const field = normalizedEmail ? "email" : "phone";
  const value = normalizedEmail || normalizedPhone;

  const existing = await client.query(
    `SELECT id, role FROM users WHERE ${field} = $1 LIMIT 1`,
    [value]
  );
  if (existing.rows.length) {
    return { id: existing.rows[0].id, role: existing.rows[0].role, isNew: false };
  }

  const insert = await client.query(
    `INSERT INTO users (${field}) VALUES ($1) RETURNING id, role`,
    [value]
  );
  const userId = insert.rows[0].id;

  await client.query(`INSERT INTO loyalty_accounts (user_id) VALUES ($1)`, [userId]);
  await ensureReferralCode(client, userId);

  return { id: userId, role: insert.rows[0].role, isNew: true };
}

export async function getAccountIdByUserId(client, userId) {
  const { rows } = await client.query(
    `SELECT id FROM loyalty_accounts WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return rows.length ? rows[0].id : null;
}

export async function ensureReferralCode(client, userId) {
  const existing = await client.query(
    `SELECT id, code, status, bonus_new_user, bonus_referrer, max_uses, uses_count
     FROM referral_codes
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );
  if (existing.rows.length) {
    return existing.rows[0];
  }

  for (let i = 0; i < 5; i += 1) {
    const codeCandidate = generateCode(10);
    try {
      const insert = await client.query(
        `INSERT INTO referral_codes (user_id, code) VALUES ($1, $2)
         RETURNING id, code, status, bonus_new_user, bonus_referrer, max_uses, uses_count`,
        [userId, codeCandidate]
      );
      return insert.rows[0];
    } catch (err) {
      if (err.code !== "23505") {
        throw err;
      }
    }
  }

  throw new Error("failed_to_generate_referral_code");
}
