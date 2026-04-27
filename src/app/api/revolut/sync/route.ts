import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { runRevolutSyncForMonth } from "@/lib/revolut/sync";
import { requireUserId } from "@/lib/session";
import { revolutSyncSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = revolutSyncSchema.parse(body);

    const connection = await db.revolutConnection.findUnique({
      where: { userId },
      include: { ignoredTxs: { select: { transactionId: true } } },
    });

    if (!connection?.accountId) {
      return jsonError("Revolut no está vinculado o falta la cuenta.", 400);
    }

    const ignoredTransactionIds = new Set(connection.ignoredTxs.map((i) => i.transactionId));

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { expenseImportInstructions: true },
    });

    const result = await runRevolutSyncForMonth({
      userId,
      connectionId: connection.id,
      accountId: connection.accountId,
      monthKey: payload.month,
      ignoredTransactionIds,
      expenseImportInstructions: user?.expenseImportInstructions,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    if (error instanceof Error && error.message === "GOCARDLESS_MISSING_SECRETS") {
      return jsonError("GoCardless no está configurado en el servidor.", 503);
    }
    return jsonError("No se pudo sincronizar con Revolut.", 500);
  }
}
