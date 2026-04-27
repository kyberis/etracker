import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { jsonError } from "@/lib/http";
import { listInstitutions } from "@/lib/revolut/gocardless";
import { requireUserId } from "@/lib/session";
import { revolutInstitutionsQuerySchema } from "@/lib/validators";

export async function GET(request: Request) {
  try {
    await requireUserId();
    const url = new URL(request.url);
    const country = url.searchParams.get("country") ?? "";
    const { country: cc } = revolutInstitutionsQuerySchema.parse({ country });

    const institutions = await listInstitutions(cc);
    const revolut = institutions.filter((i) => /revolut/i.test(i.name));

    return NextResponse.json({ institutions: revolut.length ? revolut : institutions });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid query.", 400);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    if (error instanceof Error && error.message === "GOCARDLESS_MISSING_SECRETS") {
      return jsonError("GoCardless no está configurado en el servidor.", 503);
    }
    return jsonError("No se pudieron cargar los bancos.", 500);
  }
}
