---
name: engineer-data
description: Database engineer for Clara — owns Prisma schema, migrations, the Prisma client singleton, query patterns, indexes, and data consistency. Invoke whenever editing prisma/schema.prisma, writing a migration, touching src/lib/db.ts, designing a new model, or fixing data quality issues.
---

# Database Engineer — Clara

## Stack

- **Engine**: PostgreSQL 16.
- **ORM**: Prisma 7 (`@prisma/client`, `@prisma/Clarapter-pg`, `pg`).
- **Schema**: [`prisma/schema.prisma`](../../../prisma/schema.prisma).
- **Migrations**: Prisma's native migration history under `prisma/migrations/`.
  Generated with `prisma migrate dev`, applied in production with
  `prisma migrate deploy` (run automatically on Vercel production deploys via
  the build script — see [`vercel.json`](../../../vercel.json)).
- **Client**: singleton in [`src/lib/db.ts`](../../../src/lib/db.ts). Always
  import the shared instance — never `new PrismaClient()` per request.
- **Hosting**: any managed Postgres works; the friendly path is Neon (use the
  pooled connection string for `DATABASE_URL`).

## Where data access lives

Clara does not have a strict "one file per domain" pattern. Domain logic
calls Prisma directly from services. That is fine **as long as**:

1. The query stays inside a server module (`src/lib/**`, `src/app/api/**`,
   server components / actions).
2. The Prisma client is imported from `src/lib/db.ts` (singleton).
3. Inputs are validated with Zod **before** they reach Prisma. See
   [`src/lib/validators.ts`](../../../src/lib/validators.ts).
4. Heavy aggregations / multi-step reads with caching live in dedicated
   service files (e.g. `src/lib/month-page-data.ts`,
   `src/lib/year-timeline-data.ts`).

UI components (client components in `src/app/**`) **never** import the
Prisma client. They reach the DB through API routes or Server Actions only.

## Migration rules

1. **Use Prisma's migration flow**: edit `prisma/schema.prisma`, then
   `npm run prisma:migrate -- --name describe_change_in_snake_case`. Commit
   the generated `prisma/migrations/<timestamp>_…/migration.sql` AND the
   updated `schema.prisma`.
2. **Production migrations run automatically** via `prisma migrate deploy` in
   the Vercel build (gated by `VERCEL_ENV`). Preview deploys never touch the
   database.
3. **Backwards-compatible by default.** Avoid destructive renames and
   non-null column adds without defaults. If you must:
   - Add the new column nullable.
   - Backfill in a separate migration or background job.
   - Add the `NOT NULL` constraint in a follow-up migration once data is
     consistent.
4. **Drops are explicit.** When dropping a model or column, write a short
   note in the PR explaining what stops referencing it and confirm zero
   readers in code.
5. **Idempotency.** Migrations should be safe to re-apply — trust Prisma's
   migration history table; do not write hand-rolled `IF NOT EXISTS` SQL
   inside Prisma migrations.
6. **Seed data**: keep any seeds in `prisma/seed.ts` (not yet present at the
   time of writing — create when needed) and run via
   `prisma db seed` rather than ad-hoc scripts.

## Schema conventions

| Pattern | Convention |
|---------|------------|
| Primary key | `id String @id @default(cuid())` |
| User-scoped tables | `userId String` field + relation to `User`, indexed |
| Timestamps | `createdAt DateTime @default(now())`, `updatedAt DateTime @updatedAt` |
| Soft delete | Avoid; prefer hard delete with cascading relations. |
| Money | `Decimal` (Postgres `NUMERIC`), never `Float`. Currency is implicit per record (Clara is single-currency per user today). |
| Enums | Prisma `enum` blocks; reflect as TypeScript types in consumers. |
| Cascading delete | `onDelete: Cascade` on relations to `User`, `Bank`, `Month`. |

## Indexing checklist

For any new model, add an `@@index` for:

- The most common `WHERE` filter (typically `userId`).
- Any foreign key participating in joins.
- Date columns used in range queries.

Do not over-index — every index slows writes. When in doubt, add the index
when you write the first query that needs it.

## Caching layer

Two reads are cached via Vercel Runtime Cache:

- **Banks per user** — wrappers in [`src/lib/cache/banks.ts`](../../../src/lib/cache/banks.ts).
  Cache tag invalidated on bank create / update / delete.
- **Year timeline per user/year** — wrappers in
  [`src/lib/year-timeline-data.ts`](../../../src/lib/year-timeline-data.ts).
  Cache tag invalidated from any handler that mutates a month.

When you add a mutation that affects either of those reads, invalidate the
matching tag in the same code path. Forgetting this is the most common
data-staleness bug.

## Error handling

Throw typed errors and let [`withApi()`](../../../src/lib/http.ts) translate
them. Common cases:

- Validation failure → throw a Zod error from `parse()`. `withApi()` returns
  400 with field details.
- Not found → throw `new ApiError("NOT_FOUND")` (or whichever code matches
  the http.ts contract).
- Unique-constraint violation → catch the `PrismaClientKnownRequestError`
  with code `P2002` and translate to a domain-specific error.

Never `try { ... } catch { return NextResponse.json(...) }` inside a route.

## Quality gates

| Gate | What |
|------|------|
| Lint | `npm run lint` |
| Types | `npx tsc --noEmit` |
| Unit | `npm test` — pure helpers in `src/lib/**/*.ts` need a test |
| Build | `npm run build` |
| Migration smoke | Re-run `prisma migrate dev` against a fresh DB to confirm the migration is reproducible |

## Checklist

```
DB change checklist
- [ ] schema.prisma updated
- [ ] Migration named with snake_case verb_object
- [ ] Existing readers still compile
- [ ] Indexes added for new WHERE / ORDER BY columns
- [ ] Cache tags invalidated where reads are cached
- [ ] withApi() error translation works for new failure modes
- [ ] Unit test added for any new pure helper
- [ ] Knowledge spec updated if the model or contract changed
```

## Coordination

- For provider-side data shape (GoCardless, Twilio, AI Gateway): see
  [`engineer-integrations`](../engineer-integrations/SKILL.md).
- For privacy / retention questions when adding a new field that stores
  user data: see [`legal-advisor`](../legal-advisor/SKILL.md).
- For exposing data via MCP tools: see
  [`engineer-integrations`](../engineer-integrations/SKILL.md) (MCP section).
