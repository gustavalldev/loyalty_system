import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const migrationFiles = [
  "001_init.sql",
  "002_add_password.sql",
  "003_add_content_image.sql",
  "004_add_registered_referral_status.sql",
  "005_add_referral_code_bonus_rules.sql",
  "006_add_auth_code_purpose.sql"
];

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT now()
    )
  `);
}

async function hasMigration(client, filename) {
  const { rows } = await client.query(
    `SELECT 1 FROM schema_migrations WHERE filename = $1 LIMIT 1`,
    [filename]
  );
  return rows.length > 0;
}

async function markMigration(client, filename) {
  await client.query(
    `INSERT INTO schema_migrations (filename)
     VALUES ($1)
     ON CONFLICT (filename) DO NOTHING`,
    [filename]
  );
}

async function columnExists(client, tableName, columnName) {
  const { rows } = await client.query(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_name = $1 AND column_name = $2
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function tableExists(client, tableName) {
  const { rows } = await client.query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1
     LIMIT 1`,
    [tableName]
  );
  return rows.length > 0;
}

async function enumHasValue(client, typeName, value) {
  const { rows } = await client.query(
    `SELECT 1
     FROM pg_type t
     JOIN pg_enum e ON e.enumtypid = t.oid
     WHERE t.typname = $1 AND e.enumlabel = $2
     LIMIT 1`,
    [typeName, value]
  );
  return rows.length > 0;
}

async function isAlreadyApplied(client, filename) {
  switch (filename) {
    case "001_init.sql":
      return tableExists(client, "users");
    case "002_add_password.sql":
      return columnExists(client, "users", "password_hash");
    case "003_add_content_image.sql":
      return columnExists(client, "content_blocks", "image_url");
    case "004_add_registered_referral_status.sql":
      return enumHasValue(client, "referral_status", "registered");
    case "005_add_referral_code_bonus_rules.sql":
      return columnExists(client, "referral_codes", "bonus_new_user");
    case "006_add_auth_code_purpose.sql":
      return columnExists(client, "auth_codes", "purpose");
    default:
      return false;
  }
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  await client.connect();
  try {
    await ensureMigrationTable(client);

    for (const filename of migrationFiles) {
      if (await hasMigration(client, filename)) {
        process.stdout.write(`[migrate] skip ${filename} (recorded)\n`);
        continue;
      }

      if (await isAlreadyApplied(client, filename)) {
        process.stdout.write(`[migrate] skip ${filename} (detected)\n`);
        await markMigration(client, filename);
        continue;
      }

      const migrationPath = path.resolve(__dirname, "../migrations", filename);
      const sql = await readFile(migrationPath, "utf8");
      process.stdout.write(`[migrate] ${filename}\n`);
      await client.query(sql);
      await markMigration(client, filename);
    }
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
