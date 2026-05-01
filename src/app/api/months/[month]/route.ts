import { jsonError, withApi } from "@/lib/http";
import { loadMonthPageData } from "@/lib/month-page-data";
import { requireUserId } from "@/lib/session";
import { monthParamSchema } from "@/lib/validators";

export async function GET(_request: Request, context: { params: Promise<{ month: string }> }) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });
    return loadMonthPageData(userId, monthKey);
  });
}

/**
 * Antes este endpoint editaba `MonthRecord.income` (un único `Decimal` por
 * mes). A partir de la release que introdujo el modelo de ingresos
 * itemizado, el ingreso del mes vive como `MonthIncomeLine` y se manipula
 * vía `/api/months/[month]/incomes`. Devolvemos 410 Gone para que callers
 * viejos (incluido cualquier MCP cliente) reciban una señal explícita y
 * migren — no intentamos crear una línea sintética acá porque eso oculta el
 * cambio de modelo y mezcla totales viejos con líneas nuevas.
 */
export async function PATCH() {
  return withApi(async () => {
    return jsonError(
      "This endpoint was retired. Use POST /api/months/[month]/incomes to register an income or PATCH /api/months/[month]/incomes/[id] to edit it.",
      410,
    );
  });
}
