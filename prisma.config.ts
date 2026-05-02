import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL,
    // Prisma v7 dropped the `--shadow-database-url` CLI flag. The shadow DB
    // URL now lives in this config; CI sets `SHADOW_DATABASE_URL` for the
    // drift-detection step (`prisma migrate diff --from-migrations …`),
    // which needs a real DB to materialize the migration history. In dev
    // it's optional — Prisma will spin up a temporary one when needed.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
