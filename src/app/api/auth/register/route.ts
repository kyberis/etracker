import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { registerSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
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

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Datos no válidos.", 400);
    }
    if (
      error instanceof Prisma.PrismaClientInitializationError ||
      error instanceof Prisma.PrismaClientKnownRequestError
    ) {
      return jsonError(
        "No se pudo conectar a la base de datos. Revisá DATABASE_URL y las migraciones de Prisma.",
        500,
      );
    }
    return jsonError("No se pudo crear la cuenta.", 500);
  }
}
