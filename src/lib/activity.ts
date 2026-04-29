import { db } from "@/lib/db";
import { log } from "@/lib/log";

/**
 * Internal analytics: per-user activity tracking. We update `User.lastSeenAt`
 * and upsert a `DailyActiveUser` row at most **once per UTC day** per user, so
 * the cost of calling `touchActivity` from many request paths is effectively
 * a single read on warm rows.
 *
 * Day boundary is 00:00 UTC, identical to the agent quota counter, so DAU
 * and AI usage charts line up on the dashboard.
 *
 * Best-effort: never throws. Activity tracking must not break the user
 * request path. Failures are logged at warn level for ops visibility.
 */

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

const inflight = new Map<string, Promise<void>>();

/**
 * Fire-and-forget marker that user `userId` was just active. Safe to call
 * on every authenticated request; only does real work the first time we
 * see the user each UTC day. Caller may `await` to be sure the row landed
 * (server-component layouts), or drop the promise (API routes).
 */
export function touchActivity(userId: string): Promise<void> {
  if (!userId) return Promise.resolve();
  const existing = inflight.get(userId);
  if (existing) return existing;
  const promise = doTouch(userId).finally(() => {
    inflight.delete(userId);
  });
  inflight.set(userId, promise);
  return promise;
}

async function doTouch(userId: string): Promise<void> {
  try {
    const today = startOfTodayUtc();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { lastSeenAt: true },
    });
    if (!user) return;
    if (user.lastSeenAt && user.lastSeenAt.getTime() >= today.getTime()) {
      return;
    }

    await Promise.all([
      db.user.update({
        where: { id: userId },
        data: { lastSeenAt: new Date() },
      }),
      db.dailyActiveUser.upsert({
        where: { userId_day: { userId, day: today } },
        create: { userId, day: today },
        update: {},
      }),
    ]);
  } catch (error) {
    log.warn("activity.touch_failed", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
