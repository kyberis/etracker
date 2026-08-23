import { getCache } from "@vercel/functions";

import { db } from "@/lib/db";
import { log } from "@/lib/log";

/**
 * Global, admin-toggleable feature flag system with per-user overrides.
 *
 * Resolution order (highest precedence first):
 *  1. Per-user override (`FeatureFlagOverride` row for this user + key).
 *  2. Global value (`FeatureFlag` row for this key).
 *  3. Registry default (`FEATURE_FLAGS[key].defaultEnabled`).
 *
 * Reads are cached in Vercel Runtime Cache (60s TTL, tag invalidation on
 * write). When running outside Vercel — local CLI scripts, vitest — the
 * cache wrapper transparently falls through to a direct DB read.
 *
 * The registry is the source of truth for which flags exist and their
 * default state. Adding a flag here makes it appear in the admin UI; no
 * migration is needed because rows are created lazily on first toggle.
 */

export type FeatureFlagKey = "quota_upsell" | "open_banking";

type FeatureFlagDefinition = {
  description: string;
  /** Default state when no DB row exists. Always pessimistic: off. */
  defaultEnabled: boolean;
};

export const FEATURE_FLAGS: Record<FeatureFlagKey, FeatureFlagDefinition> = {
  quota_upsell: {
    description:
      "Mostrar el modal de donación + suscripción cuando un usuario llega al límite diario del agente. Requiere que las variables STRIPE_* estén configuradas.",
    defaultEnabled: false,
  },
  open_banking: {
    description:
      "Conectar bancos europeos vía Enable Banking (PSD2). Requiere ENABLE_BANKING_* y BANK_SYNC_ENCRYPTION_KEY. Default off; activar por entorno o override de usuario.",
    defaultEnabled: false,
  },
};

export function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, value);
}

const CACHE_NAMESPACE = "etracker:feature-flags";
const CACHE_TTL_SECONDS = 60;

function globalCacheKey(key: FeatureFlagKey): string {
  return `global:${key}`;
}

function userCacheKey(userId: string, key: FeatureFlagKey): string {
  return `user:${userId}:${key}`;
}

export function featureFlagTag(key: FeatureFlagKey): string {
  return `feature-flag:${key}`;
}

function tryGetCache(): ReturnType<typeof getCache> | null {
  try {
    return getCache({ namespace: CACHE_NAMESPACE });
  } catch {
    return null;
  }
}

/**
 * Returns the effective value of `key` for `userId` (or globally when
 * `userId` is omitted). Never throws — falls back to the registry default
 * if the DB is unreachable.
 */
export async function isFeatureEnabled(
  key: FeatureFlagKey,
  userId?: string,
): Promise<boolean> {
  const def = FEATURE_FLAGS[key];
  const cache = tryGetCache();

  if (userId) {
    const overrideKey = userCacheKey(userId, key);
    if (cache) {
      const cached = (await cache.get(overrideKey)) as
        | { enabled: boolean }
        | null;
      if (cached) return cached.enabled;
    }
    try {
      const row = await db.featureFlagOverride.findUnique({
        where: { userId_key: { userId, key } },
        select: { enabled: true },
      });
      if (row) {
        if (cache) {
          await cache.set(overrideKey, { enabled: row.enabled }, {
            ttl: CACHE_TTL_SECONDS,
            tags: [featureFlagTag(key)],
          });
        }
        return row.enabled;
      }
    } catch (error) {
      log.error("feature_flags.override_read_failed", {
        userId,
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const globalKey = globalCacheKey(key);
  if (cache) {
    const cached = (await cache.get(globalKey)) as
      | { enabled: boolean }
      | null;
    if (cached) return cached.enabled;
  }
  try {
    const row = await db.featureFlag.findUnique({
      where: { key },
      select: { enabled: true },
    });
    const enabled = row ? row.enabled : def.defaultEnabled;
    if (cache) {
      await cache.set(globalKey, { enabled }, {
        ttl: CACHE_TTL_SECONDS,
        tags: [featureFlagTag(key)],
      });
    }
    return enabled;
  } catch (error) {
    log.error("feature_flags.global_read_failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
    return def.defaultEnabled;
  }
}

/**
 * Sets the global value for `key`. Audit `updatedBy` should be the admin
 * id. Invalidates every cached read of this flag (global + per-user
 * overrides) by tag.
 */
export async function setFeatureEnabled(
  key: FeatureFlagKey,
  enabled: boolean,
  updatedBy: string,
): Promise<void> {
  await db.featureFlag.upsert({
    where: { key },
    create: { key, enabled, updatedBy },
    update: { enabled, updatedBy },
  });
  await invalidateFeatureFlagCache(key);
}

/**
 * Sets a per-user override for `key`. Pass `enabled: null` to remove the
 * override (so the user falls back to the global value).
 */
export async function setUserFeatureOverride(
  key: FeatureFlagKey,
  userId: string,
  enabled: boolean | null,
): Promise<void> {
  if (enabled === null) {
    await db.featureFlagOverride
      .delete({ where: { userId_key: { userId, key } } })
      .catch(() => {
        // Idempotent: missing row is fine.
      });
  } else {
    await db.featureFlagOverride.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, enabled },
      update: { enabled },
    });
  }
  await invalidateFeatureFlagCache(key);
}

/** Best-effort cache invalidation. Outside Vercel runtime: nothing to do. */
export async function invalidateFeatureFlagCache(
  key: FeatureFlagKey,
): Promise<void> {
  const cache = tryGetCache();
  if (!cache) return;
  try {
    await cache.expireTag(featureFlagTag(key));
  } catch (error) {
    log.error("feature_flags.cache_invalidate_failed", {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export type FeatureFlagSnapshot = {
  key: FeatureFlagKey;
  description: string;
  enabled: boolean;
  defaultEnabled: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

/**
 * Snapshot of every flag in the registry, enriched with current DB state.
 * Used by the admin panel; not cached — admins pay a real round trip so
 * they never see a stale toggle.
 */
export async function listFeatureFlags(): Promise<FeatureFlagSnapshot[]> {
  const rows = await db.featureFlag.findMany();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return (Object.keys(FEATURE_FLAGS) as FeatureFlagKey[]).map((key) => {
    const def = FEATURE_FLAGS[key];
    const row = byKey.get(key);
    return {
      key,
      description: def.description,
      enabled: row ? row.enabled : def.defaultEnabled,
      defaultEnabled: def.defaultEnabled,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  });
}
