# telegram-daily-nudge

> Proactive daily reminder Clara sends over Telegram when a user has not
> logged any expense, income or manual savings movement during their local
> day. Default ON for linked users; togglable from Settings.

## What it does

- **Hourly cron** `/api/cron/daily-nudge` (`vercel.json` `crons`) scans users
  with Telegram linked and checks whose local clock currently reads 20:00
  (overridable per deploy via `NUDGE_HOUR_LOCAL`).
- For each candidate we compute their local-day UTC window via
  [`src/lib/timezone.ts`](../../src/lib/timezone.ts) using
  `User.country` → IANA timezone. Unknown countries fall back to UTC.
- If the user already received a nudge within the same local-day window
  (`telegramNudgeLastSentAt`) we skip — hard idempotency guard against
  cron retries.
- If `userLoggedFinancialActivityToday` returns `true` (any
  `MonthExpenseLine` / `MonthIncomeLine` / `MANUAL_DEPOSIT` /
  `MANUAL_WITHDRAWAL` whose `occurredOn` OR `createdAt` falls inside the
  local-day window), we skip.
- Otherwise we call `generateSystemInitiatedReply` — a dedicated tool-less,
  quota-free agent path — to compose a 1–3 sentence message, send it via
  `sendTelegramHtmlMessage`, and persist the turn as a `TelegramMessage`
  with `role = "assistant"`.
- A deterministic localized fallback runs when the AI call throws (gateway
  outage, rate limit) so the cron never sends an empty message.
- Users opt out from **Settings → Integrations → Telegram** by flipping
  the "Recordatorios diarios" switch. The `PATCH /api/settings/telegram`
  endpoint updates `User.telegramNudgeEnabled`.

## Where the code lives

| Layer | Path |
|-------|------|
| Types / validators | inline in the route + `zod` in [`src/app/api/settings/telegram/route.ts`](../../src/app/api/settings/telegram/route.ts) |
| Country → IANA map + time helpers | [`src/lib/timezone.ts`](../../src/lib/timezone.ts) |
| Activity-today check | [`src/lib/activity-today.ts`](../../src/lib/activity-today.ts) |
| System-initiated agent path | `generateSystemInitiatedReply` in [`src/lib/ai/run-expense-agent.ts`](../../src/lib/ai/run-expense-agent.ts) |
| Nudge loop + `CRON_SECRET` verification | [`src/lib/telegram/daily-nudge.ts`](../../src/lib/telegram/daily-nudge.ts) |
| Bot API send | `sendTelegramHtmlMessage` in [`src/lib/telegram/client.ts`](../../src/lib/telegram/client.ts) |
| Cron route | [`src/app/api/cron/daily-nudge/route.ts`](../../src/app/api/cron/daily-nudge/route.ts) |
| Cron schedule | [`vercel.json`](../../vercel.json) (`crons[0]`) |
| Settings API toggle | [`src/app/api/settings/telegram/route.ts`](../../src/app/api/settings/telegram/route.ts) (`GET` + new `PATCH`) |
| Settings UI toggle | `TelegramLinkCard` in [`src/components/settings-manager.tsx`](../../src/components/settings-manager.tsx) |
| DB / Prisma | [`prisma/schema.prisma`](../../prisma/schema.prisma) — `User.telegramNudgeEnabled`, `User.telegramNudgeLastSentAt` |
| Migration | [`prisma/migrations/20260502220000_telegram_daily_nudge/`](../../prisma/migrations/20260502220000_telegram_daily_nudge/) |
| Marketing copy | `PRIVACY_SECTIONS` (ES + EN) in [`src/lib/marketing-content.ts`](../../src/lib/marketing-content.ts) |
| Tests | [`src/lib/timezone.test.ts`](../../src/lib/timezone.test.ts), [`src/lib/activity-today.test.ts`](../../src/lib/activity-today.test.ts), [`src/lib/telegram/daily-nudge.test.ts`](../../src/lib/telegram/daily-nudge.test.ts) |

## Data model

Two new columns on `User`:

- `telegramNudgeEnabled Boolean @default(true)` — per-user kill switch.
- `telegramNudgeLastSentAt DateTime?` — same-local-day idempotency guard.

`TelegramMessage` is reused unchanged to persist the outbound turn
(`role = "assistant"`, regular `chatId` / `userId` columns). No new table.

## Contracts

### API

- **`GET /api/settings/telegram`** — response gains `nudgeEnabled: boolean`.
- **`PATCH /api/settings/telegram`** — body `{ nudgeEnabled: boolean }`;
  response `{ ok: true, nudgeEnabled }`. Auth: `requireUserId()`.
