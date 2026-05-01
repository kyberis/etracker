# telegram

> Second conversational channel for Clara. Users link their Telegram chat to
> their account via a signed deep link, then chat with Clara from Telegram
> using the same agent loop, tools and quota as the web chat.

## What it does

- The user opens **Settings → Integrations → Telegram** in the web app and
  clicks **Conectar Telegram**. The server mints an HMAC-signed token and
  opens `https://t.me/<bot>?start=<token>` in a new tab.
- Tapping **Start** in Telegram pipes `/start <token>` to the bot. Our
  webhook verifies the HMAC, persists `telegramUserId` / `telegramUsername`
  / `telegramChatId` / `telegramVerifiedAt`, and replies with a localized
  welcome message that includes an inline-keyboard menu.
- Once linked, the user can send text, photos (treated as images for the
  multimodal agent) or voice notes (transcribed via Whisper) and Clara
  replies in their preferred language.
- Slash commands: `/start`, `/help`, `/menu` (re-renders the inline keyboard),
  `/unlink` (clears the four `telegram*` columns).
- Group support is **stubbed** today: the bot only responds in private chats.
  When mentioned in a group it replies with a one-time notice and otherwise
  ignores. The schema (`TelegramMessage.chatId`, `TelegramMessage.isGroup`)
  is ready for a future "Clara in groups" rollout.

## Where the code lives

| Layer | Path |
|-------|------|
| Bot API client | [`src/lib/telegram/client.ts`](../../src/lib/telegram/client.ts) |
| Signed deep-link tokens | [`src/lib/telegram/link.ts`](../../src/lib/telegram/link.ts) |
| Slash commands + inline menu | [`src/lib/telegram/menu.ts`](../../src/lib/telegram/menu.ts) |
| Webhook handler | [`src/app/api/webhooks/telegram/route.ts`](../../src/app/api/webhooks/telegram/route.ts) |
| Settings API | [`src/app/api/settings/telegram/route.ts`](../../src/app/api/settings/telegram/route.ts) |
| Settings UI card | `TelegramLinkCard` in [`src/components/settings-manager.tsx`](../../src/components/settings-manager.tsx) |
| Onboarding entry-point | `TelegramOnboardingButton` in [`src/app/(onboarding)/onboarding/wizard.tsx`](../../src/app/(onboarding)/onboarding/wizard.tsx) |
| DB / Prisma model | [`prisma/schema.prisma`](../../prisma/schema.prisma) — `User.telegram*` columns + `TelegramMessage` model |
| Migration | [`prisma/migrations/20260430140000_telegram_channel/`](../../prisma/migrations/20260430140000_telegram_channel/) |
| Setup script | [`scripts/setup-telegram-webhook.mjs`](../../scripts/setup-telegram-webhook.mjs) |
| Tests | [`src/lib/telegram/link.test.ts`](../../src/lib/telegram/link.test.ts), [`src/lib/telegram/client.test.ts`](../../src/lib/telegram/client.test.ts) |

## Data model

`User` gains four columns:

- `telegramUserId BigInt? @unique` — Telegram's stable numeric id (lookup key).
- `telegramUsername String?` — current `@handle`, informational; can change.
- `telegramChatId BigInt?` — chat id of the private 1:1 chat. Cached so we
  don't need a lookup to send outbound messages.
- `telegramVerifiedAt DateTime?` — set on successful `/start <token>`.

New table `TelegramMessage`:

- `userId`, `role` (`user` | `assistant`), `text`. Last 12 turns are
  loaded as conversation history.
- `chatId BigInt`, `isGroup Boolean @default(false)` — kept on the row so
  groups don't pollute the rolling private-chat context (today the loader
  filters with `isGroup = false`).
- `telegramMessageId BigInt?` — original Telegram message id, optional
  (handy for future "delete on user request" or cross-platform linking).

## Contracts

### API routes

- **`GET /api/settings/telegram`** — returns `{ linked, username, telegramUserId, verifiedAt }`. Auth: `requireUserId()`.
- **`POST /api/settings/telegram`** — mints a fresh signed token, returns `{ url, token, ttlMinutes, expiresAt }`. Auth: `requireUserId()`.
- **`DELETE /api/settings/telegram`** — clears the four `telegram*` columns on the current user. Auth: `requireUserId()`.

### Webhook

- **`POST /api/webhooks/telegram`** — Telegram → us. Auth: secret token in
  `X-Telegram-Bot-Api-Secret-Token` header (matches `TELEGRAM_WEBHOOK_SECRET`).
  Returns `200 { ok: true }` instantly, runs the heavy work (AI call, file
  download, transcription) inside `waitUntil(...)`.
  Subscribed update types: `message`, `edited_message`, `callback_query`.

### Outbound calls

- **Telegram Bot API:** `sendMessage`, `sendChatAction` (typing dots),
  `getFile`, `setWebhook`, `setMyCommands`. Wrapped in
  `src/lib/telegram/client.ts` so the webhook never `fetch`'s directly.

## Invariants

- The webhook **always** verifies the secret header before parsing JSON.
- The deep-link token is **stateless** — no DB row exists for "pending links".
  Verification is HMAC-only with a 15-minute TTL embedded in the payload.
- The Telegram channel uses the **same daily quota** as the web chat
  (`consumeAgentQuota(userId)`); a user can't double their cap by
  switching channels.
- The agent receives `source: "telegram"` so the `feature:chat-telegram`
  Vercel AI Gateway tag distinguishes it in observability.
- Group messages are dropped on the floor unless the bot is explicitly
  addressed; group conversation threads are **not** persisted today.

## Environment variables

- `TELEGRAM_BOT_TOKEN` — from @BotFather. Required.
- `TELEGRAM_BOT_USERNAME` — handle without `@` (e.g. `ClaraTreBot`). Required.
- `TELEGRAM_WEBHOOK_SECRET` — signed by us, echoed back by Telegram. Required.
- `TELEGRAM_LINK_TOKEN_SECRET` — HMAC key for deep-link tokens. Falls back to
  `NEXTAUTH_SECRET` when unset; production should set a dedicated key.
- `TELEGRAM_WEBHOOK_URL` — public URL Telegram should POST to. Used only by
  the setup script (`npm run telegram:webhook`).

## Known gaps / TODOs

- **Group support is stubbed.** Detect `@<bot>` mentions, persist group
  threads with `isGroup = true`, and reply only when addressed. Decide how
  to handle authorization (only respond when the mentioning user is linked?
  or any group member?).
- **Voice replies** (TTS) are not implemented — Telegram supports `voice`
  uploads via `sendVoice`; a small follow-up could wire the existing
  OpenAI TTS pipeline through `sendVoice`.
- **Trefolio / Warren** does not yet have a parallel Telegram channel. The
  refactor is described in
  [`design-docs/telegram-deep-link-tokens.md`](../design-docs/telegram-deep-link-tokens.md).
- **Inline keyboards** translate menu taps into canned prompts; richer
  flows (e.g. Telegram's date pickers, bot commands with arguments) are
  not used yet.

## Related

- Design doc: [`knowledge/design-docs/telegram-deep-link-tokens.md`](../design-docs/telegram-deep-link-tokens.md)
- Operating manual: [`AGENTS.md`](../../AGENTS.md) (`lib/telegram/` entry).
