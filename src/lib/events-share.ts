import { createHash, randomBytes } from "node:crypto";

import { db } from "@/lib/db";

/**
 * Stateful share-token primitives for the "share an event wallet" flow.
 *
 * The token itself never lives in the database in plaintext: we generate
 * 32 bytes of cryptographic randomness, encode them as base64url, hash
 * with sha256, and store ONLY the hash. To look up a token at accept
 * time we hash the value coming over the wire and search by equality on
 * `tokenHash` (unique index). This means a database leak does NOT let an
 * attacker reuse outstanding share-links.
 *
 * Tokens carry no embedded metadata — eventId, expiry, and revocation
 * are properties of the row in `EventShareToken`. That's intentional:
 *   1. Revocation is instant (we just set `revokedAt = now()`); a
 *      stateless signed-token approach would either leak access or
 *      require a denylist anyway.
 *   2. We can observe `lastUsedAt` for owner-side analytics ("3 people
 *      have opened this link").
 *   3. A periodic cron can purge expired tokens without coordinating
 *      with anyone.
 *
 * The token format is `<base64url-32-bytes>` — 43 characters of url-safe
 * alphabet, no padding. Total share URL is ~80 chars which still fits in
 * a tweet / WhatsApp / SMS comfortably.
 */

const TOKEN_BYTES = 32;
const DEFAULT_TTL_DAYS = 30;

export type MintTokenInput = {
  eventId: string;
  /** The owner who mints the token. Stored on the row for audit + UI. */
  createdById: string;
  /**
   * Optional override (in days). Defaults to 30. We don't expose this to
   * the UI for now — the assumption is that 30 days is plenty for a trip
   * to be planned and shared. If a longer trip needs it the owner just
   * mints another one.
   */
  ttlDays?: number;
};

export type MintTokenResult = {
  /** The plaintext token. ONLY returned at mint time — never readable again. */
  token: string;
  /** The DB row (without the plaintext, of course). */
  tokenId: string;
  expiresAt: Date;
};

/**
 * Mint a fresh share-token for an event. The plaintext token is returned
 * once and only once; callers must immediately surface it to the user
 * (e.g. by writing it into a `<input value=...>` they can copy).
 */
export async function mintShareToken(
  input: MintTokenInput,
): Promise<MintTokenResult> {
  const ttlDays = input.ttlDays ?? DEFAULT_TTL_DAYS;
  const token = generateTokenString();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  const row = await db.eventShareToken.create({
    data: {
      eventId: input.eventId,
      createdById: input.createdById,
      tokenHash,
      expiresAt,
    },
    select: { id: true, expiresAt: true },
  });

  return { token, tokenId: row.id, expiresAt: row.expiresAt };
}

export type VerifyTokenOk = {
  ok: true;
  eventId: string;
  tokenId: string;
  createdById: string;
  expiresAt: Date;
};

export type VerifyTokenErr = {
  ok: false;
  /**
   * Discriminated reason so the landing page can render a friendly
   * message ("This invite has expired" / "Owner revoked this invite").
   */
  reason: "not_found" | "revoked" | "expired";
};

/**
 * Look up a share token by its plaintext value. Does NOT mark it used —
 * call `markShareTokenUsed` from the accept handler ONLY after the row
 * is verified and the participant has been (or is about to be) created.
 * That two-step pattern keeps "preview" cheap: a guest can hit the
 * landing page repeatedly while deciding without bumping `lastUsedAt`.
 */
export async function verifyShareToken(
  token: string,
): Promise<VerifyTokenOk | VerifyTokenErr> {
  if (!token || typeof token !== "string") {
    return { ok: false, reason: "not_found" };
  }
  const tokenHash = hashToken(token);
  const row = await db.eventShareToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      eventId: true,
      createdById: true,
      expiresAt: true,
      revokedAt: true,
    },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.revokedAt) return { ok: false, reason: "revoked" };
  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }
  return {
    ok: true,
    eventId: row.eventId,
    tokenId: row.id,
    createdById: row.createdById,
    expiresAt: row.expiresAt,
  };
}

/**
 * Bump `lastUsedAt`. Best-effort — a failure here is logged upstream
 * but never blocks the join.
 */
export async function markShareTokenUsed(tokenId: string): Promise<void> {
  await db.eventShareToken.update({
    where: { id: tokenId },
    data: { lastUsedAt: new Date() },
  });
}

/**
 * Soft-revoke a token. Idempotent: revoking an already-revoked token is
 * a no-op (we do not reset `revokedAt`). Verifies that the caller owns
 * the event before doing anything destructive.
 */
export async function revokeShareToken(args: {
  tokenId: string;
  /** Must own the event the token belongs to. */
  callerUserId: string;
}): Promise<{ ok: true } | { ok: false; reason: "not_found" | "forbidden" }> {
  const row = await db.eventShareToken.findUnique({
    where: { id: args.tokenId },
    select: {
      id: true,
      revokedAt: true,
      event: { select: { userId: true } },
    },
  });
  if (!row) return { ok: false, reason: "not_found" };
  if (row.event.userId !== args.callerUserId) {
    return { ok: false, reason: "forbidden" };
  }
  if (row.revokedAt) return { ok: true };
  await db.eventShareToken.update({
    where: { id: args.tokenId },
    data: { revokedAt: new Date() },
  });
  return { ok: true };
}

export type ShareTokenSummary = {
  id: string;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  /**
   * Does NOT include the plaintext (we cannot reconstruct it). The UI
   * shows "Active link" / "Expired" / "Revoked" instead of the raw URL.
   */
};

/**
 * List all share tokens for an event (active + revoked + expired). The
 * caller must own the event — enforce that at the route layer.
 */
export async function listShareTokens(
  eventId: string,
): Promise<ShareTokenSummary[]> {
  const rows = await db.eventShareToken.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
    },
  });
  return rows;
}

/**
 * Compute the public landing URL for a freshly minted token. Lives here
 * so the format ("/events/share/<token>") is defined exactly once and
 * the route file can import the same builder for redirects after revoke.
 */
export function buildShareUrl(token: string, locale = "es"): string {
  const base =
    process.env.NEXTAUTH_URL?.replace(/\/+$/u, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const safeLocale = encodeURIComponent(locale);
  const safeToken = encodeURIComponent(token);
  return `${base}/${safeLocale}/events/share/${safeToken}`;
}

function generateTokenString(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
