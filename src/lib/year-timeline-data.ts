import { getCache } from "@vercel/functions";

import { db } from "@/lib/db";
import { formatMonthKey, parseMonthKey, toMonthStart } from "@/lib/months";

export type YearMonthSlot = {
  key: string;
  month: number;
  hasBucket: boolean;
  income: number;
  totalExpense: number;
  isFuture: boolean;
  isCurrent: boolean;
  balance: number | null;
  variant: "empty" | "future" | "pastOrCurrent";
};

function utcNowMonthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * Cache key for the per-user year timeline. Mutating handlers call
 * `expireYearTimeline(userId, year)` so the next request rebuilds.
 */
export function yearTimelineTag(userId: string, year: number) {
  return `year-timeline:${userId}:${year}`;
}

const CACHE_NAMESPACE = "etracker:year-timeline";
/** 1 hour: month-mutating handlers also bust the tag explicitly. */
const CACHE_TTL_SECONDS = 60 * 60;

type YearTimelinePayload = { year: number; months: YearMonthSlot[] };

function tryGetCache(): ReturnType<typeof getCache> | null {
  try {
    return getCache({ namespace: CACHE_NAMESPACE });
  } catch {
    return null;
  }
}

/** Best-effort eviction of the cached year timeline for a user/year pair. */
export async function expireYearTimeline(
  userId: string,
  year: number,
): Promise<void> {
  const cache = tryGetCache();
  if (!cache) return;
  try {
    await cache.expireTag(yearTimelineTag(userId, year));
  } catch {
    /* nothing to do outside Vercel runtime */
  }
}

async function buildYearTimelineData(
  userId: string,
  year: number,
): Promise<YearTimelinePayload> {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEndExclusive = new Date(Date.UTC(year + 1, 0, 1));

  const yearRecords = await db.monthRecord.findMany({
    where: {
      userId,
      month: { gte: yearStart, lt: yearEndExclusive },
    },
    include: { lines: { select: { amount: true } } },
  });

  const byKey = new Map(
    yearRecords.map((r) => {
      const key = formatMonthKey(r.month);
      const totalExpense = r.lines.reduce((s, l) => s + Number(l.amount), 0);
      return [key, { income: Number(r.income), totalExpense }];
    }),
  );

  const now = utcNowMonthStart();
  const months: YearMonthSlot[] = [];

  for (let m = 0; m < 12; m += 1) {
    const monthNum = m + 1;
    const key = `${year}-${String(monthNum).padStart(2, "0")}`;
    const monthDate = toMonthStart(parseMonthKey(key));
    const isFuture = monthDate.getTime() > now.getTime();
    const isCurrent = monthDate.getTime() === now.getTime();

    const rec = byKey.get(key);
    const hasBucket = Boolean(rec);
    const income = rec?.income ?? 0;
    const totalExpense = rec?.totalExpense ?? 0;
    const balance = hasBucket ? income - totalExpense : null;

    let variant: YearMonthSlot["variant"];
    if (!hasBucket) variant = "empty";
    else if (isFuture) variant = "future";
    else variant = "pastOrCurrent";

    months.push({
      key,
      month: monthNum,
      hasBucket,
      income,
      totalExpense,
      isFuture,
      isCurrent,
      balance,
      variant,
    });
  }

  return { year, months };
}

/**
 * Per-user/year timeline used by the dashboard sidebar. Cached in Vercel
 * Runtime Cache (`@vercel/functions`) and tag-busted by mutating handlers.
 * Falls through to a direct DB query when running outside a Vercel function.
 */
export async function getYearTimelineData(
  userId: string,
  year: number,
): Promise<YearTimelinePayload> {
  const cache = tryGetCache();
  const cacheKey = `${userId}:${year}`;

  if (cache) {
    const cached = (await cache.get(cacheKey)) as YearTimelinePayload | null;
    if (cached) return cached;
  }

  const payload = await buildYearTimelineData(userId, year);

  if (cache) {
    await cache.set(cacheKey, payload, {
      ttl: CACHE_TTL_SECONDS,
      tags: [yearTimelineTag(userId, year)],
    });
  }
  return payload;
}
