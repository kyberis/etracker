import "server-only";

import { calculateCost } from "@/lib/ai/cost";
import { db } from "@/lib/db";

/**
 * Server-only data layer for the admin analytics dashboard
 * (`/admin/analytics`). All queries are scoped to UTC days to match the
 * `DailyActiveUser.day` and `AgentMessageUsage.day` columns (DATE in PG).
 *
 * Functions return plain serialisable values so RSCs can pass them to
 * client chart components without extra mapping.
 */

const MAX_DAYS = 365;

function clampDays(days: number, fallback: number): number {
  if (!Number.isFinite(days) || days <= 0) return fallback;
  return Math.min(MAX_DAYS, Math.floor(days));
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + n);
  return next;
}

function toIsoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of UTC day keys from `from` (inclusive) to `to` (inclusive). */
function dayKeysBetween(from: Date, to: Date): string[] {
  const keys: string[] = [];
  let cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );
  while (cursor.getTime() <= end.getTime()) {
    keys.push(toIsoDay(cursor));
    cursor = addDays(cursor, 1);
  }
  return keys;
}

export type DauPoint = { day: string; dau: number };

/**
 * Distinct active users per UTC day for the last `days` days. Always
 * returns one point per day in range, zero-filled.
 */
export async function getActiveSeries(days = 90): Promise<DauPoint[]> {
  const range = clampDays(days, 90);
  const today = startOfTodayUtc();
  const start = addDays(today, -(range - 1));

  const rows = await db.dailyActiveUser.groupBy({
    by: ["day"],
    where: { day: { gte: start, lte: today } },
    _count: { userId: true },
  });
  const byDay = new Map<string, number>();
  for (const r of rows) {
    byDay.set(toIsoDay(r.day), r._count.userId);
  }
  return dayKeysBetween(start, today).map((day) => ({
    day,
    dau: byDay.get(day) ?? 0,
  }));
}

export type RollingActive = {
  /** Distinct users seen today (UTC). */
  dau: number;
  /** Distinct users seen in the last 7 days (rolling). */
  wau: number;
  /** Distinct users seen in the last 28 days (rolling). */
  mau: number;
};

