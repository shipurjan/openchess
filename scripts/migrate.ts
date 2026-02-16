/**
 * Lightweight migration runner — replaces `prisma migrate deploy` in production.
 * Reads the same prisma/migrations/ directory and writes to the same
 * _prisma_migrations table, so it stays compatible with the Prisma CLI.
 */

import { createHash } from "crypto";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import pg from "pg";

const DATABASE_URL = process.env["DATABASE_URL"];
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

// Safety check: refuse to run against a database we don't own
const { rows: tables } = await client.query(`
  SELECT tablename FROM pg_catalog.pg_tables
  WHERE schemaname = 'public'
`);
const tableNames = new Set(tables.map((r) => r.tablename));
if (tableNames.size > 0 && !tableNames.has("_openchess")) {
  console.error(
    "Database has existing tables but no _openchess marker table. " +
      "Refusing to run migrations against a database that may not belong to this application.",
  );
  await client.end();
  process.exit(1);
}

// Create the marker table so we can identify this database as ours
await client.query(`CREATE TABLE IF NOT EXISTS "_openchess" ()`);

// Create the tracking table if it doesn't exist (matches prisma's schema)
await client.query(`
  CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    id                  VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid(),
    checksum            VARCHAR(64)  NOT NULL,
    finished_at         TIMESTAMPTZ,
    migration_name      VARCHAR(255) NOT NULL,
    logs                TEXT,
    rolled_back_at      TIMESTAMPTZ,
    started_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    applied_steps_count INTEGER      NOT NULL DEFAULT 0
  )
`);

// Find which migrations have already been applied
const { rows: applied } = await client.query(
  `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`,
);
const appliedSet = new Set(applied.map((r) => r.migration_name));

// Read migration directories, sorted by name (timestamp-prefixed)
const migrationsDir = join(process.cwd(), "prisma", "migrations");
const dirs = readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

for (const dir of dirs) {
  if (appliedSet.has(dir)) continue;

  const sqlPath = join(migrationsDir, dir, "migration.sql");
  const sql = readFileSync(sqlPath, "utf-8");
  const checksum = createHash("sha256").update(sql).digest("hex");

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query(
      `INSERT INTO "_prisma_migrations" (checksum, migration_name, finished_at, applied_steps_count)
       VALUES ($1, $2, now(), 1)`,
      [checksum, dir],
    );
    await client.query("COMMIT");
    console.log(`Applied migration: ${dir}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`Failed to apply migration ${dir}:`, err);
    process.exit(1);
  }
}

await client.end();
console.log("Migrations complete");
