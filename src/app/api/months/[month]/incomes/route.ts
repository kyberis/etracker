import { db } from "@/lib/db";
import {
  isUniqueViolation,
  parseIsoDate,
  todayUtcDate,
} from "@/lib/expense-line";
import { FxUnavailableError, convertToPrimary } from "@/lib/fx/rates";
import { jsonError, withApi } from "@/lib/http";
import { isCurrentMonthKey, parseMonthKey, toMonthStart } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { monthIncomeLineCreateSchema, monthParamSchema } from "@/lib/validators";
import { expireYearTimeline } from "@/lib/year-timeline-data";

/**
 * Crear una línea de ingreso para el mes actual. Espejo de
 * `POST /api/months/[month]/lines` para gastos. Solo permitido en el mes en
 * curso (igual que los gastos): cobros pasados se cargan editando el mes
 * correspondiente vía herramientas de agente o flujo de import.
 */
export async function POST(request: Request, context: { params: Promise<{ month: string }> }) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });

    if (!isCurrentMonthKey(monthKey)) {
      return jsonError("Solo se pueden agregar ingresos al mes en curso.", 403);
    }

    const month = toMonthStart(parseMonthKey(monthKey));
    const body = await request.json();
    const payload = monthIncomeLineCreateSchema.parse(body);

    const [user, monthRecord] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { primaryCurrency: true },
      }),
      db.monthRecord.findFirst({ where: { userId, month } }),
    ]);
    if (!user) return jsonError("Usuario no encontrado.", 404);
    if (!monthRecord) return jsonError("Set up the month first.", 404);

    if (payload.bankId) {
      const bank = await db.bank.findFirst({
        where: { id: payload.bankId, userId },
      });
      if (!bank) {
        return jsonError("El banco no existe.", 404);
      }
    }

    let converted;
    try {
      converted = await convertToPrimary({
        amount: payload.amount,
        currency: payload.currency ?? user.primaryCurrency,
        primary: user.primaryCurrency,
        fxRate: payload.fxRate,
      });
    } catch (error) {
      if (error instanceof FxUnavailableError) {
        return jsonError(
          `Could not fetch exchange rate ${error.from}->${error.to}. Try passing fxRate manually.`,
          502,
        );
      }
      throw error;
    }

    const occurredOn = parseIsoDate(payload.occurredOn) ?? todayUtcDate();

    let line;
    try {
      line = await db.monthIncomeLine.create({
        data: {
          userId,
          monthRecordId: monthRecord.id,
          templateId: null,
          bankId: payload.bankId ?? null,
          name: payload.name.trim(),
          occurredOn,
          amount: converted.amount,
          currency: converted.currency,
          fxRate: converted.fxRate,
          amountConverted: converted.amountConverted,
          category: payload.category,
          received: payload.received ?? false,
        },
        include: { bank: { select: { name: true } } },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return jsonError(
          "An income line with the same date, description and amount already exists. Skipped to avoid duplicates.",
          409,
        );
      }
      throw error;
    }

    await expireYearTimeline(userId, month.getUTCFullYear());

    return new Response(
      JSON.stringify({
        line: {
          id: line.id,
          name: line.name,
          amount: line.amount.toString(),
          currency: line.currency,
          fxRate: line.fxRate.toString(),
          amountConverted: line.amountConverted.toString(),
          bankId: line.bankId,
          bankName: line.bank?.name ?? null,
          received: line.received,
          category: line.category,
          occurredOn: line.occurredOn.toISOString().slice(0, 10),
        },
        primaryCurrency: user.primaryCurrency,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  });
}
