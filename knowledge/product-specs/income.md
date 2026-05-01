# income

> Multi-source monthly income: recurring `Income` templates + per-month
> `MonthIncomeLine` lines, mirroring the expense data model. Replaces the
> legacy single `MonthRecord.income` field.

## What it does

The user can register **any number** of incomes per month — recurring (sueldo,
alquiler que cobra, retainer freelance) and one-off (un freelance puntual, un
bono, una devolución de impuestos, un regalo). Each line:

- Has its own `name`, `amount`, original `currency`, optional `bankId`,
  `category`, `occurredOn` and a `received` flag.
- Is converted to the user's primary currency at creation time via the same
  `convertToPrimary` pipeline as expenses, so the FX rate is **frozen** to
  the moment of input.
- Can come from a recurring `Income` template (auto-materialised on month
  creation as `received=false`, the user ticks when the money lands) or be
  entered ad-hoc via REST, chat (`addIncomeLine`) or MCP.

The month dashboard surfaces:

- `incomeTotals.received` — what already landed (this is what feeds the
  balance, mirroring `paid` for expenses).
- `incomeTotals.planned` — what's expected.
- `incomeTotals.remaining` — pending = planned − received.
- A **pending-from-templates** section so the user can confirm with one tap
  that a recurring income arrived.

The balance becomes:
`incomeTotals.received + carryoverFromPrev − sum(paid expense lines)`.

## Where the code lives

| Layer | Path |
|-------|------|
| Types / validators | [`src/lib/validators.ts`](../../src/lib/validators.ts) (`incomeSchema`, `monthIncomeLineCreateSchema`, `monthIncomeLineUpdateSchema`, `incomeCategorySchema`) |
| DB / Prisma models | [`prisma/schema.prisma`](../../prisma/schema.prisma) (`Income`, `MonthIncomeLine`, enum `IncomeCategory`) |
| Service / data layer | [`src/lib/month-bucket.ts`](../../src/lib/month-bucket.ts) (`incomeLinesFromTemplates`, `templateIncomeLinesForMonth`, pending helpers, `getPrevMonthBalance`) |
| Page data | [`src/lib/month-page-data.ts`](../../src/lib/month-page-data.ts), [`src/lib/month-page-types.ts`](../../src/lib/month-page-types.ts) |
| REST routes | [`src/app/api/incomes/route.ts`](../../src/app/api/incomes/route.ts), [`src/app/api/incomes/[id]/route.ts`](../../src/app/api/incomes/[id]/route.ts), [`src/app/api/months/[month]/incomes/route.ts`](../../src/app/api/months/[month]/incomes/route.ts), [`src/app/api/months/[month]/incomes/[id]/route.ts`](../../src/app/api/months/[month]/incomes/[id]/route.ts) |
| Agent tools | [`src/lib/ai/expense-tools.ts`](../../src/lib/ai/expense-tools.ts) (`createIncomeTemplate`, `updateIncomeTemplate`, `deleteIncomeTemplate`, `listIncomeTemplates`, `addIncomeLine`, `updateIncomeLine`, `deleteIncomeLine`, `markIncomeReceived`, `markIncomeUnreceived`) |
| MCP tools / resources | [`src/lib/mcp/user-server.ts`](../../src/lib/mcp/user-server.ts) (`incomes`, `monthIncomeLines`) |
| UI — month dashboard | [`src/components/month-dashboard.tsx`](../../src/components/month-dashboard.tsx), [`src/components/month/month-incomes-chronological.tsx`](../../src/components/month/month-incomes-chronological.tsx), [`src/components/month/month-add-income-dialog.tsx`](../../src/components/month/month-add-income-dialog.tsx) |
| UI — templates page | [`src/app/(app)/incomes/page.tsx`](../../src/app/(app)/incomes/page.tsx), [`src/components/incomes-manager.tsx`](../../src/components/incomes-manager.tsx) |
| UI — onboarding | [`src/app/(onboarding)/onboarding/wizard.tsx`](../../src/app/(onboarding)/onboarding/wizard.tsx) (`StepFirstIncome`) |
| i18n copy | [`src/lib/i18n/dictionaries/{es,en}.ts`](../../src/lib/i18n/dictionaries/) (`incomes`, `header.nav.incomes`, `month.addIncome*`, `month.incomesChronoTitle`, `month.pendingIncomesFromTemplates`) |

## Data model

