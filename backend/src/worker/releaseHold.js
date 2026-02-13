import dotenv from "dotenv";
import pool from "../db.js";

dotenv.config();

const batchSize = Number(process.env.HOLD_RELEASE_BATCH || 100);

async function releaseHolds() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT id, account_id, amount
       FROM loyalty_transactions
       WHERE type = 'hold'
         AND status = 'pending'
         AND hold_until IS NOT NULL
         AND hold_until <= now()
       ORDER BY hold_until ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [batchSize]
    );

    if (!rows.length) {
      await client.query("COMMIT");
      return { released: 0 };
    }

    for (const row of rows) {
      const releaseRef = `hold:${row.id}:release`;
      const insert = await client.query(
        `INSERT INTO loyalty_transactions (account_id, type, amount, status, reason, external_ref, currency, confirmed_at)
         VALUES ($1, 'release', $2, 'confirmed', 'hold_release', $3, 'BONUS', now())
         ON CONFLICT (external_ref) DO NOTHING
         RETURNING id`,
        [row.account_id, row.amount, releaseRef]
      );

      if (insert.rows.length) {
        await client.query(
          `UPDATE loyalty_transactions
           SET status = 'confirmed', confirmed_at = now()
           WHERE id = $1`,
          [row.id]
        );
        await client.query(
          `UPDATE loyalty_accounts
           SET balance = balance + $1, updated_at = now()
           WHERE id = $2`,
          [row.amount, row.account_id]
        );
      }
    }

    await client.query("COMMIT");
    return { released: rows.length };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

releaseHolds()
  .then((result) => {
    console.log(JSON.stringify(result));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
