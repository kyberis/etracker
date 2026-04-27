import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

/**
 * pg-connection-string (via `pg`) warns when `sslmode` is `prefer`, `require`,
 * or `verify-ca` without choosing the post–libpq-compat behavior. Those modes
 * are currently treated like `verify-full`; set it explicitly so logs stay
 * clean and semantics stay pinned until pg v9.
 *
 * @see https://www.postgresql.org/docs/current/libpq-ssl.html
 */
function normalizePgSslModeInConnectionString(connectionString: string): string {
  try {
    const parsed = new URL(connectionString);
    const mode = parsed.searchParams.get("sslmode")?.toLowerCase();
    if (
      mode === "prefer" ||
      mode === "require" ||
      mode === "verify-ca"
    ) {
      parsed.searchParams.set("sslmode", "verify-full");
      return parsed.toString();
    }
  } catch {
    // Malformed URL: pass through; Prisma/pg will surface a clearer error.
  }
  return connectionString;
}

const databaseUrl = normalizePgSslModeInConnectionString(
  process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/etracker?schema=public",
);

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl }),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
