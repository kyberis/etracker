# Telegram deep-link tokens

> Why we vinculate Telegram chats to Clara accounts with a stateless
> HMAC-signed deep-link token instead of storing a 6-digit code on `User`.

## Context

Opening a Telegram deep link with `?start=<param>` already ships a token
from the web tab into the bot via Telegram's clients. Asking the user to
type a code in the chat makes the experience worse, not better — and adds
DB writes for a flow we'd rather have stateless.

## Decision

Use a **stateless HMAC-signed token** for Telegram linking. The token
encodes `{ uid, exp }` and is signed with `TELEGRAM_LINK_TOKEN_SECRET`. The
Settings POST endpoint generates the token, the bot's `/start` handler
verifies it, and the user is linked in **one round trip**.

```text
POST /api/settings/telegram
  → Set-Cookie: nothing
  → Body: { url: "https://t.me/<bot>?start=<token>", expiresAt, ttlMinutes }

(user taps "Start" in Telegram client)

POST /api/webhooks/telegram   (X-Telegram-Bot-Api-Secret-Token: <secret>)
  → message.text == "/start <token>"
  → verifyLinkToken(token) → { ok: true, userId }
  → UPDATE "User" SET telegramUserId = <fromId>, telegramChatId = <chatId>,
                     telegramUsername = <username>, telegramVerifiedAt = NOW()
                     WHERE id = userId
```

## Token format

```text
base64url(JSON.stringify({ uid, exp }))_hex(HMAC-SHA256(payload))
```

- `uid` is the Clara user id.
- `exp` is unix seconds, defaulting to `now + 15 minutes`.
- `payload` is the base64url string itself (we sign the encoded form so
  whitespace / canonicalisation doesn't matter).
- Separator is `_` because Telegram's `start` parameter accepts only
  `[A-Za-z0-9_-]`, so our token must too.

Verification is constant-time (`crypto.timingSafeEqual`) and rejects
expired tokens before returning.

## Why not a DB-backed code?

| Option | Tradeoff |
|--------|----------|
| 6-digit code in DB | Worse UX (typing on a desktop), extra DB writes per link attempt, more code paths (issue / consume / expire). |
| One-time token persisted in DB | Defends against replay, but Telegram already gives us a one-shot UX (the user only taps Start once). The DB row is dead weight after first use. |
| Stateless HMAC (chosen) | Zero DB writes until the link succeeds. Replay is bounded by `exp` (15 min) and irrelevant after the user is linked because re-running `/start <same-token>` just re-sets the same columns. |
| Random nonce in Redis | Adds a hard dependency on Upstash; no benefit over HMAC for our threat model (no broadcast / no privilege escalation through a stale token). |

## Threat model

- **Token leak (link copied / inspected):** valid for 15 min, only
  vinculates the **leaker's** account, can be invalidated immediately by
  the user calling `/unlink`. Mitigation: short TTL.
- **Webhook replay:** secret token in `X-Telegram-Bot-Api-Secret-Token` is
  required; missing → 401. Telegram, the only legitimate caller, signs every
  call with this secret.
- **Race between two browsers:** both tokens vinculate the same `userId`,
  whichever bot start arrives first wins. The other token expires at `exp`.
- **Forgery:** HMAC-SHA256 with a per-environment secret. We require ≥16
  chars, falling back to `NEXTAUTH_SECRET` only as a development convenience.

## Operational notes

- Run `npm run telegram:webhook` once per deploy when the public URL or the
  slash-command catalogue changes. The script also calls `getWebhookInfo` so
  you see Telegram's view of the registration.
- Rotating `TELEGRAM_LINK_TOKEN_SECRET` invalidates all in-flight links
  (existing **linked** users are unaffected — only the verify path uses the
  secret).
- `TELEGRAM_WEBHOOK_SECRET` rotation requires re-running `setWebhook` so
  Telegram resumes echoing the new value.

## Future: cross-bot deep links (Warren)

When trefolio's **Warren** AI gets its own Telegram bot, the same pattern
should be reused with a different bot username and a different secret. The
two bots are independent on the Telegram side; each chat has its own
`telegramUserId` + `chatId` per bot. There is no cross-bot linking required.

For "Clara and Warren in the same group", the routing is **per-bot
mention**: each bot listens for `@<bot>` mentions and replies only when
addressed. No central dispatcher, no shared state.

## Related

- Spec: [`knowledge/product-specs/telegram.md`](../product-specs/telegram.md)
- Token implementation:
  [`src/lib/telegram/link.ts`](../../src/lib/telegram/link.ts)
