import pg from "pg";
import Redis from "ioredis";
import { execSync } from "child_process";

const TEST_DB = "openchess_test";
const ADMIN_URL = "postgresql://openchess:openchess@localhost:5432/postgres";
const TEST_URL = `postgresql://openchess:openchess@localhost:5432/${TEST_DB}`;
const REDIS_URL = "redis://localhost:6379";

async function waitForPostgres(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const client = new pg.Client({ connectionString: ADMIN_URL });
      await client.connect();
      await client.end();
      return;
    } catch {
      if (i === maxAttempts - 1) throw new Error("Postgres not ready");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function waitForRedis(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const redis = new Redis(REDIS_URL);
      await redis.ping();
      redis.disconnect();
      return;
    } catch {
      if (i === maxAttempts - 1) throw new Error("Redis not ready");
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

export default async function globalSetup() {
  if (!process.env.CI) {
    execSync("docker compose up db redis -d --wait", { stdio: "inherit" });
  }
  await waitForPostgres();
  await waitForRedis();

  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();

  const result = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = $1`,
    [TEST_DB],
  );

  if (result.rowCount === 0) {
    await client.query(`CREATE DATABASE ${TEST_DB}`);
  }

  await client.end();

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_URL },
    stdio: "inherit",
  });
}
