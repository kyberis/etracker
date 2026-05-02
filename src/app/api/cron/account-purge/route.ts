/**
 * Vercel Cron entrypoint for the account purge.
 *
 * Two responsibilities, kept in a single cron so we only pay one schedule:
 *
 *  1. Reminder emails — for users with `deletedAt IS NOT NULL` we look at
 *     the days remaining in the 30-day grace window and dispatch the
 *     latest due reminder (T-7 then T-1). Each reminder is gated by a bit
 *     in `User.deletionRemindersSent` so a missed cron tick that catches
 *     up two days at once still only sends each email once. Restore
 *     resets the bitmask, so a user who deletes → restores → deletes again
 *     gets the reminders again on the second attempt (which is the
 *     friendly thing to do — reading "you have 7 days" 35 days after the
 *     fact would be confusing).
 *
 *  2. Hard delete — every `User` row whose `deletedAt` is older than
 *     `ACCOUNT_DELETION_GRACE_DAYS` (30 days) is hard-deleted. Cascade FKs
 *     in the schema take care of every related row (banks, expenses,
 *     incomes, savings, chat history, MCP tokens, passkeys, …); the only
 *     relations that survive are those explicitly declared
 *     `onDelete: SetNull` (e.g. `ContactMessage`), which keeps the audit
 *     trail outliving the account on purpose.
 *
 * Stripe: the soft-delete endpoint cancels the subscription at click
 * time so the user is not charged during the grace window. `purgeUserNow`
 * still calls the cancellation helper as a safety net for the rare case
 * where the click-time call failed (Stripe outage, network blip) — the
 * helper is a no-op when there is nothing to cancel. The Stripe
 * customer + donation receipts are kept on the Stripe side per their
 * non-refundable terms.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET` (Vercel Cron injects this).
 * Schedule: daily — see `vercel.json`. Idempotent: a second tick on the
 * same day finds nothing new in either pass.
 */

import { NextResponse } from "next/server";

import {
  ACCOUNT_DELETION_GRACE_DAYS,
  getDeletionScheduledFor,
  getGraceDaysRemaining,
  getPurgeCutoff,
  pickDueReminder,
  withReminderSent,
} from "@/lib/account-deletion";
import { sendAccountDeletionReminderEmail } from "@/lib/account-deletion-reminder";
import { purgeUserNow } from "@/lib/account-deletion-server";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { log } from "@/lib/log";
import { verifyCronSecret } from "@/lib/telegram/daily-nudge";

export const runtime = "nodejs";
// Worst case: 5 minutes of headroom for a backlog of soft-deletes that
// piled up while the cron was disabled. Single-row deletes on indexed PKs
// take milliseconds even with cascade fan-out.
export const maxDuration = 300;

async function handle(request: Request): Promise<Response> {
  if (!verifyCronSecret(request)) {
    log.warn("account_purge.unauthorized", {});
    return jsonError("Unauthorized.", 401);
  }

  const startedAt = Date.now();
  const now = new Date();
  const cutoff = getPurgeCutoff(now);

  // ───── Pass 1: reminders ─────────────────────────────────────────────
  // We pull every soft-deleted row that is NOT yet past the cutoff (those
  // are about to get hard-deleted in pass 2 — sending a "we'll delete in
  // 1 day" email after the row is already gone would be embarrassing).
  // The partial index on `deletedAt` keeps this scan cheap.
  const remindable = await db.user.findMany({
    where: {
      deletedAt: { not: null, gte: cutoff },
    },
    select: {
      id: true,
      email: true,
      locale: true,
      deletedAt: true,
      deletionRemindersSent: true,
    },
  });

  let remindersSent = 0;
  let remindersSkipped = 0;
  let remindersFailed = 0;
  for (const candidate of remindable) {
    if (!candidate.deletedAt) continue; // narrow the type
    const daysRemaining = getGraceDaysRemaining(candidate.deletedAt, now);
    const reminder = pickDueReminder(
      candidate.deletionRemindersSent,
      daysRemaining,
    );
    if (!reminder) {
      remindersSkipped++;
      continue;
    }
    const result = await sendAccountDeletionReminderEmail({
      email: candidate.email,
      locale: candidate.locale,
      label: reminder.label,
      daysRemaining,
      scheduledFor: getDeletionScheduledFor(candidate.deletedAt),
    });
    // We mark the bit on success and on `not_configured`. Marking on
    // `not_configured` prevents a Resend outage from making every cron
    // tick re-attempt the same row forever; operators see the warning in
    // the logs and can fix Resend without the user being spammed once it
    // comes back. We do NOT mark on `send_failed` (transient errors): the
    // next tick will retry.
    if (result.ok || result.reason === "not_configured") {
      try {
        await db.user.update({
          where: { id: candidate.id },
          data: {
            deletionRemindersSent: withReminderSent(
              candidate.deletionRemindersSent,
              reminder.bit,
            ),
          },
        });
        if (result.ok) remindersSent++;
        else remindersSkipped++;
      } catch (err) {
        remindersFailed++;
        log.warn("account_purge.reminder_mark_failed", {
          userId: candidate.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      remindersFailed++;
    }
  }

  // ───── Pass 2: hard delete ───────────────────────────────────────────
  // Fetch ids first so per-row failures (e.g. a stuck FK) don't abort the
  // whole batch; `deleteMany` would also work but we want per-row logging
  // and resilience, not transactional all-or-nothing.
  const candidates = await db.user.findMany({
    where: { deletedAt: { lt: cutoff, not: null } },
    select: { id: true, deletedAt: true },
  });

  let purged = 0;
  let failed = 0;
  for (const candidate of candidates) {
    try {
      const result = await purgeUserNow(candidate.id, "cron");
      if (result.purged) purged++;
    } catch (err) {
      failed++;
      log.warn("account_purge.row_failed", {
        userId: candidate.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info("account_purge.complete", {
    candidates: candidates.length,
    purged,
    failed,
    remindable: remindable.length,
    remindersSent,
    remindersSkipped,
    remindersFailed,
    cutoffIso: cutoff.toISOString(),
    graceDays: ACCOUNT_DELETION_GRACE_DAYS,
    durationMs: Date.now() - startedAt,
  });

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    purged,
    failed,
    remindable: remindable.length,
    remindersSent,
    remindersSkipped,
    remindersFailed,
    cutoff: cutoff.toISOString(),
  });
}

export const POST = handle;
export const GET = handle;