export async function getRollingActive(): Promise<RollingActive> {
  const today = startOfTodayUtc();
  const tomorrow = addDays(today, 1);
  const sevenAgo = addDays(today, -6);
  const twentyEightAgo = addDays(today, -27);

  const [todayRows, weekRows, monthRows] = await Promise.all([
    db.dailyActiveUser.findMany({
      where: { day: { gte: today, lt: tomorrow } },
      select: { userId: true },
    }),
    db.dailyActiveUser.findMany({
      where: { day: { gte: sevenAgo, lt: tomorrow } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    db.dailyActiveUser.findMany({
      where: { day: { gte: twentyEightAgo, lt: tomorrow } },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  const distinct = (rows: { userId: string }[]) =>
    new Set(rows.map((r) => r.userId)).size;

  return {
    dau: distinct(todayRows),
    wau: weekRows.length,
    mau: monthRows.length,
  };
}

export type AiSeriesPoint = {
  day: string;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
};

/**
 * Daily totals for AI usage from the per-user quota counter. Cost is
 * computed by summing `calculateCost` over each user-row of the day so
 * mixed-model days are still priced correctly when a row's dominant
 * model is not in the per-model table (older data).
 */
export async function getAiSeries(days = 90): Promise<AiSeriesPoint[]> {
  const range = clampDays(days, 90);
  const today = startOfTodayUtc();
  const start = addDays(today, -(range - 1));

  const [usageRows, modelRows] = await Promise.all([
    db.agentMessageUsage.groupBy({
      by: ["day"],
      where: { day: { gte: start, lte: today } },
      _sum: { count: true, inputTokens: true, outputTokens: true },
    }),
    db.agentDailyModelUsage.groupBy({
      by: ["day", "model"],
      where: { day: { gte: start, lte: today } },
      _sum: { inputTokens: true, outputTokens: true },
    }),
  ]);

  const costByDay = new Map<string, number>();
  for (const r of modelRows) {
    const dayKey = toIsoDay(r.day);
    const cost = calculateCost(r.model, {
      inputTokens: r._sum.inputTokens ?? 0,
      outputTokens: r._sum.outputTokens ?? 0,
      totalTokens:
        (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0),
    }).totalUSD;
    costByDay.set(dayKey, (costByDay.get(dayKey) ?? 0) + cost);
  }

  const usageByDay = new Map<string, (typeof usageRows)[number]>();
  for (const r of usageRows) {
    usageByDay.set(toIsoDay(r.day), r);
  }

  return dayKeysBetween(start, today).map((day) => {
    const u = usageByDay.get(day);
    return {
      day,
      messages: u?._sum.count ?? 0,
      inputTokens: u?._sum.inputTokens ?? 0,
      outputTokens: u?._sum.outputTokens ?? 0,
      costUSD: costByDay.get(day) ?? 0,
    };
  });
}

export type ModelUsage = {
  model: string;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
};

export async function getAiByModel(days = 30): Promise<ModelUsage[]> {
  const range = clampDays(days, 30);
  const today = startOfTodayUtc();
  const start = addDays(today, -(range - 1));

  const rows = await db.agentDailyModelUsage.groupBy({
    by: ["model"],
    where: { day: { gte: start, lte: today } },
    _sum: { count: true, inputTokens: true, outputTokens: true },
  });

  return rows
    .map((r) => {
      const inputTokens = r._sum.inputTokens ?? 0;
      const outputTokens = r._sum.outputTokens ?? 0;
      const cost = calculateCost(r.model, {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
      }).totalUSD;
      return {
        model: r.model,
        messages: r._sum.count ?? 0,
        inputTokens,
        outputTokens,
        costUSD: cost,
      };
    })
    .sort((a, b) => b.messages - a.messages);
}

export type TopUser = {
  userId: string;
  email: string;
  name: string | null;
  messages: number;
  inputTokens: number;
  outputTokens: number;
};

export async function getTopAiUsers(days = 30, limit = 20): Promise<TopUser[]> {
  const range = clampDays(days, 30);
  const top = Math.max(1, Math.min(100, Math.floor(limit) || 20));
  const today = startOfTodayUtc();
  const start = addDays(today, -(range - 1));

  const grouped = await db.agentMessageUsage.groupBy({
    by: ["userId"],
    where: { day: { gte: start, lte: today } },
    _sum: { count: true, inputTokens: true, outputTokens: true },
    orderBy: { _sum: { count: "desc" } },
    take: top,
  });

  if (grouped.length === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: grouped.map((g) => g.userId) } },
    select: { id: true, email: true, name: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return grouped.map((g) => {
    const u = userById.get(g.userId);
    return {
      userId: g.userId,
      email: u?.email ?? "(deleted)",
      name: u?.name ?? null,
      messages: g._sum.count ?? 0,
      inputTokens: g._sum.inputTokens ?? 0,
      outputTokens: g._sum.outputTokens ?? 0,
    };
  });
}

export type AnalyticsBundle = {
  range: { days: number; from: string; to: string };
  rolling: RollingActive;
  active: DauPoint[];
  ai: AiSeriesPoint[];
  byModel: ModelUsage[];
  topUsers: TopUser[];
  totals: {
    messages: number;
    inputTokens: number;
    outputTokens: number;
    costUSD: number;
  };
};

/** Convenience aggregator used by `page.tsx`. */
export async function getAnalyticsBundle(days = 90): Promise<AnalyticsBundle> {
  const range = clampDays(days, 90);
  const today = startOfTodayUtc();
  const start = addDays(today, -(range - 1));

  const [rolling, active, ai, byModel, topUsers] = await Promise.all([
    getRollingActive(),
    getActiveSeries(range),
    getAiSeries(range),
    getAiByModel(Math.min(range, 30)),
    getTopAiUsers(Math.min(range, 30)),
  ]);

  const totals = ai.reduce(
    (acc, p) => {
      acc.messages += p.messages;
      acc.inputTokens += p.inputTokens;
      acc.outputTokens += p.outputTokens;
      acc.costUSD += p.costUSD;
      return acc;
    },
    { messages: 0, inputTokens: 0, outputTokens: 0, costUSD: 0 },
  );

  return {
    range: { days: range, from: toIsoDay(start), to: toIsoDay(today) },
    rolling,
    active,
    ai,
    byModel,
    topUsers,
    totals,
  };
}
