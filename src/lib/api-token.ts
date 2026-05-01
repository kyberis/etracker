import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { db } from "@/lib/db";

/**
 * Prefix new personal-access tokens carry on the wire. Old tokens minted under
 * the previous "ada" naming still carry `ada_pat_` and are accepted for
 * backwards compatibility — see ACCEPTED_TOKEN_PREFIXES below.
 */
export const TOKEN_PREFIX = "clara_pat_";

/**
 * Token prefixes accepted at verification time. The first entry is the prefix
 * we mint today; the rest exist only for tokens issued before a rename. New
 * code MUST use `TOKEN_PREFIX` for generation and display.
 */
export const ACCEPTED_TOKEN_PREFIXES = [TOKEN_PREFIX, "ada_pat_"] as const;

/** Bytes of randomness in the token body (32 bytes → 64 hex chars). */
const TOKEN_BYTES = 32;

/** Length of the user-visible prefix stored alongside the hash. */
const VISIBLE_PREFIX_LEN = TOKEN_PREFIX.length + 4;

export type GeneratedToken = {
  /** Plaintext token. SHOWN ONCE on creation; never persisted. */
  plaintext: string;
  /** Hex sha-256 hash that goes into the DB. */
  tokenHash: string;
  /** Short prefix for UI display (e.g. `clara_pat_3f8a`). */
  prefix: string;
};

/**
 * Generate a fresh personal access token. The plaintext form is returned to
 * the caller exactly once; only the hash + prefix should be persisted.
 */
export function generateToken(): GeneratedToken {
  const random = randomBytes(TOKEN_BYTES).toString("hex");
  const plaintext = `${TOKEN_PREFIX}${random}`;
  return {
    plaintext,
    tokenHash: hashToken(plaintext),
    prefix: plaintext.slice(0, VISIBLE_PREFIX_LEN),
  };
}

/** Hex sha-256 of the plaintext token. Constant cost regardless of input. */
export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Constant-time comparison of two hex hashes of the same length. */
export function safeEqualHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export type AuthenticatedToken = {
  userId: string;
  tokenId: string;
};

/**
 * Verify a `Bearer …` value pulled off a request. Returns `null` on any
 * failure (malformed prefix, unknown hash, revoked, expired). On success we
 * also bump `lastUsedAt` so the user can see when each token was last used
 * in the settings UI.
 */
export async function verifyBearerToken(
  bearer: string | null | undefined,
): Promise<AuthenticatedToken | null> {
  if (!bearer) return null;
  const trimmed = bearer.trim();
  if (!ACCEPTED_TOKEN_PREFIXES.some((p) => trimmed.startsWith(p))) return null;

  const tokenHash = hashToken(trimmed);
  const row = await db.apiToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt && row.expiresAt < new Date()) return null;

  // Best-effort `lastUsedAt` bump — failures here must not block the
  // request, so we swallow errors but log for debugging.
  void db.apiToken
    .update({
      where: { id: row.id },
      data: { lastUsedAt: new Date() },
    })
    .catch((err) => {
      console.error("[api-token] failed to update lastUsedAt", err);
    });

  return { userId: row.userId, tokenId: row.id };
}

/**
 * Pull the `Authorization: Bearer <token>` value out of an incoming
 * `Headers` object. Returns `null` when no header is present or the scheme
 * is not `Bearer`.
 */
export function extractBearer(headers: Headers): string | null {
  const auth = headers.get("authorization");
  if (!auth) return null;
  const [scheme, ...rest] = auth.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  const value = rest.join(" ").trim();
  return value || null;
}

/** Convenience: pull the bearer off a `Request` and verify it in one shot. */
export async function authenticateRequest(
  request: Request,
): Promise<AuthenticatedToken | null> {
  return verifyBearerToken(extractBearer(request.headers));
}
