# import-pdf-image

> Drop a bank screenshot, a PDF statement, a CSV, or a voice note
> into Clara. The agent extracts movements, asks for confirmation,
> and writes them as `MonthExpenseLine`s with the **real** transaction
> date — never silently defaulting to today.

## What it does

The user can ingest expenses through any of:

- **Web upload** — drag a PDF / image / CSV into the chat composer.
- **Telegram message** — send a photo, document (PDF or CSV), voice note,
  or paste a CSV / list as text.

Clara then:

1. Pre-processes the artefact into model-readable content:
   - Image → image content block forwarded to the agent's chat call.
   - Voice → Whisper STT (`transcribe-audio.ts`), result is
     prepended as text.
   - PDF → text extraction (and page images for scanned PDFs).
   - CSV → kept as text in the message.
2. The agent, guided by the prompt's `Imagen` / `PDF` / `CSV`
   sections, extracts each transaction with description, amount,
   currency, and **transaction date**.
3. Replies with a compact list grouped by bank ("28/04 - Café
   Martínez - ARS 4.500") and asks the user to confirm before any
   tool call.
4. On confirmation: calls `addMonthLine` (or `updateMonthLine` if a
   matching line already exists) for each row, with `occurredOn` =
   the real transaction date.
5. Respects the user's
   [`expenseImportInstructions`](../../prisma/schema.prisma) — free-text
   rules like "ignore Visa interest", "always categorise Pedidos Ya as
   ALIMENTACION", "mark imports from Galicia as paid".

## Where the code lives

| Layer | Path |
|-------|------|
| Attachment MIME helpers | [`src/lib/chat/attachment-types.ts`](../../src/lib/chat/attachment-types.ts) |
| CSV formatting | [`src/lib/chat/bank-csv-for-agent.ts`](../../src/lib/chat/bank-csv-for-agent.ts) |
| PDF extract (web + Telegram) | [`src/lib/pdf-extract.ts`](../../src/lib/pdf-extract.ts) |
| Whisper STT | [`src/lib/ai/transcribe-audio.ts`](../../src/lib/ai/transcribe-audio.ts) |
| Agent loop (prompt rules for image / PDF / CSV / dates) | [`src/lib/ai/run-expense-agent.ts`](../../src/lib/ai/run-expense-agent.ts) |
| Tool registry (`addMonthLine`, `updateMonthLine`) | [`src/lib/ai/expense-tools.ts`](../../src/lib/ai/expense-tools.ts) |
| Personal import instructions | [`src/lib/ai/expense-tools.ts`](../../src/lib/ai/expense-tools.ts) (`updateExpenseImportInstructions` tool) + [`src/app/api/settings/`](../../src/app/api/settings) |
| Web chat upload | [`src/app/api/chat/`](../../src/app/api/chat) |
| Telegram ingest | [`src/app/api/webhooks/telegram/`](../../src/app/api/webhooks/telegram) |
| Dedup index migration | [`prisma/migrations/`](../../prisma/migrations) (`20260429140000_expense_dedup`) |

## Data model

No dedicated tables — imports land in `MonthExpenseLine` and surface
two specific behaviours:

- `MonthExpenseLine.occurredOn` carries the **real** transaction
  date.
- `MonthExpenseLine.templateId = NULL` (always; imports are
  one-shot).
- A SQL-only **partial unique index** on `(userId, occurredOn,
  lower(trim(name)), amount, currency)` WHERE `templateId IS NULL`
  prevents duplicate imports.

User-side knob:

- `User.expenseImportInstructions` — free-text up to a few KB. Fed
  into the agent's system prompt as a high-priority rule block.

## Contracts

### Agent prompt rules (HARD)

The agent's system prompt includes these rules verbatim (see
`run-expense-agent.ts` for the EN / ES versions):

1. **Date is mandatory and real.** "For every transaction you are
   about to log from a screenshot, photo, receipt, PDF or CSV, read
   the ACTUAL transaction date (with day, not just the month) and
   pass it as `occurredOn` in yyyy-MM-dd to addMonthLine /
   addIncomeLine."
2. **Show the date in the confirmation list.** "28/04 - Café
   Martínez - ARS 4.500".
3. **No silent defaults to today.** When the date is unreadable,
   ambiguous, or the year is unclear, the agent ASKS the user before
   logging.
4. **Personal instructions win.** Apply the user's
   `expenseImportInstructions` when categorising / deciding what to
   ignore / how to mark paid.
5. **Confirm before writing.** Always present a compact list and ask
   "¿Lo cargo?" before invoking tools.
6. **Group by bank in the confirmation list.** Easier to scan
   multi-source statements.

### Voice ingest (Telegram)

- Voice ≤ 10 minutes (configurable). Longer voice notes get a
  localised "voice too long" reply.
- Whisper language hint = `User.locale`.
- Transcript is prepended as the first user message in the agent's
  history; the agent treats it as text input.

### CSV ingest

- Treated like an image-extracted statement: same date rule, same
  confirmation, same dedupe index.
- Web: client-side parse via `bank-csv-for-agent.ts` before the agent
  turn. Telegram: CSV **documents** download server-side and use the
  same formatter; pasted CSV text still works as before.
- Multiple banks in one CSV → grouped in the confirmation list per
  bank.

### Image / PDF ingest

- Image content blocks ride inside the agent's chat message; the
  Vercel AI Gateway proxies them to OpenAI vision-capable models.
- Scanned PDFs ship both extracted text AND page images.
- Native PDFs ship extracted text only.

## Invariants

- **Real transaction date or ask.** No silent `todayUtcDate()` for
  artefact-derived lines.
- **Confirmation gate.** No `addMonthLine` call without an explicit
  user yes per import.
- **Personal rules in the prompt, not in code.** Don't inline
  user-specific logic into the agent code; let the user own it via
  `updateExpenseImportInstructions`.
- **`paid = true` for confirmed imports.** Imports represent
  movements that already happened.
- **`templateId = NULL` for imports.** They never bind to a
  recurring template.
- **Dedupe is silent.** A duplicate Prisma `P2002` on the partial
  unique index is translated to "ya estaba cargado" and the
  remaining rows still process.
- **Currency is honoured per line.** If the statement is in ARS and
  the user's primary is USD, the line carries `currency: "ARS"`,
  `fxRate` and `amountConverted` get computed and frozen.

## Known gaps / TODOs

- We don't expose a "preview imports" UI in the web yet — the chat
  is the only confirmation surface.
- The agent decides categories per row; bulk re-categorisation post
  import is a manual edit per line.
- We don't keep the original artefact (screenshot / PDF) by design
  (privacy). If a user wants to re-process, they must re-upload.
- Voice transcription quality is locale-dependent; for Spanish-EN
  code-switching the model sometimes mis-transcribes amounts.
- We don't yet support multi-user CSV uploads (e.g. couples sharing
  a statement); that becomes meaningful when event wallets get bank
  feeds.
- The dedupe index treats two visually identical names with
  different whitespace / casing as the same; works on `lower(trim())`
  only. Catches the common case; misses Unicode normalisation.

## Related

- Spec: [`ai-agent`](ai-agent.md)
- Spec: [`months-and-templates`](months-and-templates.md) — the
  destination of every import.
- Spec: [`telegram`](telegram.md) — the secondary ingest surface.
- Design doc: [`ai-gateway-routing`](../design-docs/ai-gateway-routing.md)
  — Whisper / vision routing.
- Skill: [`engineer-integrations`](../../.cursor/skills/engineer-integrations/SKILL.md)
