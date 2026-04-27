import bcrypt from "bcrypt";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { settingsSchema } from "@/lib/validators";

export async function GET() {
  try {
    const userId = await requireUserId();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        expenseImportInstructions: true,
        passwordHash: true,
        accounts: { select: { provider: true } },
      },
    });
    if (!user) {
      return jsonError("Usuario no encontrado.", 404);
    }

    return NextResponse.json({
      user: {
        email: user.email,
        expenseImportInstructions: user.expenseImportInstructions,
        hasPassword: user.passwordHash != null,
        linkedProviders: user.accounts.map((a) => a.provider),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("No autorizado.", 401);
    }
    return jsonError("No se pudo cargar la configuración.", 500);
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = settingsSchema.parse(body);

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return jsonError("Usuario no encontrado.", 404);
    }

    if (payload.newPassword) {
      if (user.passwordHash) {
        if (!payload.currentPassword) {
          return jsonError("Tenés que ingresar la contraseña actual.", 400);
        }
        const validCurrent = await bcrypt.compare(payload.currentPassword, user.passwordHash);
        if (!validCurrent) {
          return jsonError("La contraseña actual no es correcta.", 401);
        }
      }
    }

    await db.user.update({
      where: { id: userId },
      data: {
        ...(payload.newPassword
          ? { passwordHash: await bcrypt.hash(payload.newPassword, 12) }
          : {}),
        ...(payload.expenseImportInstructions !== undefined
          ? { expenseImportInstructions: payload.expenseImportInstructions }
          : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Datos no válidos.", 400);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("No autorizado.", 401);
    }
    return jsonError("No se pudo actualizar la configuración.", 500);
  }
}
