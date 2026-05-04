# banks

> Per-user list of banks / wallets / cards used to route every expense
> and (optionally) income. Required on expense templates and lines;
> optional on income. Restrict-on-delete because lines reference them.

## What it does

A `Bank` represents wherever the user's money flows through — a real
bank account, a cash wallet, a credit card line. The user adds them in
`/settings → Bancos` or via the agent (`createBank`). Every
`MonthExpenseLine` and `Expense` template **must** be assigned to a
bank; income lines and income templates may be (it's a soft hint).

The dashboard groups lines by bank for the "what's pending in each
account" view. The agent uses `listBanks` whenever the user names a
bank ("cargá esto en Galicia") so it can resolve to the right id.

## Where the code lives

| Layer | Path |
|-------|------|
| Prisma model | [`prisma/schema.prisma`](../../prisma/schema.prisma) — `Bank` |
| Agent tools | [`src/lib/ai/expense-tools.ts`](../../src/lib/ai/expense-tools.ts) — `listBanks`, `createBank`, `updateBank`, `deleteBank` |
| REST API | [`src/app/api/banks/`](../../src/app/api/banks) |
| Settings UI | `/settings → Bancos` (under [`src/app/(authed)/settings`](../../src/app/(authed))) |
| Per-user MCP exposure | [`src/lib/mcp/user-server.ts`](../../src/lib/mcp/user-server.ts) (mirror of the agent tools) |

## Data model

`Bank`:

| Field | Type | Notes |
|-------|------|-------|
| `id` | `String @id @default(cuid())` | |
| `userId` | `String` | Cascade. |
| `name` | `String` | `@@unique([userId, name])` — case-sensitive uniqueness per user. |
| `color` | `String?` | Optional `#rrggbb` hex used for the bank "dot" in the dashboard. |
| Backrefs | `expenses`, `incomes`, `monthExpenseLines`, `monthIncomeLines` | All point at this bank with `onDelete: Restrict` for the expense side, optional for income. |

## Contracts

### Reads

`listBanks()` (agent tool / REST `GET /api/banks`):

- Returns `[{ id, name, color }]` for the authenticated user.
- Cached by Runtime Cache with a `bank:list:<userId>` tag (see
  [`src/lib/cache/`](../../src/lib/cache)). Mutations invalidate.

### Writes

| Surface | Tool | Notes |
|---------|------|-------|
| `POST /api/banks` | `createBank` | `{ name, color? }`. `P2002` on the unique constraint surfaces as "ya existe un banco con ese nombre". |
| `PATCH /api/banks/[id]` | `updateBank` | Pass only changed fields. |
| `DELETE /api/banks/[id]` | `deleteBank` | **Restrict on delete.** If any template / line points at it, the agent must offer to reassign or delete those first. |

### Agent flow for delete (from prompt)

1. User: "borrá el banco *Brubank*".
2. Agent: short confirmation question.
3. User: "sí".
4. Agent: `deleteBank({ id })`.
5. If the tool returns "tiene plantillas/líneas asociadas", the
   agent offers to reassign with `updateExpenseTemplate` /
   `updateMonthLine` (`bankId`) or to delete the affected records
   first.

## Invariants

- **`bankId` is required on `Expense` and `MonthExpenseLine`.** The
  schema enforces it (`bankId String`, no `?`).
- **`bankId` is optional on `Income` and `MonthIncomeLine`.** Some
  income flows don't care which account received the money.
- **Unique by `(userId, name)`.** A user can't create two banks with
  the same name; rename or delete first.
- **Restrict on delete.** Don't soft-delete banks; force the user to
  resolve the FKs.
- **Color is purely cosmetic.** The dashboard reads it; nothing else
  depends on it.
- **Per-user namespace.** Two users can both have "Galicia" — they
  are different `Bank.id`s.
- **Cache invalidation on every mutation.** Runtime Cache tag
  `bank:list:<userId>` gets dropped by `createBank`, `updateBank`,
  `deleteBank`.

## Known gaps / TODOs

- No bank "type" classification (cash, debit, credit, savings) —
  everything is just a `Bank`. Fine for v1; add when reports need
  it.
- No per-bank currency hint. A USD-only account is no different
  from an ARS-only account from the schema's POV; the user / agent
  has to remember.
- We don't enforce a max number of banks; users can create dozens.
  If the chat starts struggling to disambiguate, add a soft cap.
- The unique-by-name constraint is case-sensitive. "Galicia" and
  "galicia" are different rows. Probably fine; fix with `@@unique`
  on a normalised expression if it becomes an issue.
- No archive flag — a bank either exists or it's deleted.
  "Inactive but historical" isn't a state we model today.

## Related

- Spec: [`months-and-templates`](months-and-templates.md) — every
  expense line points at a bank.
- Spec: [`ai-agent`](ai-agent.md) — `listBanks` is one of the
  highest-frequency agent tool calls.
- Spec: [`mcp-per-user`](mcp-per-user.md) — same CRUD surface,
  external clients.
- Skill: [`engineer-data`](../../.cursor/skills/engineer-data/SKILL.md)
- Design doc: [`with-api-error-handling`](../design-docs/with-api-error-handling.md)
  — `P2002` from the unique index translates to `409 "Already
  exists."` automatically.
