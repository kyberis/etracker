import bcrypt from "bcrypt";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { pickFromAcceptLanguage } from "@/lib/i18n/locale";
import { CURRENT_TERMS_VERSION } from "@/lib/legal";
import { limitByIp } from "@/lib/rate-limit";
import { notifyAdminOfNewUser } from "@/lib/signup-notify";
import { getClientIp, verifyTurnstileToken } from "@/lib/turnstile";
import {
  createVerificationToken,
  sendVerificationEmail,
} from "@/lib/verification-email";
import { registerSchema } from "@/lib/validators";

export async function POST(request: Request) {
  return withApi(async () => {
    // 5 signups per 15 minutes per IP — defense against bot signup floods.
    const limited = await limitByIp(
      request,
      "auth-register",
      5,
      "15 m",
      "Too many registration attempts. Try again in a few minutes.",
    );
    if (!limited.ok) return limited.response;

    if (!process.env.DATABASE_URL) {
      return jsonError(
        "The database is not configured. Set DATABASE_URL in your .env and restart the app.",
        500,
      );
    }

    const body = await request.json();
    const payload = registerSchema.parse(body);

    // Defensive: if the form submitted a stale terms version, refuse the
    // registration. The UI always sends the live `CURRENT_TERMS_VERSION`,
    // but a hand-crafted POST shouldn't be able to consent to nothing.
    if (payload.acceptedTermsVersion !== CURRENT_TERMS_VERSION) {
      return jsonError(
        "You must accept the current Terms and Privacy Policy.",
        400,
      );
    }

    const ip = getClientIp(request.headers);
    const captchaOk = await verifyTurnstileToken(
      payload.turnstileToken,
      ip,
      request.headers.get("host"),
    );
    if (!captchaOk) {
      return jsonError(
        "We couldn't validate the captcha. Reload the page and try again.",
        403,
      );
    }

    const existing = await db.user.findUnique({ where: { email: payload.email } });
    if (existing) {
      return jsonError(
        "That email is already registered. If you signed up with Google, sign in with Google.",
        409,
      );
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);

    const user = await db.user.create({
      data: {
        email: payload.email,
        passwordHash,
        acceptedTermsAt: new Date(),
        acceptedTermsVersion: payload.acceptedTermsVersion,
      },
      select: { id: true, email: true },
    });

    const locale = pickFromAcceptLanguage(request.headers.get("accept-language"));
    const verificationToken = await createVerificationToken(user.id, user.email);
    const sendResult = await sendVerificationEmail(
      user.email,
      verificationToken,
      locale,
    );

    // Best-effort admin ping. Failures are swallowed inside the helper so a
    // flaky Resend call never blocks signup; we don't `await` for the same
    // reason — the user-facing response shouldn't wait on operator mail.
    void notifyAdminOfNewUser({
      userId: user.id,
      email: user.email,
      source: "credentials",
    });

    return new Response(
      JSON.stringify({
        ok: true,
        needsVerification: true,
        // Surface this so the UI can hint "no llegó el mail, mirá la consola"
        // when the operator hasn't configured Resend yet.
        emailDelivered: sendResult.ok,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      },
    );
  });
}
