/**
 * Email verification: sign a JWT, mail it via Resend, and verify it on the
 * round-trip GET. Mirrors trefolio's pattern (jose + Resend + a `purpose`
 * claim) without taking a runtime dependency on that codebase.
 *
 * Env vars are intentionally aligned with trefolio so the same Vercel
 * project configuration works on both sides:
 *   - `RESEND_API_KEY`           — Resend secret (shared with trefolio).
 *   - `RESEND_FROM_ADDRESS`      — sender; defaults to a Clara subdomain.
 *   - `APP_BASE_URL`             — preferred public base URL for absolute
 *                                  links. Falls back to `NEXT_PUBLIC_APP_URL`
 *                                  and finally `NEXTAUTH_URL` for older
 *                                  Clara deploys.
 *   - `APP_SESSION_SECRET`       — preferred JWT signing secret. Falls back
 *                                  to `NEXTAUTH_SECRET`, which NextAuth
 *                                  already requires, so self-hosters get
 *                                  verification "for free" once Resend is
 *                                  configured.
 *
 * Behaviour when Resend is not configured (`RESEND_API_KEY` missing):
 *  - We do **not** silently mark the user as verified.
 *  - Instead, the verification link is logged to the server console and
 *    `sendVerificationEmail` returns `{ ok: false, reason: "not_configured" }`.
 *    The caller decides whether to surface that to the user. In `next dev`
 *    this lets you click the link from the terminal; in production an
 *    operator sees a clear log line they can act on.
 */

import { Resend } from "resend";
import { SignJWT, jwtVerify } from "jose";

import { log } from "@/lib/log";
import type { Locale } from "@/lib/i18n/locale";

const VERIFICATION_TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24h
const PURPOSE = "clara_email_verification";

function getSecret(): Uint8Array {
  const secret =
    process.env.APP_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "APP_SESSION_SECRET (or NEXTAUTH_SECRET) is required to sign verification tokens. Set it in your .env.",
    );
  }
  return new TextEncoder().encode(secret);
}

function getBaseUrl(): string {
  const candidate =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  return candidate.replace(/\/$/, "");
}

function getFromAddress(): string {
  return (
    process.env.RESEND_FROM_ADDRESS ||
    "Clara <noreply@clara.trefolio.com>"
  );
}

export async function createVerificationToken(
  userId: string,
  email: string,
): Promise<string> {
  return new SignJWT({ userId, email, purpose: PURPOSE })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime(`${VERIFICATION_TOKEN_TTL_SECONDS}s`)
    .sign(getSecret());
}

export interface VerifiedTokenPayload {
  userId: string;
  email: string;
}

export async function verifyVerificationToken(
  token: string,
): Promise<VerifiedTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    if (payload.purpose !== PURPOSE) return null;
    if (typeof payload.userId !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}

const SUBJECT: Record<Locale, string> = {
  es: "Confirmá tu email para Clara",
  en: "Confirm your email for Clara",
};

const HEADING: Record<Locale, string> = {
  es: "Una sola cosa más",
  en: "One more thing",
};

const BODY: Record<Locale, string> = {
  es: "Tocá el botón para confirmar que este email es tuyo. Después podés iniciar sesión con tu contraseña.",
  en: "Tap the button to confirm this email is yours. After that you can sign in with your password.",
};

const CTA: Record<Locale, string> = {
  es: "Confirmar email",
  en: "Confirm email",
};

const FALLBACK: Record<Locale, string> = {
  es: "Si el botón no funciona, copiá y pegá este enlace en tu navegador:",
  en: "If the button does not work, copy and paste this link in your browser:",
};

const EXPIRY: Record<Locale, string> = {
  es: "El enlace vence en 24 horas.",
  en: "The link expires in 24 hours.",
};

const IGNORE: Record<Locale, string> = {
  es: "¿No te registraste? Ignorá este email.",
  en: "Did not sign up? Just ignore this email.",
};

function renderHtml(verifyUrl: string, locale: Locale): string {
  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="padding:36px 32px 16px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0f172a;text-align:center;">${HEADING[locale]}</h1>
          <p style="margin:0 0 28px;font-size:15px;color:#475569;text-align:center;line-height:1.6;">${BODY[locale]}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr><td align="center">
              <a href="${verifyUrl}" target="_blank" style="display:inline-block;padding:14px 36px;background-color:#0f172a;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:10px;letter-spacing:0.2px;">${CTA[locale]}</a>
            </td></tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">${FALLBACK[locale]}</p>
          <p style="margin:6px 0 0;font-size:12px;color:#0f172a;text-align:center;word-break:break-all;line-height:1.5;">
            <a href="${verifyUrl}" style="color:#0f172a;text-decoration:underline;">${verifyUrl}</a>
          </p>
        </td></tr>
        <tr><td style="padding:0 32px;"><div style="border-top:1px solid #e2e8f0;margin:24px 0;"></div></td></tr>
        <tr><td style="padding:0 32px 32px;">
          <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">${EXPIRY[locale]}</p>
          <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">${IGNORE[locale]}</p>
        </td></tr>
      </table>
      <p style="margin:24px 0 0;font-size:11px;color:#94a3b8;text-align:center;">&copy; ${new Date().getFullYear()} Clara</p>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface SendResult {
  ok: boolean;
  reason?: "not_configured" | "send_failed";
}

/**
 * Build the public verification URL for a token. Exposed for testing.
 */
export function verificationUrl(token: string): string {
  return `${getBaseUrl()}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
}

export async function sendVerificationEmail(
  email: string,
  token: string,
  locale: Locale,
): Promise<SendResult> {
  const url = verificationUrl(token);
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    log.warn("verify_email_not_configured", { email, url });
    return { ok: false, reason: "not_configured" };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: email,
      subject: SUBJECT[locale],
      html: renderHtml(url, locale),
    });
    if (error) {
      log.error("verify_email_send_failed", { email, error: error.message });
      return { ok: false, reason: "send_failed" };
    }
    log.info("verify_email_sent", { email });
    return { ok: true };
  } catch (err) {
    log.error("verify_email_send_threw", {
      email,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "send_failed" };
  }
}