```
Income
  id            cuid
  userId        FK User (cascade)
  bankId        FK Bank (nullable, set null)
  name          string
  amount        Decimal(12,2)
  currency      string (ISO 4217, defaults to "USD")
  isRecurring   bool, default true
  startMonth    DateTime (yyyy-MM-01)
  endMonth      DateTime? (recurring only)
  category      IncomeCategory enum (default OTROS)

MonthIncomeLine
  id             cuid
  userId         FK User (cascade)
  monthRecordId  FK MonthRecord (cascade)
  templateId     FK Income? (set null on template delete)
  bankId         FK Bank? (set null)
  name           string
  occurredOn     DateTime @db.Date
  amount         Decimal(12,2)
  currency       string (ISO 4217)
  fxRate         Decimal(20,10), default 1
  amountConverted Decimal(12,2)
  category       IncomeCategory
  received       bool, default false   // mirror of `paid` on expenses

  Indexes:
    @@index([monthRecordId])
    @@index([userId])
    Partial unique (raw SQL): (userId, occurredOn,
      lower(trim(regexp_replace(name, '\s+', ' ', 'g'))),
      amount, currency) WHERE templateId IS NULL.
```

`IncomeCategory`: `SUELDO | FREELANCE | NEGOCIO | INVERSIONES | ALQUILER |
BONO | REEMBOLSO | REGALO | OTROS`.

`MonthRecord.income` is **deprecated** — kept for one release as a
denormalised cache, ignored by all new reads. A separate migration in the
next release will drop the column.

## Contracts

### REST (all behind `withApi()` + session auth)

- `GET /api/incomes` → list templates.
- `POST /api/incomes` → create. Body: `incomeSchema`.
- `PATCH /api/incomes/[id]` → update. Body: `incomeSchema` (subset).
- `DELETE /api/incomes/[id]` → delete (lines stay, `templateId=null`).
- `GET /api/months/[month]/incomes` → list lines for the month.
- `POST /api/months/[month]/incomes` → create a line in the **current**
  month only. Body: `monthIncomeLineCreateSchema`. Returns
  `{ duplicate: true }` on the partial unique violation.
- `PATCH /api/months/[month]/incomes/[id]` → update fields. Body:
  `monthIncomeLineUpdateSchema`. Toggling `received` is the most common
  call (mirror of toggling `paid` on expenses).
- `DELETE /api/months/[month]/incomes/[id]` → delete a line.
- `PATCH /api/months/[month]` (legacy `monthlyIncomeSchema` body) → **410
  Gone** with a migration message; deleted in the next release.

### Agent tools

All under [`src/lib/ai/expense-tools.ts`](../../src/lib/ai/expense-tools.ts):

- `createIncomeTemplate`, `updateIncomeTemplate`, `deleteIncomeTemplate`,
  `listIncomeTemplates`.
- `addIncomeLine` — one-off cobro in current month, default
  `received=true`. Surfaces `duplicate=true` on dedupe collision.
- `updateIncomeLine`, `deleteIncomeLine`, `markIncomeReceived`,
  `markIncomeUnreceived`.

### MCP tools (per-user server)

Mirror the expense surface: `list_incomes`, `create_income`, `update_income`,
`delete_income`, `list_month_income_lines`, `create_month_income_line`,
`update_month_income_line`, `delete_month_income_line`. Resources expose
`incomes` and `monthIncomeLines` collections.

## Invariants

- Every `MonthIncomeLine` belongs to exactly one `MonthRecord`, which
  belongs to exactly one `User`.
- `amountConverted` is computed at creation time using the user's primary
  currency and the FX rate **at that moment**. Editing a line only
  recomputes the conversion if `amount`, `currency` or `fxRate` change.
- The balance only counts lines where `received=true`. Expected-but-not-yet
  income never inflates the balance.
- Dedupe (partial unique index) is scoped to **manual** lines
  (`templateId IS NULL`); template-derived lines are intentionally allowed
  to coexist with a manual entry of the same shape.
- `Bank` is **optional** on income (incomes typically land on the user's
  default account; forcing a bank adds friction in chat).
- `User.monthlyIncome` is **legacy** — kept in the schema for one release.
  No new code reads it; onboarding writes the first `Income` template
  instead.

## Known gaps / TODOs

- Drop `MonthRecord.income` and `User.monthlyIncome` columns in the next
  release once production data has been observed without regressions.
- Onboarding only seeds **one** template; users with multiple incomes still
  need to add the rest from `/incomes` or chat.
- No CSV/photo importer for incomes yet — `addIncomeLine` is the only fast
  path. Expense importers are richer; revisit when the agent starts seeing
  payslip PDFs.
- No FX-only income reports (e.g. "how much USD landed this year"). The
  primary-currency total is the only aggregate exposed today.

## Related

- Design doc: see [`design-docs/index.md`](../design-docs/index.md) for
  EUR-base data model + FX freezing patterns shared with expenses.
- Sister spec: expenses (the symmetric counterpart — same skeleton,
  different sign).
- Skill: [`.cursor/skills/engineer-data/SKILL.md`](../../.cursor/skills/engineer-data/SKILL.md).
