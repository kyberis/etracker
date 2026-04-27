import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { revolutDefaultBankSchema } from "@/lib/validators";

export async function PATCH(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = revolutDefaultBankSchema.parse(body);

    const connection = await db.revolutConnection.findUnique({ where: { userId } });
    if (!connection) {
      return jsonError("No hay conexión Revolut.", 404);
    }

    const bank = await db.bank.findFirst({
      where: { id: payload.bankId, userId },
    });
    if (!bank) {
      return jsonError("El banco no existe.", 404);
    }

    await db.revolutConnection.update({
      where: { id: connection.id },
      data: { defaultImportBankId: payload.bankId },
    });

    return NextResponse.json({ ok: true as const, defaultImportBankId: payload.bankId });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("No se pudo guardar.", 500);
  }
}
