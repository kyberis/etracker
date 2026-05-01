import bcrypt from "bcrypt";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { pickFromAcceptLanguage } from "@/lib/i18n/locale";
import { limitByIp } from "@/lib/rate-limit";
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
      "Demasiados intentos de registro. Probá de nuevo en unos minutos.",
    );
    if (!limited.ok) return limited.response;

    if (!process.env.DATABASE_URL) {
      return jsonError(
        "La base de datos no está configurada. Definí DATABASE_URL en tu .env y reiniciá la app.",
        500,
      );
    }

    const body = await request.json();
    const payload = registerSchema.parse(body);

    const ip = getClientIp(request.headers);
    const captchaOk = await verifyTurnstileToken(
      payload.turnstileToken,
      ip,
      request.headers.get("host"),
    );
    if (!captchaOk) {
      return jsonError(
        "No pudimos validar el captcha. Recargá la página y probá de nuevo.",
        403,
      );
    }

    const existing = await db.user.findUnique({ where: { email: payload.email } });
    if (existing) {
      return jsonError(
        "Ese correo ya está registrado. Si usás Google, iniciá sesión con Google.",
        409,
      );
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);

    const user = await db.user.create({
      data: {
        email: payload.email,
        passwordHash,
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
