import { getCache } from "@vercel/functions";

import { db } from "@/lib/db";

/**
 * Runtime Cache key for the per-user banks list. Mutating handlers call
 * `cacheClient.expireTag(banksTag(userId))` to evict on bank create/update/delete.
 */
export function banksTag(userId: string) {
  return `banks:${userId}`;
}

export type CachedBank = {
  id: string;
  userId: string;
  name: string;
  color: string | null;
};

const CACHE_NAMESPACE = "etracker:banks";
/** Six hours: banks change rarely; we bust the tag on writes anyway. */
const CACHE_TTL_SECONDS = 6 * 60 * 60;

/**
 * Returns the user's banks (sorted by name asc), backed by Vercel Runtime
 * Cache. Bypasses the cache when running outside of a Vercel function (no
 * `getCache()` provider available — falls through to a direct DB query).
 */
export async function getBanksCached(userId: string): Promise<CachedBank[]> {
  let cache: ReturnType<typeof getCache> | null = null;
  try {
    cache = getCache({ namespace: CACHE_NAMESPACE });
  } catch {
    cache = null;
  }

  const cacheKey = `byUser:${userId}`;
  if (cache) {
    const cached = (await cache.get(cacheKey)) as CachedBank[] | null;
    if (cached) return cached;
  }

  const banks = await db.bank.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  });

  const payload: CachedBank[] = banks.map((b) => ({
    id: b.id,
    userId: b.userId,
    name: b.name,
    color: b.color,
  }));

  if (cache) {
    await cache.set(cacheKey, payload, {
      ttl: CACHE_TTL_SECONDS,
      tags: [banksTag(userId)],
    });
  }
  return payload;
}

/** Best-effort: invalidate the user's cached banks list after a write. */
export async function invalidateBanksCache(userId: string): Promise<void> {
  try {
    const cache = getCache({ namespace: CACHE_NAMESPACE });
    await cache.expireTag(banksTag(userId));
  } catch {
    /* outside Vercel runtime — nothing to evict. */
  }
}
