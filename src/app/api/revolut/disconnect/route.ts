import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function DELETE() {
  try {
    const userId = await requireUserId();
    await db.revolutConnection.deleteMany({ where: { userId } });
    return NextResponse.json({ ok: true as const });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    return jsonError("No se pudo desvincular.", 500);
  }
}
