/* eslint-disable no-console */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function parseArgs(argv) {
  const opts = { dryRun: false, limit: null };
  for (const arg of argv) {
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg.startsWith("--limit=")) {
      const n = Number(arg.slice("--limit=".length));
      opts.limit = Number.isFinite(n) && n > 0 ? n : null;
    }
  }
  return opts;
}

function normalizePgSslModeInConnectionString(connectionString) {
  try {
    const parsed = new URL(connectionString);
    const mode = parsed.searchParams.get("sslmode")?.toLowerCase();
    if (mode === "prefer" || mode === "require" || mode === "verify-ca") {
      parsed.searchParams.set("sslmode", "verify-full");
      return parsed.toString();
    }
  } catch {
    // Pass through; Prisma/pg will emit the real parse error.
  }
  return connectionString;
}

async function importUser(baseUrl, token, payload) {
  const res = await fetch(`${baseUrl}/api/v1/admin/users/import`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`IdP import failed (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const baseUrl = process.env.IDP_BASE_URL;
  const token = process.env.IDP_SERVICE_TOKEN;
  if (!baseUrl || !token) {
    console.error("Missing IDP_BASE_URL or IDP_SERVICE_TOKEN env vars.");
    process.exit(1);
  }

  const databaseUrl = normalizePgSslModeInConnectionString(
    process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@localhost:5432/etracker?schema=public",
  );
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });
  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        emailVerified: true,
        dailyAgentMessageLimit: true,
      },
      orderBy: { createdAt: "asc" },
      take: opts.limit ?? undefined,
    });

    console.log(`Found ${users.length} Clara users to migrate${opts.dryRun ? " (DRY RUN)" : ""}.`);

    let created = 0;
    let linked = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of users) {
      const email = String(user.email || "").trim().toLowerCase();
      if (!email || email.endsWith("@guest.clara.local")) {
        skipped++;
        continue;
      }

      const isPro = user.dailyAgentMessageLimit > 30;
      const payload = {
        email,
        passwordHash: user.passwordHash || undefined,
        name: user.name || undefined,
        emailVerified: !!user.emailVerified,
        plan: isPro ? "pro" : "free",
      };

      if (opts.dryRun) {
        console.log(`DRY ${email} | plan=${payload.plan}`);
        continue;
      }

      try {
        const res = await importUser(baseUrl, token, payload);
        if (res.created) created++;
        else linked++;
        await db.user.updateMany({
          where: { email },
          data: { idpSub: res.sub },
        });
        console.log(`OK  ${email} -> sub=${res.sub} (${res.created ? "created" : "linked"})`);
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        const status = typeof err === "object" && err && "status" in err ? err.status : "n/a";
        console.error(`ERR ${email}: status=${status} ${msg}`);
      }
    }

    console.log(`\nDone: created=${created}, linked=${linked}, skipped=${skipped}, failed=${failed}`);
    if (failed > 0) process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
