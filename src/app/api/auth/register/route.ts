import bcrypt from "bcrypt";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { limitByIp } from "@/lib/rate-limit";
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

    const existing = await db.user.findUnique({ where: { email: payload.email } });
    if (existing) {
      return jsonError(
        "Ese correo ya está registrado. Si usás Google, iniciá sesión con Google.",
        409,
      );
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);

    await db.user.create({
      data: {
        email: payload.email,
        passwordHash,
      },
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  });
}
