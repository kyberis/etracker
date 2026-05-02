# Account soft-delete

> Self-service "Borrar mi cuenta" puts the account into a 30-day grace
> queue with one-click restore; a daily cron hard-deletes anything past
> the window. GDPR Art. 17 with a recoverability buffer.

## What it does

When a user clicks "Borrar mi cuenta" in
`Settings → Tu información y cuenta`:

1. We re-authenticate (password or `BORRAR <email>` phrase) exactly like
   the previous hard-delete flow.
2. The Stripe subscription, if any, is cancelled immediately so the user
   is not charged for a 30-day window they cannot use.
3. We set `User.deletedAt = now()` instead of running `db.user.delete()`.
4. The NextAuth session cookie is wiped and the browser is redirected to
   the public `/{locale}/account-deleted?until=<iso>` confirmation page.

While `deletedAt` is set:

- The `(app)` layout redirects every signed-in user to `/account/restore`
  before terms-acceptance and onboarding gates fire.
- `consumeAgentQuota` returns `{ ok: false, reason: "disabled" }` so chat
  via web and Telegram replies with the `accountDisabled` string.
- `verifyBearerToken` (per-user MCP) refuses any PAT minted under the
  account, freezing third-party AI clients.
- `runDailyNudge` skips users with `deletedAt` set so the bot doesn't
  ping someone who is trying to leave.
- `POST /api/auth/register` refuses re-using the same email until the
  cron actually purges the row — claiming a soft-deleted address would
  either silently shadow the old data or give an attacker a way to
  shorten the grace window.

`/account/restore` offers two affirmative buttons:

- **Restaurar mi cuenta** → `POST /api/account/restore` clears
  `deletedAt`, then a hard-navigate to `/app` re-evaluates the layout
  guards.
- **Cerrar sesión** → NextAuth signOut, account stays in the queue.

The daily `/api/cron/account-purge` cron runs at `30 3 * * *` UTC and
does two things in a single tick:

1. **Reminder emails (T-7, T-1).** For every soft-deleted row still
   inside the grace window, it computes `daysRemaining` and dispatches
   the latest due reminder (T-1 wins over T-7 if both are overdue). The
   bitmask `User.deletionRemindersSent` (bit 0 = T-7, bit 1 = T-1)
   keeps each email idempotent across catch-up runs. Restoring resets
   the bitmask, so a re-delete starts the schedule fresh.
2. **Hard delete.** For every row with `deletedAt < now - 30d` it calls
   `purgeUserNow()` (shared with the user-initiated and admin-initiated
   force paths). Cascade FKs in the schema take care of every related
   row; `ContactMessage.userId` is `SET NULL` on purpose so the bandeja
   keeps the audit trail.

### Force paths (skip the grace window)

- **Self-service.** `DELETE /api/account` accepts a `force: true` flag
  alongside the same re-auth payload. The card in
  `Settings → Tu información y cuenta` exposes a checkbox
  ("Saltarse la gracia — borrar definitivamente ahora") which, when
  ticked, sends `force: true` and lands on
  `/{locale}/account-deleted?force=1` (no recovery hint).
- **Admin.** `POST /api/admin/users/[id]/purge` (admin-only) calls
  `purgeUserNow` on a soft-deleted target. Surfaced in `/admin` via the
  "Pending account deletions" card, with a confirm() dialog and a guard
  against an admin purging themselves. Active accounts are rejected
  (`409`) — the admin path is for accelerating an existing soft-delete,
  not for one-step ban+wipe.

## Where the code lives

| Layer | Path |
|-------|------|
| Pure constants / helpers (client-safe) | [`src/lib/account-deletion.ts`](../../src/lib/account-deletion.ts) |
| Server primitives (Stripe + purge) | [`src/lib/account-deletion-server.ts`](../../src/lib/account-deletion-server.ts) |
| Reminder emails | [`src/lib/account-deletion-reminder.ts`](../../src/lib/account-deletion-reminder.ts) |
| DB / Prisma model | [`prisma/schema.prisma`](../../prisma/schema.prisma) (`User.deletedAt`, `User.deletionRemindersSent`) |
| Migration: column | [`prisma/migrations/20260502240000_account_soft_delete`](../../prisma/migrations/20260502240000_account_soft_delete/migration.sql) |
| Migration: reminder bitmask | [`prisma/migrations/20260502260000_account_deletion_reminders`](../../prisma/migrations/20260502260000_account_deletion_reminders/migration.sql) |
| API: soft-delete + force | [`src/app/api/account/route.ts`](../../src/app/api/account/route.ts) (`DELETE` accepts `force: true`) |
| API: restore | [`src/app/api/account/restore/route.ts`](../../src/app/api/account/restore/route.ts) (`POST`) |
| API: admin force purge | [`src/app/api/admin/users/[id]/purge/route.ts`](../../src/app/api/admin/users/[id]/purge/route.ts) |
| Cron: reminders + purge | [`src/app/api/cron/account-purge/route.ts`](../../src/app/api/cron/account-purge/route.ts) |
| Cron schedule | [`vercel.json`](../../vercel.json) (`30 3 * * *`) |
| Layout guard | [`src/app/(app)/layout.tsx`](../../src/app/(app)/layout.tsx) |
| Restore page | [`src/app/account/restore/page.tsx`](../../src/app/account/restore/page.tsx), [`account-restore-client.tsx`](../../src/app/account/restore/account-restore-client.tsx) |
| Public confirmation | [`src/app/(marketing)/[lang]/account-deleted/page.tsx`](../../src/app/(marketing)/[lang]/account-deleted/page.tsx) |
| Defensive checks | [`src/lib/api-token.ts`](../../src/lib/api-token.ts), [`src/lib/agent-quota.ts`](../../src/lib/agent-quota.ts), [`src/lib/telegram/daily-nudge.ts`](../../src/lib/telegram/daily-nudge.ts), [`src/app/api/auth/register/route.ts`](../../src/app/api/auth/register/route.ts) |
| Settings UI | [`src/components/settings-manager.tsx`](../../src/components/settings-manager.tsx) (`DeleteAccountCard`, force checkbox) |
| Admin UI | [`src/app/(app)/admin/page.tsx`](../../src/app/(app)/admin/page.tsx), [`src/components/admin-pending-purge-table.tsx`](../../src/components/admin-pending-purge-table.tsx) |
| i18n | [`src/lib/i18n/dictionaries/{es,en}.ts`](../../src/lib/i18n/dictionaries/) (`accountRestore`, `accountDeleted`, `admin.pendingPurge*`) |
| Marketing copy | [`src/lib/marketing-content.ts`](../../src/lib/marketing-content.ts) (PRIVACY §6+§7, CHANGELOG 0.10.0) |

