import type { NextRequest } from "next/server";

/**
 * Helpers shared by the four passkey API routes (login-options /
 * login-verify / register-options / register-verify) plus the `Passkey`
 * NextAuth provider in `src/lib/auth.ts`.
 *
 * The challenge is round-tripped through an HttpOnly cookie so the client
 * never sees it (and a lurking attacker can't replay one).
 */

const CHALLENGE_COOKIE = "clara_webauthn_challenge";
const CHALLENGE_TTL_SECONDS = 300; // 5 minutes — same as trefolio

export type WebAuthnConfig = {
  rpName: string;
  rpID: string;
  origin: string;
};

/**
 * Resolve the relying-party identity from the public base URL. The same
 * config has to come back when generating options AND when verifying, so
 * we always derive it from the request (or APP_BASE_URL / NEXTAUTH_URL as
 * a fallback for environments that proxy the host header).
 */
export function getWebAuthnConfig(opts?: {
  req?: NextRequest;
  host?: string | null;
  protocol?: string | null;
}): WebAuthnConfig {
  const explicit =
    process.env.APP_BASE_URL ||
    process.env.NEXTAUTH_URL ||
    (opts?.req ? opts.req.nextUrl.origin : undefined);

  let origin = explicit;
  if (!origin && opts?.host) {
    const protocol = opts.protocol || "https";
    origin = `${protocol}://${opts.host}`;
  }
  if (!origin) {
    origin = "http://localhost:3000";
  }
  const url = new URL(origin);
  return {
    rpName: "Clara",
    rpID: url.hostname,
    origin: url.origin,
  };
}

export function getChallengeCookieConfig(challenge: string) {
  return {
    name: CHALLENGE_COOKIE,
    value: challenge,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CHALLENGE_TTL_SECONDS,
  };
}

export function getExpiredChallengeCookieConfig() {
  return {
    name: CHALLENGE_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
}

export function getChallengeFromRequest(req: NextRequest): string | null {
  return req.cookies.get(CHALLENGE_COOKIE)?.value ?? null;
}

/**
 * Read the WebAuthn challenge from a raw `Cookie:` header. NextAuth's
 * `authorize()` exposes only `req.headers` so we cannot use the
 * `NextRequest` cookie API there.
 */
export function getChallengeFromCookieHeader(
  cookieHeader: string | null | undefined,
): string | null {
  if (!cookieHeader) return null;
  // Cookies look like `a=1; b=2; clara_webauthn_challenge=xyz; ...`. We
  // tolerate quoted values just in case the runtime starts wrapping them.
  const parts = cookieHeader.split(";");
  for (const raw of parts) {
    const idx = raw.indexOf("=");
    if (idx === -1) continue;
    const key = raw.slice(0, idx).trim();
    if (key !== CHALLENGE_COOKIE) continue;
    let value = raw.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    return value || null;
  }
  return null;
}

export const CHALLENGE_COOKIE_NAME = CHALLENGE_COOKIE;
