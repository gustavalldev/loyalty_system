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
  "005_add_referral_code_bonus_rules.sql"
];

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  await client.connect();
  try {
    for (const filename of migrationFiles) {
      const migrationPath = path.resolve(__dirname, "../migrations", filename);
      const sql = await readFile(migrationPath, "utf8");
      process.stdout.write(`[migrate] ${filename}\n`);
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