## Data model

Two columns on `User`:

```prisma
deletedAt              DateTime?
deletionRemindersSent  Int       @default(0)
```

`deletedAt` is indexed via the partial expression
`CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt") WHERE "deletedAt" IS NOT NULL`
in `20260502240000_account_soft_delete`. Prisma cannot express partial
indexes; the schema carries a comment pointing at the SQL migration so
nobody adds a redundant `@@index([deletedAt])` later.

`deletionRemindersSent` is a bitmask: bit 0 = T-7 reminder dispatched,
bit 1 = T-1 reminder dispatched. The cron uses `pickDueReminder()` to
pick the *most urgent* outstanding reminder on each tick (so a
backlogged catch-up tick that owes both still sends T-1 first, not T-7
out of order). `/api/account/restore` resets the column to `0` so the
schedule starts fresh on a re-delete.

Cascade FKs already in place do all the heavy lifting at purge time;
soft-delete itself is one column update.

## Contracts

| Method | Path | Auth | Body | On success |
|--------|------|------|------|------------|
| `DELETE` | `/api/account` | session + re-auth (password or `BORRAR <email>`) | `{ currentPassword?, confirmPhrase?, force? }` | 200 `{ ok, alreadyPending?, scheduledFor?, purgedNow?, graceDays }` + cookie wipe |
| `POST` | `/api/account/restore` | session | `{}` | 200 `{ ok, restored }` |
| `POST`/`GET` | `/api/cron/account-purge` | `Authorization: Bearer $CRON_SECRET` | `{}` | 200 `{ ok, candidates, purged, failed, remindable, remindersSent, remindersSkipped, remindersFailed, cutoff }` |
| `POST` | `/api/admin/users/[id]/purge` | session + admin | `{}` | 200 `{ ok, purged }`. `409` if target is not soft-deleted, `400` if target is the caller. |

`ACCOUNT_DELETION_GRACE_DAYS = 30` lives in `src/lib/account-deletion.ts`
and is re-exported to the settings card and the restore page so the user-
facing copy stays in lockstep with the backend window.

## Invariants

- A row with `deletedAt != null` is **read-only** for the user: every
  mutating surface (chat, REST, MCP, Telegram) refuses them.
- Restoring is idempotent: a second call with `deletedAt = null` is a
  no-op.
- The cron's `WHERE deletedAt < cutoff` is atomic: a restore that races
  the cron tick wins as long as it lands before the WHERE evaluates.
- The Stripe subscription is cancelled at click time, not at purge time,
  so there is at most one billing cycle on the books for a soft-deleted
  account.
- Donations are kept on the Stripe side (non-refundable), but the
  `Donation` rows in our DB cascade away with `User.delete()` per
  schema. Stripe's record outlives ours by design — receipts stay valid.
- `Account` (NextAuth OAuth links) cascade with the user: a Google
  sign-in won't auto-rebuild the deleted account because the email is
  still gated by the soft-delete check in `register/route.ts`.

## Known gaps / TODOs

- The "Purge now" admin action requires the target to be already soft-
  deleted. There is no one-step "ban + wipe" path — by design, since
  Stripe cancellation, NextAuth cookie wipe and the user's own re-auth
  all happen in the soft-delete endpoint.
- Reminder cadence is fixed at T-7 / T-1. If support starts seeing
  "I missed the email" tickets, add a third reminder bit (T-14) with
  bit 2 in the bitmask and a third entry in
  `ACCOUNT_DELETION_REMINDERS`.
- The admin pending-purge table loads every soft-deleted row in a
  single query (no pagination). Fine for our scale; revisit if the
  queue ever has hundreds of rows.

## Related

- GDPR umbrella spec: [`gdpr-compliance.md`](gdpr-compliance.md).
- Cron pattern: [`telegram-daily-nudge.md`](telegram-daily-nudge.md)
  (same `verifyCronSecret`, same retry-friendly logging).
- Legal version anchor:
  [`src/lib/legal.ts`](../../src/lib/legal.ts) — bump `CURRENT_TERMS_VERSION`
  / `CURRENT_PRIVACY_VERSION` together when this flow changes materially.
