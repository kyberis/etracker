# months-and-templates

> The core data model: a recurring `Expense` template projects into one
> or many months as `MonthExpenseLine`s; the `MonthRecord` ties them
> together and tracks the prior-month carryover. `paid` is per line.
> All maths live in the user's `primaryCurrency` via the frozen
> `amountConverted` column.

## What it does

When the user says "alquiler 800 USD el 1 de cada mes", Clara stores:

- An `Expense` (template) with `name`, `amount`, `bankId`, `category`,
  `startMonth`, optional `endMonth`, `isRecurring = true`.
- For each month the user opens / works in, a `MonthRecord` exists
  (`@@unique([userId, month])`) and a `MonthExpenseLine` is
  materialised from the template, ready to be marked `paid`.

For a one-off expense ("café 5000 ARS hoy"), Clara writes a
`MonthExpenseLine` with no template (`templateId: null`), in the
current month's `MonthRecord` (creating the record if needed).

The web dashboard reads month state via `getMonthState`; the agent
calls the same surface plus a set of mutations
(`addMonthLine`, `updateMonthLine`, `deleteMonthLine`,
`createExpenseTemplate`, `updateExpenseTemplate`,
`deleteExpenseTemplate`, `mergePendingTemplates`,
`applyPrevMonthLeftover`).

## Where the code lives

| Layer | Path |
|-------|------|
| Prisma models | [`prisma/schema.prisma`](../../prisma/schema.prisma) — `Expense`, `MonthRecord`, `MonthExpenseLine` |
| Month bucket helpers | [`src/lib/months.ts`](../../src/lib/months.ts) (`getCurrentMonthKey`, `parseMonthKey`, `formatMonthKey`, `toMonthStart`) |
| Month bucket tests | [`src/lib/month-bucket.test.ts`](../../src/lib/month-bucket.test.ts) |
| Expense-line domain | [`src/lib/expense-line.ts`](../../src/lib/expense-line.ts) (`isUniqueViolation`, `parseIsoDate`, `todayUtcDate`) |
| Agent tools | [`src/lib/ai/expense-tools.ts`](../../src/lib/ai/expense-tools.ts) (the months / templates / lines section) |
| REST: months | [`src/app/api/months/`](../../src/app/api/months) |
| REST: month expense lines | [`src/app/api/month-expense-lines/`](../../src/app/api/month-expense-lines) |
| REST: expenses (templates) | [`src/app/api/expenses/`](../../src/app/api/expenses) |

## Data model

`Expense` (template):

| Field | Type | Notes |
|-------|------|-------|
| `userId` | `String` | Cascade. |
| `bankId` | `String` | `onDelete: Restrict` — must reassign before bank delete. |
| `name`, `amount` | text + Decimal(12,2) | `amount` always in `User.primaryCurrency`. |
| `isRecurring` | `Boolean @default(true)` | |
| `startMonth`, `endMonth?` | `DateTime` | Open-ended end means "until further notice". |
| `category` | `ExpenseCategory` | One of 15 fixed values. |

`MonthRecord`:

| Field | Type | Notes |
|-------|------|-------|
| `userId` + `month` | `@@unique([userId, month])` | One row per user per month. |
| `income` | `Decimal` | **Deprecated**: was the only income field; the source of truth is now `MonthIncomeLine[]`. Don't read or write. |
| `carryoverFromPrev` | `Decimal` | When the user chose "addToIncome" via `applyPrevMonthLeftover`. Always in primary currency. |
| `carryoverDecidedAt` | `DateTime?` | Null = the carryover prompt should still surface. |

`MonthExpenseLine`:

| Field | Type | Notes |
|-------|------|-------|
| `userId` | `String` | **Denormalised** from `monthRecord.userId` so the dedupe partial unique index can be expressed without a join. |
| `monthRecordId` | `String` | Cascade. |
| `templateId` | `String?` | `onDelete: SetNull` — keeps historical lines after a template is deleted. |
| `bankId` | `String` | `onDelete: Restrict`. |
| `name`, `amount`, `currency` | text + Decimal + ISO 4217 | `amount` is in the original currency of the line. |
| `fxRate` | `Decimal(20,10)` | **Frozen at write time** so aggregations stay deterministic. |
| `amountConverted` | `Decimal(12,2)` | `amount * fxRate`, **always in `User.primaryCurrency`**. Use this for every `SUM`. |
| `occurredOn` | `Date` | Real transaction day, not bucket day. Used for events, charts, dedupe. |
| `category` | `ExpenseCategory` | Defaults `OTROS`. |
| `paid` | `Boolean @default(false)` | Per line. |
| `eventId?` | `String?` | Event wallet attribution. `onDelete: SetNull`. |
| `paidByUserId?` | `String?` | Required when the event has >1 active participant. `onDelete: SetNull`. |

