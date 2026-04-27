import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function GET() {
  try {
    const userId = await requireUserId();
    const connection = await db.revolutConnection.findUnique({
      where: { userId },
      select: {
        status: true,
        institutionId: true,
        accountId: true,
        lastSyncAt: true,
        defaultImportBankId: true,
        requisitionId: true,
      },
    });

    if (!connection) {
      return NextResponse.json({ connected: false as const });
    }

    const linked = Boolean(connection.accountId);

    return NextResponse.json({
      connected: true as const,
      linked,
      pending: !linked,
      institutionId: connection.institutionId,
      lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
      defaultImportBankId: connection.defaultImportBankId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("No se pudo leer el estado.", 500);
  }
}
