# events (event wallets)

> Time-bound spend buckets that group expenses across one or several months
> (e.g. a trip, a wedding, a birthday) and surface them as a single
> collapsible row in the monthly dashboard.

## What it does

The user creates an "event wallet" with a name and a date range (e.g.
"Mendoza trip · 2026-04-15 → 2026-05-05"). Any expense whose `occurredOn`
falls inside the range can be tagged with the event — Clara auto-suggests
the tag when the expense smells trip-related. While the event is **OPEN**,
each expense lives in its real `MonthRecord` (so monthly aggregations stay
honest) but the chronological view groups them under one collapsible row
showing the running total. When the user closes the event, they pick how to
attribute the spend:

- `LUMP_SUM` (default): every line is rebucketed into a single
  `attributionMonth` (preserving `occurredOn` for audit). Useful when the
  user mentally treats the trip as one chunk of a single month's budget.
- `BY_DATE`: lines stay where they were. Useful when each calendar month
  should keep its real spend.

Reopening a closed event reverses a `LUMP_SUM` close (lines move back to
the month their `occurredOn` belongs to, creating any missing
`MonthRecord` on the fly).

## Where the code lives

| Layer | Path |
|-------|------|
| Types / validators | `src/lib/validators.ts` (`eventCreateSchema`, `eventUpdateSchema`, `eventCloseSchema`, `eventAttachLineSchema`) |
| DB / Prisma model | `prisma/schema.prisma` (`Event`, `EventStatus`, `EventAttributionMode`, `MonthExpenseLine.eventId`) |
| Service | `src/lib/events.ts` (`createEvent`, `updateEvent`, `closeEvent`, `reopenEvent`, `attachLineToEvent`, `detachLineFromEvent`, `listEvents`, `getActiveEventsAt`, `isDateInEventRange`) |
| API routes | `src/app/api/events/**` (`GET/POST /api/events`, `GET/PATCH/DELETE /api/events/[id]`, `POST /api/events/[id]/close`, `POST /api/events/[id]/reopen`, `POST /api/events/[id]/lines`, `DELETE /api/events/[id]/lines/[lineId]`) |
| Agent tools | `src/lib/ai/expense-tools.ts` (`listEvents`, `getActiveEvents`, `getEvent`, `createEvent`, `updateEvent`, `closeEvent`, `reopenEvent`, `deleteEvent`, `attachLineToEvent`, `detachLineFromEvent`; `addMonthLine` extended with optional `eventId`) |
| Agent prompt | `src/lib/ai/run-expense-agent.ts` (event-wallet block in both ES and EN system prompts) |
| MCP tool(s) | `src/lib/mcp/user-server.ts` (`listEvents`, `getActiveEvents`, `getEvent`, `createEvent`, `closeEvent`, `reopenEvent`, `attachExpenseToEvent`, `detachExpenseFromEvent` — destructive ones gated by `confirm: true`) |
| UI | `src/app/(app)/events/page.tsx` (list), `src/app/(app)/events/[id]/page.tsx` (detail), `src/components/events-manager.tsx`, `src/components/event-detail.tsx`, collapsible row in `src/components/month/month-lines-chronological.tsx` |
| Tests | `src/lib/events.test.ts`, `src/lib/ai/expense-tools.test.ts` (`addMonthLine — eventId validation`) |

## Data model

```
model Event {
  id                  String                @id @default(cuid())
  userId              String
  name                String
  color               String?
  startDate           DateTime              @db.Date
  endDate             DateTime?             @db.Date  // null = open-ended
  status              EventStatus           @default(OPEN)
  attributionMode     EventAttributionMode  @default(LUMP_SUM)
  attributionMonthId  String?               // FK to MonthRecord, SetNull
  closedAt            DateTime?
  ...
  @@index([userId, status])
  @@index([attributionMonthId])
}

enum EventStatus            { OPEN, CLOSED }
enum EventAttributionMode   { BY_DATE, LUMP_SUM }

model MonthExpenseLine {
  ...
  eventId  String?       // FK to Event, SetNull
  event    Event?        @relation(fields: [eventId], references: [id], onDelete: SetNull)
  @@index([eventId])
}
```

Migration: `prisma/migrations/20260502120000_event_wallets/migration.sql`
(additive — creates the enums, the `Event` table, and the `eventId` column
on `MonthExpenseLine`; no backfill needed).

## Contracts

REST (all wrapped by `withApi()`):

- `GET  /api/events?status=OPEN|CLOSED` — list events for the user.
- `POST /api/events` — body validated by `eventCreateSchema`. 201 with
  `{ event }`.
- `GET    /api/events/[id]` — 200 / 404.
- `PATCH  /api/events/[id]` — body validated by `eventUpdateSchema`. 409 if
  the event is `CLOSED` (force the user through `reopen` first).
