/* eslint-disable no-console */
/**
 * Seed (or refresh) the unified-flow demo user in Clara's Postgres database.
 *
 *   email:    demo@trefolio.test
 *   password: DemoPass2026!
 *   plan:     pro (dailyAgentMessageLimit=200)
 *
 * Idempotent. Mirrors trefolio's and Will's seed scripts so the IdP can
 * collapse the three rows into one sub on the next migration.
 *
 * Uses raw `pg` (not Prisma) to keep working when the local schema is ahead
 * of the deployed migration set.
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import pg from "pg";

const EMAIL = "demo@trefolio.test";
const PASSWORD = "DemoPass2026!";
const NAME = "Demo Trefolio";

async function main() {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/etracker?schema=public";

  const client = new pg.Client({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("sslmode=") ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);

    const existing = await client.query(
      'SELECT id FROM "User" WHERE email = $1 LIMIT 1',
      [EMAIL],
    );

    if (existing.rows.length > 0) {
      const id = String(existing.rows[0].id);
      await client.query(
        `UPDATE "User"
            SET "passwordHash" = $1,
                name = $2,
                "emailVerified" = NOW(),
                "isActive" = TRUE,
                "dailyAgentMessageLimit" = 200,
                "updatedAt" = NOW()
          WHERE id = $3`,
        [passwordHash, NAME, id],
      );
      console.log(`updated clara user id=${id} email=${EMAIL} limit=200`);
      return;
    }

    // Cuid-style ids elsewhere in this DB but UUIDs are accepted by the
    // text-typed `id` column. We use UUID for portability.
    const id = `seed_${randomUUID()}`;
    await client.query(
      `INSERT INTO "User" (
         id, email, "passwordHash", name, "emailVerified",
         "isActive", "dailyAgentMessageLimit", "isAdmin",
         "createdAt", "updatedAt"
       ) VALUES (
         $1, $2, $3, $4, NOW(),
         TRUE, 200, FALSE,
         NOW(), NOW()
       )`,
      [id, EMAIL, passwordHash, NAME],
    );
    console.log(`created clara user id=${id} email=${EMAIL} limit=200`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
