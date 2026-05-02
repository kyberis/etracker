/**
 * "Did the user log anything financial today?" helper.
 *
 * Used by the daily Telegram nudge cron to decide whether a given user is a
 * candidate for the outbound message. If they already added at least one
 * expense, income or manual savings movement during their local day, Clara
 * stays quiet.
 *
 * We look at `createdAt` rather than `occurredOn` because:
 * - `createdAt` is the wall-clock instant when the line was saved —
 *   always set by Prisma's `@default(now())`, always an exact moment in
 *   time. It directly answers "did the user touch their books today in
 *   their local timezone?".
 * - `occurredOn` is `@db.Date` (UTC midnight). A line logged from chat
 *   for "today" stores `occurredOn = todayUtcDate()`, but that UTC date
 *   can fall OUTSIDE the user's local-day window once their timezone
 *   drifts from UTC (e.g. AR local day [03Z..27Z) vs UTC 00Z). Using it
 *   would add false negatives for non-UTC users.
 *
 * The helper's caller (`runDailyNudge`) pre-computes the UTC bounds of
 * "today in the user's timezone" via `localDayBoundsInUtc`.
 */

import { db } from "@/lib/db";

/**
 * Returns `true` when the user already has at least one expense line,
 * income line or manual savings movement whose `createdAt` falls inside
 * the supplied UTC window (half-open `[startUtc, endUtc)`).
 *
 * Short-circuits on the first hit (Prisma `findFirst`). Counts `paid=false`
 * lines too — the intent is "did the user touch their books today?", not
 * "did they spend?". Manual savings (`MANUAL_DEPOSIT` /
 * `MANUAL_WITHDRAWAL`) count; system movements
 * (`MONTHLY_CONTRIBUTION`, `CARRYOVER_DEPOSIT`, `DEBT_COVERAGE`) do not —
 * those fire as side effects of other flows, not as deliberate logging.
 */
export async function userLoggedFinancialActivityToday(
  userId: string,
  startUtc: Date,
  endUtc: Date,
): Promise<boolean> {
  const createdAtInWindow = { gte: startUtc, lt: endUtc };

  // Run the three `findFirst` calls in parallel: we only need to know that
  // ONE category has a hit. Each query returns null or `{ id }`.
  const [expense, income, savings] = await Promise.all([
    db.monthExpenseLine.findFirst({
      where: { userId, createdAt: createdAtInWindow },
      select: { id: true },
    }),
    db.monthIncomeLine.findFirst({
      where: { userId, createdAt: createdAtInWindow },
      select: { id: true },
    }),
    db.savingsMovement.findFirst({
      where: {
        userId,
        kind: { in: ["MANUAL_DEPOSIT", "MANUAL_WITHDRAWAL"] },
        createdAt: createdAtInWindow,
      },
      select: { id: true },
    }),
  ]);

  return Boolean(expense || income || savings);
}
