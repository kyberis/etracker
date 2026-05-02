import { NextResponse } from "next/server";

import {
  ACCOUNT_DELETION_GRACE_DAYS,
  isPastGracePeriod,
} from "@/lib/account-deletion";
import { db } from "@/lib/db";
import { withApi } from "@/lib/http";
import { log } from "@/lib/log";
import { getAuthSession } from "@/lib/auth";

/**
 * Account restore — clears `User.deletedAt` so the account exits the
 * 30-day soft-delete window and behaves like a normal active row again.
 *
 * Auth: NextAuth session. We deliberately do **not** use `requireUserId()`
 * here because that helper bumps `lastSeenAt` and we want to keep the
 * restore path side-effect-free for users who decide to cancel the delete
 * within seconds of pressing the button.
 *
 * Idempotent: a second call with `deletedAt` already null is a no-op.
 *
 * Race vs. the purge cron: the cron runs `deleteMany` filtered by
 * `deletedAt < cutoff` in a single statement. If the user clears
 * `deletedAt` before the cron's WHERE evaluates, the row is no longer
 * matched. If the cron deletes first, this endpoint returns
 * `USER_NOT_FOUND` (the session JWT outlives the row by up to 30 days).
 */
export async function POST() {
  return withApi(async () => {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }
    const userId = session.user.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, deletedAt: true },
    });
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }
    if (!user.deletedAt) {
      return NextResponse.json({ ok: true, restored: false });
    }

    await db.user.update({
      where: { id: userId },
      data: {
        deletedAt: null,
        // If the user re-deletes later, the reminder schedule starts
        // fresh: we should not skip the T-7 email just because we sent
        // it during the previous (cancelled) attempt.
        deletionRemindersSent: 0,
      },
    });
    log.info("account_restored", {
      userId,
      pastGrace: isPastGracePeriod(user.deletedAt),
      graceDays: ACCOUNT_DELETION_GRACE_DAYS,
    });
    return NextResponse.json({ ok: true, restored: true });
  });
}