- **`DELETE /api/settings/telegram`** (existing) — now also resets
  `telegramNudgeEnabled` to `true` and `telegramNudgeLastSentAt` to `null`,
  so re-linking starts from a clean preference.
- **`POST|GET /api/cron/daily-nudge`** — auth: `Authorization: Bearer $CRON_SECRET`
  header (Vercel Cron injects it). Returns `{ ok: true, ...RunDailyNudgeStats }`.

### Outbound

- **Telegram Bot API `sendMessage`** with `parse_mode = HTML` via
  `sendTelegramHtmlMessage`. No extra permissions beyond the existing bot
  token.

## Invariants

- **Nothing sent if the user did not link Telegram.** The query filters on
  `telegramChatId NOT NULL AND telegramVerifiedAt NOT NULL AND telegramNudgeEnabled = true AND isActive = true`.
- **At most one nudge per user per local day.**
  `telegramNudgeLastSentAt` inside the current local-day window ⇒ skip.
- **No quota consumption.** `generateSystemInitiatedReply` does NOT call
  `consumeAgentQuota`; user-initiated chat turns keep the full daily cap.
- **No tools, no history.** The system-initiated path exposes `tools: {}`
  and `stopWhen: stepCountIs(1)`. The model cannot mutate user data or see
  prior messages during the nudge — it only sees the single prompt we
  supply (no PII beyond `locale`).
- **Graceful AI fallback.** If the model call throws, a deterministic
  localized fallback string ships so the cron never sends an empty
  message.
- **Timezone inference is best-effort.** `countryToTimezone` is a fixed
  ISO-2 → IANA table. Unknown / null countries default to UTC; those
  users receive the nudge at 20:00 UTC rather than their actual local
  time. Adding more countries is a matter of expanding the map.
- **Observability.** Each agent call ships with
  `feature:system-nudge` + `kind:telegram_daily_nudge` + `locale:*` tags
  so Vercel AI Gateway splits the cost of outbound automation from chat.

## Environment variables

- `CRON_SECRET` — shared secret Vercel Cron sends as
  `Authorization: Bearer <secret>`. Required; the handler fails closed
  when unset.
- `NUDGE_HOUR_LOCAL` — optional integer 0-23. Default `20`. Override
  per-deploy for staging / manual tests.
- Reuses existing Telegram / AI Gateway env vars
  (`TELEGRAM_BOT_TOKEN`, `AI_MODEL`, etc.).

## Legal / compliance

This feature triggers both `.cursor/skills/legal-advisor/SKILL.md`
(new user data + outbound automated messaging + AI prompt changes) and
`.cursor/skills/automated-user-comms/SKILL.md` (cadence, honesty, data
minimisation). Specifically:

- **Consent basis.** Linking Telegram is itself a voluntary action that
  activates the bidirectional channel. The daily nudge is disclosed in
  [`PRIVACY_SECTIONS`](../../src/lib/marketing-content.ts) section 3 (ES
  and EN). The Settings toggle lets the user opt out any time without
  breaking the link.
- **Cadence.** Max one message per user per local day per surface —
  enforced by `telegramNudgeLastSentAt`.
- **Data minimisation.** The prompt sent to the model contains only
  `locale` and the template strings. It does NOT include `country`,
  financial totals, names, amounts or anything the user did not
  explicitly log.
- **No financial advice.** The system prompt explicitly forbids
  "deberías", "te conviene" and similar.
- **Respects `isActive=false`** via the candidate query.

## Known gaps / TODOs

- Timezone map is manual. Consider capturing an IANA zone on the User
  during onboarding (explicit picker or `Intl.DateTimeFormat().resolvedOptions().timeZone`
  from the browser) to cover US/CA/AU/BR edge cases accurately.
- The nudge is Telegram-only. A future email-based nudge (for users
  who have not linked Telegram) would reuse `generateSystemInitiatedReply`
  with a new `SystemNudgeKind`.
- No in-product UI that shows "you received N nudges this month"; the
  data is in `TelegramMessage` but not surfaced.
- No digest variant. A weekly summary nudge could share the same cron
  slot with a `kind` discriminator.

## Related

- Spec: [`telegram`](./telegram.md) (inbound channel, shared webhook, client).
- Skill: [`.cursor/skills/automated-user-comms/SKILL.md`](../../.cursor/skills/automated-user-comms/SKILL.md).
- Skill: [`.cursor/skills/legal-advisor/SKILL.md`](../../.cursor/skills/legal-advisor/SKILL.md).
