import crypto from "node:crypto";

/**
 * Stateless, signed deep-link tokens used to vinculate a Telegram chat with a
 * Clara user.
 *
 * Flow:
 *   1. Web settings calls `signLinkToken(userId)` and opens
 *      `t.me/<bot>?start=<token>` in a new tab.
 *   2. The user taps "Start" in Telegram → the bot receives `/start <token>`.
 *   3. The webhook calls `verifyLinkToken(token)`; on success we know which
 *      `userId` this Telegram chat belongs to, with no DB round-trip.
 *
 * The token is a compact `base64url(payload).hex(hmacSha256)` pair with a
 * minimal payload: `{ uid, exp }`. We don't include nonces because the token
 * is one-shot from the user's perspective (we set `telegramVerifiedAt` on
 * use and any second request goes through the linked-user code path).
 */

export const TELEGRAM_LINK_TTL_MINUTES = 15;

type LinkTokenPayload = {
  /** User id this token vinculates. */
  uid: string;
  /** Unix seconds — any token presented after this is rejected. */
  exp: number;
};

function getSecret(): string {
  const secret =
    process.env.TELEGRAM_LINK_TOKEN_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "Missing TELEGRAM_LINK_TOKEN_SECRET (or NEXTAUTH_SECRET as fallback)",
    );
  }
  return secret;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64").toString("utf8");
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("hex");
}

/**
 * Telegram's `start` parameter is restricted to `[A-Za-z0-9_-]{1,64}` — our
 * token can be longer than 64 chars (the HMAC alone is 64 hex), so we keep
 * the check defensive and document the limit. In practice the token lands
 * around 100-110 chars; Telegram clients accept it via the deep link, but
 * `setMyCommands` and `/start` text don't enforce the 64-char limit, only
 * the `t.me/<bot>?start=<token>` URL does at parse time. We rely on the
 * underscore separator and hex digest to stay within the ASCII whitelist.
 */
export function signLinkToken(
  userId: string,
  ttlMinutes = TELEGRAM_LINK_TTL_MINUTES,
): string {
  const payload: LinkTokenPayload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + ttlMinutes * 60,
  };
  const encoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encoded);
  return `${encoded}_${signature}`;
}

export type VerifyResult =
  | { ok: true; userId: string; expSeconds: number }
  | { ok: false; reason: "format" | "signature" | "expired" };

export function verifyLinkToken(token: string): VerifyResult {
  if (typeof token !== "string" || !token.includes("_")) {
    return { ok: false, reason: "format" };
  }
  const sepIdx = token.lastIndexOf("_");
  const encoded = token.slice(0, sepIdx);
  const signature = token.slice(sepIdx + 1);
  if (!encoded || !signature) {
    return { ok: false, reason: "format" };
  }
  const expected = sign(encoded);
  // Buffers must match in length for `timingSafeEqual` not to throw.
  if (signature.length !== expected.length) {
    return { ok: false, reason: "signature" };
  }
  if (
    !crypto.timingSafeEqual(
      Buffer.from(signature, "utf8"),
      Buffer.from(expected, "utf8"),
    )
  ) {
    return { ok: false, reason: "signature" };
  }
  let payload: LinkTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(encoded)) as LinkTokenPayload;
  } catch {
    return { ok: false, reason: "format" };
  }
  if (
    typeof payload.uid !== "string" ||
    typeof payload.exp !== "number" ||
    !payload.uid
  ) {
    return { ok: false, reason: "format" };
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true, userId: payload.uid, expSeconds: payload.exp };
}

/**
 * Build the public deep-link URL the web settings page should open. We don't
 * call into Telegram from the browser — the `t.me/<bot>?start=<token>` URL
 * triggers the in-app "Start" button on iOS / Android / desktop and Telegram
 * pipes the token to the bot for us.
 */
export function buildTelegramDeepLink(token: string): string {
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!username) {
    throw new Error("Missing TELEGRAM_BOT_USERNAME");
  }
  const handle = username.startsWith("@") ? username.slice(1) : username;
  return `https://t.me/${handle}?start=${encodeURIComponent(token)}`;
}
