/**
 * Cloudflare Turnstile server-side verification.
 *
 * Mirrors the trefolio implementation in spirit (same env vars, same dev/local
 * skip behaviour) but lives in this repo so we don't take a runtime dependency
 * on a sibling project.
 *
 * Behaviour:
 * - Skipped in `NODE_ENV=development` and `NODE_ENV=test` so local dev never
 *   needs Cloudflare credentials.
 * - Operators can opt out in any environment with `TURNSTILE_DISABLED=1`.
 * - When the request originates from localhost / loopback we treat it as
 *   trusted (covers `npm start` against a real DB without Cloudflare keys).
 * - When `TURNSTILE_SECRET_KEY` is unset we treat verification as a no-op so
 *   self-hosters who haven't configured Cloudflare still get a working signup.
 *   This matches the "optional integrations degrade gracefully" rule from
 *   AGENTS.md.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function isLocalhostHost(host: string | null | undefined): boolean {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1";
}

function isLoopbackIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export async function verifyTurnstileToken(
  token: string | null | undefined,
  ip: string,
  host?: string | null,
): Promise<boolean> {
  if (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test") {
    return true;
  }
  if (process.env.TURNSTILE_DISABLED === "1") return true;
  if (isLocalhostHost(host) || isLoopbackIp(ip)) return true;

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}

/**
 * Pull the originating client IP from common proxy headers. Vercel sets
 * `x-forwarded-for`; we fall back to `x-real-ip` and finally to the empty
 * string (which the verifier treats as "no IP context").
 */
export function getClientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const xri = headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "";
}
