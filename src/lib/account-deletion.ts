/**
 * Account soft-delete window — constants, date helpers, and the shared
 * Stripe cancellation primitive used by the delete / restore endpoints,
 * the (app) layout redirect, the daily purge cron, the admin
 * "purge now" action and the post-delete public confirmation page.
 *
 * The model: when a user clicks "Borrar mi cuenta" we set
 * `User.deletedAt = now()` instead of running `db.user.delete()`. The (app)
 * layout redirects users with `deletedAt` set to `/account/restore`, every
 * mutating surface refuses them, and `/api/cron/account-purge` hard-deletes
 * rows older than `ACCOUNT_DELETION_GRACE_DAYS` once per day. Restoring is
 * just clearing the column; the cron's `WHERE deletedAt < cutoff` is atomic
 * so a restore that happens before the cron tick wins the race.
 *
 * 30 days is the GDPR-conventional retention window for self-service
 * erasure with the right to revoke (Art. 17 + recital 65). Long enough to
 * cover a "I clicked the wrong button" scenario; short enough that we are
 * still acting on the erasure request without artificial delay.
 */

export const ACCOUNT_DELETION_GRACE_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The instant at which the daily purge cron will hard-delete the row, given
 * its `deletedAt` timestamp. Surfaced in the UI ("se borra el {fecha}") and
 * in the post-delete confirmation page.
 */
export function getDeletionScheduledFor(deletedAt: Date): Date {
  return new Date(deletedAt.getTime() + ACCOUNT_DELETION_GRACE_DAYS * MS_PER_DAY);
}

/**
 * Cut-off used by the purge cron: any row with `deletedAt < cutoff` is past
 * the grace period and ready to be hard-deleted.
 */
export function getPurgeCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - ACCOUNT_DELETION_GRACE_DAYS * MS_PER_DAY);
}

/**
 * `true` when the soft-delete grace window has elapsed (cron will purge on
 * its next tick). Restore is still allowed in that window — the row exists
 * until the cron actually runs.
 */
export function isPastGracePeriod(
  deletedAt: Date,
  now: Date = new Date(),
): boolean {
  return now.getTime() - deletedAt.getTime() >= ACCOUNT_DELETION_GRACE_DAYS * MS_PER_DAY;
}

/**
 * Days remaining until the purge cron will hard-delete the account. Floored
 * to 0 once the grace period has elapsed, so UIs can render
 * "se borra hoy" instead of "-1 días".
 */
export function getGraceDaysRemaining(
  deletedAt: Date,
  now: Date = new Date(),
): number {
  const elapsedMs = now.getTime() - deletedAt.getTime();
  const remainingMs =
    ACCOUNT_DELETION_GRACE_DAYS * MS_PER_DAY - elapsedMs;
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / MS_PER_DAY);
}

/**
 * Soft-delete reminder schedule. Bit indices map to days **before** the
 * scheduled purge: bit 0 fires once `daysRemaining <= 7`, bit 1 once
 * `daysRemaining <= 1`. The bitmask lives in `User.deletionRemindersSent`
 * and lets the daily cron stay idempotent — a backlogged tick that catches
 * up two reminders at once still only sends each one a single time.
 *
 * Listed largest-threshold first so the cron loops the array and dispatches
 * the *latest* due reminder. We keep them ordered by `bit` ascending.
 */
export const ACCOUNT_DELETION_REMINDERS = [
  {
    bit: 0,
    /** Send when `daysRemaining <= triggerWhenDaysRemaining`. */
    triggerWhenDaysRemaining: 7,
    label: "t_minus_7" as const,
  },
  {
    bit: 1,
    triggerWhenDaysRemaining: 1,
    label: "t_minus_1" as const,
  },
] as const;

export type AccountDeletionReminderLabel =
  (typeof ACCOUNT_DELETION_REMINDERS)[number]["label"];

/** True iff the bit for this reminder is already set in the bitmask. */
export function reminderAlreadySent(
  bitmask: number,
  bit: number,
): boolean {
  return (bitmask & (1 << bit)) !== 0;
}

/** Returns the new bitmask with the given reminder bit set. */
export function withReminderSent(bitmask: number, bit: number): number {
  return bitmask | (1 << bit);
}

/**
 * Pick the reminder that should fire on this cron tick, given the row's
 * current bitmask and how many days are left. Returns `null` when no
 * reminder is due (either too early or already sent).
 *
 * Ordering rule: if the cron has missed multiple reminders, we send the
 * **most urgent** outstanding one (T-1 wins over T-7) and mark only that
 * bit. The next tick handles the remaining one if still due. This keeps
 * the inbox quiet and makes the email order make sense ("you have 1 day
 * left" should not arrive after "you have 7 days left").
 */
export function pickDueReminder(
  bitmask: number,
  daysRemaining: number,
): (typeof ACCOUNT_DELETION_REMINDERS)[number] | null {
  for (let i = ACCOUNT_DELETION_REMINDERS.length - 1; i >= 0; i--) {
    const reminder = ACCOUNT_DELETION_REMINDERS[i];
    if (reminderAlreadySent(bitmask, reminder.bit)) continue;
    if (daysRemaining <= reminder.triggerWhenDaysRemaining) {
      return reminder;
    }
  }
  return null;
}

