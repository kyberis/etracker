import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { createRequisition } from "@/lib/revolut/gocardless";
import { getAppBaseUrl } from "@/lib/revolut/app-url";
import { requireUserId } from "@/lib/session";
import { revolutConnectSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = await request.json();
    const payload = revolutConnectSchema.parse(body);

    const redirect = `${getAppBaseUrl()}/revolut/callback`;
    const requisition = await createRequisition({
      institutionId: payload.institutionId,
      redirect,
      reference: userId,
    });

    await db.revolutConnection.upsert({
      where: { userId },
      create: {
        userId,
        requisitionId: requisition.id,
        institutionId: payload.institutionId,
        status: "PENDING",
      },
      update: {
        requisitionId: requisition.id,
        institutionId: payload.institutionId,
        status: "PENDING",
        accountId: null,
      },
    });

    return NextResponse.json({ link: requisition.link, requisitionId: requisition.id });
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
    return jsonError("No se pudo iniciar la conexión con el banco.", 500);
  }
}
