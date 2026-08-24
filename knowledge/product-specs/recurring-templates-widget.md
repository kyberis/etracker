# recurring-templates-widget

> After an import (or when the user asks), Clara shows an in-chat
> checklist of expenses that look recurring. The user ticks which ones
> should become templates; confirming creates `Expense` rows via
> `/api/expenses/bulk` — no second LLM turn.

## What it does

1. Clara calls `proposeRecurringTemplates` with a list of candidates
   (name, amount in primary currency, bankId, startMonth, optional
   category/reason, `suggested` pre-check).
2. The web chat renders [`ChatRecurringPicker`](../../src/components/chat-recurring-picker.tsx).
3. The user selects rows and taps "Crear plantillas".
4. The client POSTs to `/api/expenses/bulk`; the widget shows a success
   state listing the created templates.

Telegram has no interactive widget: the agent lists candidates in text
and uses `createExpenseTemplate` after the user picks.

## Where the code lives

| Layer | Path |
|-------|------|
| Spec (Zod) | [`src/lib/ai/recurring-candidates-spec.ts`](../../src/lib/ai/recurring-candidates-spec.ts) |
| Agent tool | [`src/lib/ai/expense-tools.ts`](../../src/lib/ai/expense-tools.ts) (`proposeRecurringTemplates`) |
| Prompt rules | [`src/lib/ai/run-expense-agent.ts`](../../src/lib/ai/run-expense-agent.ts) |
| Bulk API | [`src/app/api/expenses/bulk/route.ts`](../../src/app/api/expenses/bulk/route.ts) |
| Widget UI | [`src/components/chat-recurring-picker.tsx`](../../src/components/chat-recurring-picker.tsx) |
| Chat wiring | [`src/components/chat-experience.tsx`](../../src/components/chat-experience.tsx) |

## Data model

No new tables. Creates existing `Expense` templates (`isRecurring: true`)
via the same fields as `POST /api/expenses`.

## Contracts

- Tool `proposeRecurringTemplates` — input = `recurringCandidatesSpecSchema`;
  execute echoes `{ ok, spec }`.
- `POST /api/expenses/bulk` — body `{ templates: expenseSchema[] }` (1–40);
  201 `{ ok, created, expenses }`; 404 if any bankId is missing.

## Invariants

- Amounts on candidates are in the user's **primary currency** (template
  storage rule).
- Web: agent must not also call `createExpenseTemplate` for the same
  rows after proposing the widget.
- Skip candidates that already match `listExpenseTemplates` (same
  name+amount+bank).
- Guest users do not get this tool.

## Related

- Spec: [`months-and-templates`](months-and-templates.md)
- Spec: [`import-pdf-image`](import-pdf-image.md)
- Spec: [`ai-agent`](ai-agent.md)
