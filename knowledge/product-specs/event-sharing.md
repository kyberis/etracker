# event-sharing (shared event wallets)

> Multi-participant event wallets: invite friends to a trip via a
> share-link, log "who paid what" together, and settle up at close
> with an equal-split breakdown. Guests can join via Telegram without
> a Clara account.

## What it does

Building on `events`, an event can now be **shared** with other people.
The owner mints a share-link from the event detail page; whoever opens
that link sees a one-page landing and can join in two ways:

- **Already-have-an-account**: one click adds them as a participant.
  The trip appears on their dashboard, and `addMonthLine` (chat) +
  REST + MCP all let them log expenses for it.
- **Telegram-only guest**: no Clara account needed. We create a
  `User.kind = GUEST` row and a one-time short code, then send them to
  `t.me/<bot>?start=<code>`. The bot binds their Telegram identity to
  the new GUEST account and welcomes them with an event-aware message
  ("Marcos te invitó a Mendoza Trip"). From then on, anything they
  type in the bot is logged against the shared event in the OWNER's
  books, scoped to that single trip.

Every shared expense answers "who paid?" via `MonthExpenseLine.paidByUserId`.
The AI agent prompts for that field on shared events when it's
ambiguous. While the event is open, the `/events/[id]` page shows a
**settlement preview**: trip total, fair share per head, what the
viewer paid, their balance (creditor / debtor), and the suggested
transfers. When the event closes, every participant gets a Telegram
summary listing exactly who pays whom and how much.

## Where the code lives

| Layer | Path |
|-------|------|
| Types / validators | `src/lib/validators.ts` (`eventShareAcceptSchema`, `guestUpgradeSchema`, `MonthExpenseLineCreate.paidByUserId`) |
| DB / Prisma model | `prisma/schema.prisma` (`UserKind`, `EventParticipantRole`, `User.kind`, `EventParticipant`, `EventShareToken`, `MonthExpenseLine.paidByUserId`) |
| Token primitives | `src/lib/events-share.ts` (`mintShareToken`, `verifyShareToken`, `markShareTokenUsed`, `revokeShareToken`, `listShareTokens`, `buildShareUrl`) |
| Service | `src/lib/events.ts` (`addParticipant`, `removeParticipant`, `listParticipants`, `isEventOwner`, `isEventParticipant`, `computeSettlement`, `pickOwnerDisplayName`) |
| API routes | `src/app/api/events/[id]/share/route.ts` (POST mint / GET list), `…/share/[tokenId]/route.ts` (DELETE revoke), `src/app/api/events/share/[token]/route.ts` (preview), `…/share/[token]/accept/route.ts` (accept guest+registered), `…/[id]/participants/route.ts` (list), `…/[id]/participants/[userId]/route.ts` (remove), `…/[id]/settlement/route.ts` (preview), `src/app/api/auth/upgrade-guest/route.ts` (GUEST → REGULAR) |
| Agent tools | `src/lib/ai/expense-tools.ts` (`addMonthLine` extended with `paidByUserId`; `listEventParticipants`; `createEventShareLink` mints a share-link from the chat; GUEST scope filters the catalogue to event-only tools) |
| Agent prompt | `src/lib/ai/run-expense-agent.ts` (passes `guestEventScope` and shared-event guidance to the LLM) |
| Telegram | `src/app/api/webhooks/telegram/route.ts` (`/start <code>` recognises participant link codes), `src/lib/telegram/event-share-strings.ts` (welcomes + settlement summaries), `src/lib/telegram/event-guest-state.ts` (loads GUEST scope) |
| UI | `src/app/(marketing)/[lang]/events/share/[token]/page.tsx` + `share-accept-form.tsx` (public landing), `src/app/(marketing)/[lang]/upgrade-guest/page.tsx` + `guest-upgrade-form.tsx` (GUEST → REGULAR), `src/components/event-share-panel.tsx` (Compartir dialog + participants list + settlement card), `src/components/event-detail.tsx` (renders `EventSharePanel`, "Pagó X" badge per line, OWNER-only detach) |
| Tests | `src/lib/events.test.ts` (settlement: 6 cases), `src/lib/events-share.test.ts` (mint/verify/revoke + buildShareUrl: 16 cases), `src/lib/ai/expense-tools-shared.test.ts` (GUEST scope + paidByUserId: 7 cases), `src/lib/ai/expense-tools.test.ts` (existing eventId-validation tests updated for participant-aware lookup), `src/app/api/webhooks/telegram/route.test.ts` (participant link code → event-aware welcome) |