A SQL-only **partial unique index** in the
`20260429140000_expense_dedup` migration prevents duplicates on
`(userId, occurredOn, lower(trim(name)), amount, currency)` WHERE
`templateId IS NULL` — i.e. import / chat-entered lines can't be
inserted twice; template-driven lines are exempt because the user is
allowed multiple monthly copies.

## Contracts

### Reads

`getMonthState({ month?, userId })`:

- Returns the month snapshot the dashboard renders: lines (with bank,
  template, event), income lines, totals (income, planned, paid,
  remaining), the carryover prompt when applicable, and the active
  events for the month. Used by the agent to answer "how am I doing?".

### Mutations (REST + agent)

| Surface | Tool | Notes |
|---------|------|-------|
| `POST /api/expenses` | `createExpenseTemplate` | Build a template. |
| `PATCH /api/expenses/[id]` | `updateExpenseTemplate` | Pass only the changed fields. |
| `DELETE /api/expenses/[id]` | `deleteExpenseTemplate` | Past lines remain (template id NULL'd). |
| `POST /api/month-expense-lines` | `addMonthLine` | **Only the current month.** |
| `PATCH /api/month-expense-lines/[id]` | `updateMonthLine` | Covers `paid`, `amount`, `bankId`, `category`, `occurredOn`, `currency`, `fxRate`, `eventId`, `paidByUserId`. |
| `DELETE /api/month-expense-lines/[id]` | `deleteMonthLine` | Doesn't touch the template. |
| `POST /api/months` | `createMonthIfNeeded` | Lazy-create the `MonthRecord`. |
| `POST /api/months/[month]/merge-templates` | `mergePendingTemplates` | Materialise templates that aren't yet present this month. |
| `POST /api/months/[month]/leftover` | `applyPrevMonthLeftover` | One of `addToIncome`, `setAside`, `coverFromSavings`, `carryDebt`. |

## Invariants

- **Math lives in `amountConverted` (primary currency).** Never sum
  `amount` directly; rates and currencies vary per line.
- **`fxRate` is frozen at write time.** Don't recompute later — that
  would mutate history when the rate moves.
- **`addMonthLine` only writes to the current month.** Backdated
  entries are intentional friction; the user must use REST / the web
  for past months.
- **`templateId` SetNull on delete.** A deleted template doesn't
  destroy historical materialised lines; they just become orphans
  with no future projection.
- **`bankId` Restrict on delete.** A bank with attached lines or
  templates must be reassigned (or the lines / templates removed)
  before delete. The `deleteBank` tool surfaces this back to the user.
- **`paid = true` is the default for chat-added lines** (see the
  agent's `Default for "paid"` rule). Only `mergePendingTemplates`
  produces lines with `paid = false`.
- **Dedupe is partial-unique on import / chat lines.** Re-importing
  the same CSV row is silently ignored; the constraint produces a
  Prisma `P2002` that callers translate to a friendly "ya estaba
  cargado" reply.
- **Carryover decision is one-shot per month.** Once
  `carryoverDecidedAt` is set, the prompt stops surfacing.

## Known gaps / TODOs

- `MonthRecord.income` is still on the row for backwards
  compatibility. Drop in N+1 release once we're sure no caller reads
  it.
- Dedupe index is SQL-only because Prisma doesn't express partial /
  functional indexes. Be careful when running `prisma db push` —
  always go through migrations.
- We don't enforce `endMonth >= startMonth` at the schema level; rely
  on Zod validators in the API + tool layer.
- `MonthExpenseLine.userId` denormalisation must be kept in sync
  manually. The `addMonthLine` / `updateMonthLine` paths set it
  correctly today; a future "move line to another user" path would
  need to update both.
- We don't backfill past months with new templates automatically.
  `mergePendingTemplates` is opt-in per month.

## Related

- Spec: [`ai-agent`](ai-agent.md) — the agent surface that drives
  most writes.
- Spec: [`income`](income.md) — the matching pattern for income
  templates and lines.
- Spec: [`events`](events.md) — `eventId` / `paidByUserId` semantics.
- Spec: [`savings`](savings.md) — carryover and debt-coverage
  interplay.
- Skill: [`engineer-data`](../../.cursor/skills/engineer-data/SKILL.md)
- Design doc: [`with-api-error-handling`](../design-docs/with-api-error-handling.md)
