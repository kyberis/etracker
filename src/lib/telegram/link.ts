import crypto from "node:crypto";

/**
 * Telegram Bot API: the `start` query parameter for `t.me/<bot>?start=...`
 * is at most **64 characters** and may only use `A–Z a–z 0–9 _ and -`.
 * Longer payloads are truncated by clients, so stateless HMAC tokens cannot
 * be used in deep links. We store a short random code on `User` instead.
 *
 * @see https://core.telegram.org/bots/features#deep-linking
 */
export const TELEGRAM_DEEP_LINK_START_MAX_LEN = 64;

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
 * Signed token for **tests and rare manual `/start` pastes** — not for
 * `t.me/...?start=` (see `TELEGRAM_DEEP_LINK_START_MAX_LEN`). Production
 * deep links use `User.telegramLinkCode` via `generateTelegramLinkCode()`.
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

/**
 * Random `start` payload for `t.me/...?start=`. Must stay within Telegram's
 * length limit; 16 base64url chars from 12 bytes of entropy.
 */
export function generateTelegramLinkCode(): string {
  return crypto
    .randomBytes(12)
    .toString("base64url")
    .replace(/=/g, "")
    .slice(0, 16);
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
  if (token.length > TELEGRAM_DEEP_LINK_START_MAX_LEN) {
    throw new Error(
      `Telegram ?start= payload exceeds ${TELEGRAM_DEEP_LINK_START_MAX_LEN} characters`,
    );
  }
  const username = process.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!username) {
    throw new Error("Missing TELEGRAM_BOT_USERNAME");
  }
  const handle = username.startsWith("@") ? username.slice(1) : username;
  return `https://t.me/${handle}?start=${encodeURIComponent(token)}`;
}