## Data model (additions)

```
enum UserKind                 { REGULAR, GUEST }
enum EventParticipantRole     { OWNER, GUEST }

model User {
  ...
  kind  UserKind  @default(REGULAR)
}

model EventParticipant {
  id                String                 @id @default(cuid())
  eventId           String
  userId            String
  role              EventParticipantRole
  displayName       String                  // event-scoped name
  joinedAt          DateTime  @default(now())
  removedAt         DateTime?               // tombstone, never hard-deleted
  telegramLinkCode  String?   @unique       // single-use; cleared on /start
  @@unique([eventId, userId])
  @@index([userId])
  @@index([eventId])
}

model EventShareToken {
  id          String     @id @default(cuid())
  eventId     String
  createdById String
  tokenHash   String     @unique           // sha256(plaintext); never the plaintext
  expiresAt   DateTime
  revokedAt   DateTime?
  lastUsedAt  DateTime?
  createdAt   DateTime   @default(now())
  @@index([eventId])
  @@index([createdById])
}

model MonthExpenseLine {
  ...
  paidByUserId  String?       // who paid this line (event-scoped)
  paidBy        User?         @relation(...)
  @@index([paidByUserId])
}
```

Migrations:

- `prisma/migrations/20260502230000_shared_event_wallets/migration.sql`
  — additive: enums, `User.kind`, `MonthExpenseLine.paidByUserId`,
  `EventParticipant`, `EventShareToken`. Backfills an OWNER row for
  every existing event in a single statement.
- `prisma/migrations/20260502270000_event_share_link_code/migration.sql`
  — adds `EventParticipant.telegramLinkCode`,
  `EventParticipant.eventId` index, `EventShareToken.createdById`
  index. Pure follow-up.

## Contracts

REST (all wrapped by `withApi()`, OWNER-only unless noted):

- `POST   /api/events/[id]/share` — mint a token. 200 `{ tokenId, token, url, expiresAt }`. The plaintext token is returned ONCE; subsequent reads see only the row metadata.
- `GET    /api/events/[id]/share` — list tokens (no plaintext).
- `DELETE /api/events/[id]/share/[tokenId]` — soft-revoke (idempotent).
- `GET    /api/events/share/[token]` — public token preview (no auth). Returns event name, owner display name, dates, status. 404 / 410 / 403 on `not_found` / `expired` / `revoked`.
- `POST   /api/events/share/[token]/accept` — accept the invite. Anonymous OR authenticated. Body: `{ mode: "guest" | "registered", displayName?: string, locale?: "es"|"en" }`. Rate-limited 30/10m per IP. On `mode=guest` creates a `User.kind = GUEST` + `EventParticipant` + `telegramLinkCode` and returns a `t.me/<bot>?start=<code>` deep-link. On `mode=registered` adds the caller as `EventParticipant` and returns the event id.
- `GET    /api/events/[id]/participants` — list active participants (OWNER or any participant).
- `DELETE /api/events/[id]/participants/[userId]` — soft-remove (OWNER only; refuses to remove the owner).
- `GET    /api/events/[id]/settlement` — settlement preview (any participant).
- `POST   /api/auth/upgrade-guest` — GUEST → REGULAR (email + password + Terms version). Idempotent.

Agent tools:

- `addMonthLine` accepts `paidByUserId` (required when the event has ≥ 2 active participants; falls back to the caller's userId otherwise).
- `listEventParticipants` returns the active roster + `currentUserId`. Under GUEST scope `eventId` is optional and defaults to the scoped event.
- `createEventShareLink` mints a fresh 30-day share-token from the chat. OWNER-only — refuses with an error when the caller does not own the event, and is filtered out of the GUEST catalogue. The agent paste the returned `url` verbatim back to the user so they can forward it via WhatsApp / Telegram. Internally calls the same `mintShareToken` + `buildShareUrl` pair as `POST /api/events/[id]/share`, so web-minted and chat-minted links are interchangeable.
- For `User.kind = GUEST`, the catalogue is filtered to: `addMonthLine`, `listEventParticipants`, `getEvent`, `listEvents`, `renderChart`, `setUserLocale`. All `addMonthLine` calls force `eventId` to the scoped event and route the line to the OWNER's books.

## Invariants

- **Tokens never live in plaintext in the DB.** `EventShareToken.tokenHash` is `sha256(plaintext)`. A DB leak does not let an attacker reuse outstanding share-links.
- **Revocation is instant.** `revokedAt` is checked at every `verifyShareToken`; idempotent on re-revoke.
- **Lines always live in the OWNER's books.** Even when a GUEST logs an expense via Telegram, `MonthExpenseLine.userId = event.userId`. `paidByUserId` is the event-scoped attribution.
- **Removed participants are tombstones.** `removedAt` is set; the row is never hard-deleted. Lines they paid for stay; settlement falls back to the owner if their `paidByUserId` no longer maps to an active row.
- **OWNER absorbs the rounding remainder.** `computeSettlement` floors `totalCents / N` then adds the residual cents to the owner's fair share, keeping every debtor amount cleanly two-decimal.
- **`addMonthLine` requires `paidByUserId` on N ≥ 2 events.** The tool returns an error directing the caller to `listEventParticipants` rather than guessing.
- **GUEST agent surface is filtered.** GUEST users cannot reach banks, templates, savings, income, or any other feature outside their single shared event. The filtering happens in `buildExpenseTools` itself — there's no LLM-side honor system.
- **Telegram link codes are single-use.** Cleared on first `/start <code>` inside the same transaction that binds the Telegram identity.

## Settlement math

Everything in cents (BigInt) to avoid float drift:

1. `paidCents[userId] = SUM(line.amountConverted * 100) per paidByUserId`. Lines without `paidByUserId`, or whose payer is no longer an active participant, fall back to the owner.
2. `totalCents = SUM(paidCents[*])`.
3. `fairShareCents = floor(totalCents / N)`; `remainderCents = totalCents - fairShareCents * N`.
4. Each participant owes `fairShareCents` (owner additionally owes `remainderCents`). `balanceCents = paidCents - oweCents`.
5. Greedy match: sort creditors descending by balance, debtors ascending. Walk both lists, emit `min(|debt|, credit)` transfers, advance whichever side hit zero.

The greedy pass is `O(N log N)` and produces the minimum number of
transfers for the equal-split case (proven for symmetric bipartite
matching; not optimal for general split rules but those are out of
scope).

## Known gaps / TODOs

- **QR code in the Compartir dialog**: the npm registry available to this repo blocked installing `qrcode.react`. The dialog has a `// TODO(qr)` comment marking the spot; once the package can be installed, render an SVG QR of the fresh URL.
- **Non-equal splits**: only equal split is supported. Tip/itemised splits will need either a per-line override or a separate `EventSplit` model. Out of scope for this iteration.
- **GUEST → REGULAR migration of historical lines**: when a GUEST upgrades, their `MonthExpenseLine` rows already live in the OWNER's books. No data migration is needed — just `User.kind = REGULAR`.
- **Multi-currency at settlement**: the settlement currency is the owner's `primaryCurrency`. Lines in foreign currencies are converted at log-time (snapshotted via `amountConverted`); FX drift through the trip window isn't corrected.
- **Bulk re-attribute paidByUserId**: there's no UI to change "who paid" on existing lines yet — the user has to delete + re-log via chat. Likely a future PR.

## Related

- Spec: [`events`](events.md) — single-user event wallets (the foundation).
- Spec: [`telegram`](telegram.md) — bot infra used for the GUEST onboarding.
- Spec: [`gdpr-compliance`](gdpr-compliance.md) — guest accounts retention rules.
- Design doc: pending — when more "shared X" features land, lift the role/permission pattern into `knowledge/design-docs/sharing-and-roles.md`.
