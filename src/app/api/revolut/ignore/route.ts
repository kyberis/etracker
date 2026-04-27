import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import { revolutIgnoreSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = revolutIgnoreSchema.parse(body);

    const connection = await db.revolutConnection.findUnique({ where: { userId } });
    if (!connection) {
      return jsonError("No hay conexión Revolut.", 404);
    }

    await db.ignoredTransaction.createMany({
      data: payload.transactionIds.map((transactionId) => ({
        connectionId: connection.id,
        transactionId,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ ok: true as const });
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
