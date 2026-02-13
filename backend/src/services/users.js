import { generateCode } from "../utils/crypto.js";

export async function getOrCreateUserByTarget(client, { phone, email }) {
  if (!phone && !email) {
    return null;
  }

  const field = email ? "email" : "phone";
  const value = email || phone;

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

  return { id: userId, role: insert.rows[0].role, isNew: true };
}

export async function getAccountIdByUserId(client, userId) {
  const { rows } = await client.query(
    `SELECT id FROM loyalty_accounts WHERE user_id = $1 LIMIT 1`,
    [userId]
  );
  return rows.length ? rows[0].id : null;
}
