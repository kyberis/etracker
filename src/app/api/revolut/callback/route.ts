import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { getRequisition } from "@/lib/revolut/gocardless";
import { requireUserId } from "@/lib/session";

export async function GET(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const ref = url.searchParams.get("ref");
    if (!ref?.length) {
      return jsonError("Falta el identificador de la sesión bancaria.", 400);
    }

    const connection = await db.revolutConnection.findFirst({
      where: { userId, requisitionId: ref },
    });
    if (!connection) {
      return jsonError("No encontramos una vinculación pendiente para tu usuario.", 404);
    }

    const remote = await getRequisition(ref);
    const accountId = remote.accounts?.[0] ?? null;

    if (!accountId) {
      return {
        ok: false as const,
        status: remote.status,
        message:
          "Todavía no hay cuentas vinculadas. Si acabás de autorizar, probá de nuevo en unos segundos.",
      };
    }

    await db.revolutConnection.update({
      where: { id: connection.id },
      data: { accountId, status: "LINKED" },
    });

    return { ok: true as const, accountId };
  });
}