- `DELETE /api/events/[id]` — detaches all lines (FK `SetNull`) and removes
  the event.
- `POST /api/events/[id]/close` — body validated by `eventCloseSchema`.
  Required `attributionMonth` (yyyy-MM) when `attributionMode = LUMP_SUM`.
- `POST /api/events/[id]/reopen` — flips status back to `OPEN`. Lines that
  were rebucketed in `LUMP_SUM` mode return to their real-month buckets.
- `POST   /api/events/[id]/lines` — body `{ lineId }`; attaches an existing
  `MonthExpenseLine` to the event. Returns `outOfRange: true` when the
  line's `occurredOn` is outside the event's range (still attaches, but the
  caller can warn the user).
- `DELETE /api/events/[id]/lines/[lineId]` — clears the line's `eventId`.

Agent tools (`buildExpenseTools`):

- `listEvents`, `getActiveEvents`, `getEvent` — read-only.
- `createEvent`, `updateEvent`, `closeEvent`, `reopenEvent`, `deleteEvent`,
  `attachLineToEvent`, `detachLineFromEvent` — write.
- `addMonthLine` accepts an optional `eventId`. When the line's
  `occurredOn` is outside the event's range, the tool refuses with
  `error: "...outside the event ... range..."` so the agent can ask the
  user before tagging.

MCP per-user (`/api/mcp/user`, bearer-auth): same surface as agent tools,
with destructive operations (`closeEvent`, `attachExpenseToEvent`,
`detachExpenseFromEvent`) gated by `confirm: true` per the project
convention for MCP write tools.

## Invariants

- While `status = OPEN`: every `MonthExpenseLine.eventId = event.id` lives
  in the `MonthRecord` whose start date matches its `occurredOn`. The
  `eventId` is purely a tag.
- When closing with `attributionMode = LUMP_SUM`: every event line's
  `monthRecordId` is set to `attributionMonthId` in a single
  `db.$transaction`. `occurredOn` is preserved (audit trail). The dedupe
  index on `MonthExpenseLine` does **not** include `monthRecordId`, so
  rebucketing never violates uniqueness.
- When closing with `attributionMode = BY_DATE`: lines are not moved.
  `attributionMonthId` stays `null`.
- When reopening from `LUMP_SUM`: each line is moved back to the
  `MonthRecord` matching its `occurredOn`. Missing destination months are
  created on demand (empty bucket).
- `Event.attributionMonth.onDelete = SetNull`: deleting the destination
  `MonthRecord` doesn't cascade-delete the event; it just loses its
  destination pointer (lines were already moved at close-time and are
  preserved by `MonthExpenseLine`'s own constraints).
- `MonthExpenseLine.event.onDelete = SetNull`: deleting an event keeps the
  expense lines (they reappear as standalone expenses in their original
  month).
- `endDate >= startDate` is enforced at create/update time (`Error("EVENT_INVALID_RANGE")` → 400).
- The agent must **ask** before tagging an expense whose name/category
  looks unrelated to a trip (e.g. recurring template names, categories
  like `VIVIENDA` / `SUSCRIPCIONES`) even when the date matches — see the
  prompt block in `run-expense-agent.ts`.

## Known gaps / TODOs

- **Income / refunds**: events only group expenses today. A travel
  reimbursement received after the trip is logged as a regular income line
  with no link back to the event. We'll revisit when there's a clear
  ask — likely as `EventIncomeLink` rather than reusing `Event`.
- **Per-event budget + alerts**: not implemented. Hook into the future
  `budgets-and-alerts` spec when it lands.
- **Split-bill within an event**: equal-split between participants is
  now covered by [`event-sharing`](event-sharing.md). Tip- or item-level
  custom splits are still TODO.
- **Multi-currency snapshot**: event totals use the existing per-line
  `amountConverted` (snapshot in the user's primary currency at the moment
  of entry). FX drift across the event window is not corrected.
- **Reopen semantics**: reopening a `BY_DATE` close is currently a no-op
  on lines (correct), but the UI doesn't visually distinguish the two
  reopen flows. Cosmetic only.
- **Bulk attach from the dashboard**: today the user attaches lines via
  chat, the event detail page (`/events/[id]`) only supports detach. A
  future iteration should let the dashboard select multiple lines and tag
  them in one click.

## Related

- Design doc: pending — relevant cross-cutting beliefs are captured in
  `knowledge/design-docs/data-model-eur-base-currency.md` and the existing
  expense-line dedupe migration (`prisma/migrations/20260429140000_expense_dedup`).
- Skill: none yet (consider creating
  `.cursor/skills/engineer-events/SKILL.md` once the surface stabilises).
