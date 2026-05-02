import { db } from "@/lib/db";
import { log } from "@/lib/log";

/**
 * Per-user, per-day quota for the AI agent. The same counter is shared
 * across the chat-web (`/api/chat`) and Telegram (`/api/webhooks/telegram`)
 * channels so a user can't double their cap by switching surfaces.
 *
 * Hard-limit: `count` against `User.dailyAgentMessageLimit`.
 * Informational: `inputTokens` / `outputTokens` (admin only, never block).
 *
 * Day boundary: 00:00 UTC. Consistent with Vercel runtime and avoids
 * timezone foot-guns in serverless.
 */

export type QuotaResult =
  | {
      ok: true;
      used: number;
      limit: number;
      remaining: number;
      resetAtUtc: string;
    }
  | {
      ok: false;
      reason: "disabled";
    }
  | {
      ok: false;
      reason: "limit";
      used: number;
      limit: number;
      remaining: 0;
      resetAtUtc: string;
    };

export type AgentQuotaSnapshot = {
  used: number;
  limit: number;
  remaining: number;
  resetAtUtc: string;
};

/** Today's day key at 00:00 UTC. Postgres stores it as DATE. */
export function getTodayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Tomorrow 00:00 UTC — when the daily counter resets. */
function getResetAtUtc(): string {
  const today = getTodayUtcDate();
  const reset = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  return reset.toISOString();
}

/**
 * Atomically increments today's counter for `userId` and decides whether
 * the call should proceed. Increments **before** invoking the model so a
 * failed model call doesn't let the user retry for free — acceptable
 * trade-off because the cap is generous (default 30/day).
 */
export async function consumeAgentQuota(userId: string): Promise<QuotaResult> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isActive: true, deletedAt: true, dailyAgentMessageLimit: true },
  });
  if (!user) {
    return { ok: false, reason: "disabled" };
  }
  if (!user.isActive || user.deletedAt) {
    // Treat soft-deleted accounts as disabled for the chat agent so the
    // (app) layout's redirect to /account/restore is enforced even when
    // the chat is reached via Telegram or a stale tab.
    return { ok: false, reason: "disabled" };
  }

  const day = getTodayUtcDate();
  const resetAtUtc = getResetAtUtc();

  // Atomic upsert + increment: relies on the `(userId, day)` unique constraint.
  const row = await db.agentMessageUsage.upsert({
    where: { userId_day: { userId, day } },
    create: { userId, day, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  const limit = user.dailyAgentMessageLimit;
  const used = row.count;
  if (used > limit) {
    return {
      ok: false,
      reason: "limit",
      used,
      limit,
      remaining: 0,
      resetAtUtc,
    };
  }
  return {
    ok: true,
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAtUtc,
  };
}

/**
 * Read-only snapshot for the usage endpoint and admin panel. Does not
 * touch the counter. Returns zeros for users with no row yet today.
 */
export async function getAgentQuotaSnapshot(
  userId: string,
): Promise<AgentQuotaSnapshot> {
  const [user, row] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { dailyAgentMessageLimit: true },
    }),
    db.agentMessageUsage.findUnique({
      where: { userId_day: { userId, day: getTodayUtcDate() } },
      select: { count: true },
    }),
  ]);
  const limit = user?.dailyAgentMessageLimit ?? 30;
  const used = row?.count ?? 0;
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    resetAtUtc: getResetAtUtc(),
  };
}

/**
 * Best-effort per-model usage tracker for the admin analytics page. Lives
 * alongside `recordAgentTokens` (which feeds the daily quota row); we keep
 * the per-model split in its own table to avoid touching the quota schema
 * and to allow grouping by `model` for cost-per-model charts.
 *
 * Increments `count` by 1 and tokens by the supplied deltas, upserting the
 * `(userId, day, model)` row. Never throws.
 */
export async function recordAgentModelUsage(
  userId: string,
  model: string,
  tokens: { inputTokens?: number | null; outputTokens?: number | null },
): Promise<void> {
  const trimmed = model.trim();
  if (!trimmed) return;
  const inputTokens = Math.max(0, Math.floor(tokens.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.floor(tokens.outputTokens ?? 0));
  try {
    const day = getTodayUtcDate();
    await db.agentDailyModelUsage.upsert({
      where: { userId_day_model: { userId, day, model: trimmed } },
      create: {
        userId,
        day,
        model: trimmed,
        count: 1,
        inputTokens,
        outputTokens,
      },
      update: {
        count: { increment: 1 },
        inputTokens: { increment: inputTokens },
        outputTokens: { increment: outputTokens },
      },
    });
  } catch (error) {
    log.error("agent_quota.record_model_usage_failed", {
      userId,
      model: trimmed,
      inputTokens,
      outputTokens,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Best-effort token accounting. Never throws — token tracking failures
 * must not break the user-facing reply.
 */
export async function recordAgentTokens(
  userId: string,
  tokens: { inputTokens?: number | null; outputTokens?: number | null },
): Promise<void> {
  const inputTokens = Math.max(0, Math.floor(tokens.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.floor(tokens.outputTokens ?? 0));
  if (inputTokens === 0 && outputTokens === 0) return;
  try {
    await db.agentMessageUsage.update({
      where: { userId_day: { userId, day: getTodayUtcDate() } },
      data: {
        inputTokens: { increment: inputTokens },
        outputTokens: { increment: outputTokens },
      },
    });
  } catch (error) {
    // Most likely cause: the row was wiped between consume and finish, or
    // a race with day rollover. We log and move on — the count is what
    // matters for gating; tokens are only informational.
    log.error("agent_quota.record_tokens_failed", {
      userId,
      inputTokens,
      outputTokens,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Headers used by the chat client to update the usage badge. */
export function quotaHeaders(snapshot: {
  used?: number;
  limit: number;
  remaining: number;
  resetAtUtc: string;
}): Record<string, string> {
  return {
    "x-agent-quota-limit": String(snapshot.limit),
    "x-agent-quota-remaining": String(snapshot.remaining),
    "x-agent-quota-reset": snapshot.resetAtUtc,
  };
}
