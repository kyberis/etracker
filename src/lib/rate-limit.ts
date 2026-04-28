import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import { jsonError } from "@/lib/http";

/**
 * Lightweight Upstash rate-limit helpers. Returns a no-op limiter (always
 * allows) when `UPSTASH_REDIS_REST_URL`/`TOKEN` are missing — that's the
 * intended behavior for local dev and is documented in `.env.example`.
 */

type Window = `${number} ${"s" | "m" | "h" | "d"}`;

let cachedRedis: Redis | null = null;
function getRedis(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    return null;
  }
  if (!cachedRedis) {
    cachedRedis = Redis.fromEnv();
  }
  return cachedRedis;
}

const limiterCache = new Map<string, Ratelimit>();
function getLimiter(name: string, limit: number, window: Window): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;
  const cacheKey = `${name}:${limit}:${window}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      analytics: true,
      prefix: `etracker.ratelimit.${name}`,
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "127.0.0.1";
}

export type RateLimitOk = { ok: true; remaining: number };
export type RateLimitDenied = { ok: false; response: Response };
export type RateLimitResult = RateLimitOk | RateLimitDenied;

async function check(
  limiter: Ratelimit | null,
  key: string,
  message: string,
): Promise<RateLimitResult> {
  if (!limiter) return { ok: true, remaining: Number.POSITIVE_INFINITY };
  const result = await limiter.limit(key);
  if (result.success) return { ok: true, remaining: result.remaining };
  const retryAfter = Math.max(0, Math.ceil((result.reset - Date.now()) / 1000));
  const res = jsonError(message, 429);
  res.headers.set("Retry-After", String(retryAfter));
  return { ok: false, response: res };
}

/** Allow `limit` requests per `window` per client IP. */
export async function limitByIp(
  request: Request,
  name: string,
  limit: number,
  window: Window,
  message = "Demasiados intentos. Probá de nuevo más tarde.",
): Promise<RateLimitResult> {
  const limiter = getLimiter(name, limit, window);
  return check(limiter, `ip:${getClientIp(request)}`, message);
}

/** Allow `limit` requests per `window` per user id. */
export async function limitByUser(
  name: string,
  userId: string,
  limit: number,
  window: Window,
  message = "Llegaste al límite por ahora. Probá de nuevo más tarde.",
): Promise<RateLimitResult> {
  const limiter = getLimiter(name, limit, window);
  return check(limiter, `user:${userId}`, message);
}
