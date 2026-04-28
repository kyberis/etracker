import { db } from "@/lib/db";
import { FxUnavailableError, convertToPrimary } from "@/lib/fx/rates";
import { jsonError, withApi } from "@/lib/http";
import { isCurrentMonthKey, parseMonthKey, toMonthStart } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { monthExpenseLineCreateSchema, monthParamSchema } from "@/lib/validators";
import { expireYearTimeline } from "@/lib/year-timeline-data";

export async function POST(request: Request, context: { params: Promise<{ month: string }> }) {
  return withApi(async () => {
    const userId = await requireUserId();
    const { month: monthParam } = await context.params;
    const { month: monthKey } = monthParamSchema.parse({ month: monthParam });

    if (!isCurrentMonthKey(monthKey)) {
      return jsonError("Solo se pueden agregar gastos al mes en curso.", 403);
    }

    const month = toMonthStart(parseMonthKey(monthKey));
    const body = await request.json();
    const payload = monthExpenseLineCreateSchema.parse(body);

    const [user, monthRecord] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { primaryCurrency: true },
      }),
      db.monthRecord.findFirst({ where: { userId, month } }),
    ]);
    if (!user) return jsonError("Usuario no encontrado.", 404);
    if (!monthRecord) return jsonError("Configurá el mes primero.", 404);

    const bank = await db.bank.findFirst({ where: { id: payload.bankId, userId } });
    if (!bank) {
      return jsonError("El banco no existe.", 404);
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
          `No pudimos obtener el tipo de cambio ${error.from}->${error.to}. Probá pasando un fxRate manual.`,
          502,
        );
      }
      throw error;
    }

    const line = await db.monthExpenseLine.create({
      data: {
        monthRecordId: monthRecord.id,
        templateId: null,
        bankId: payload.bankId,
        name: payload.name.trim(),
        amount: converted.amount,
        currency: converted.currency,
        fxRate: converted.fxRate,
        amountConverted: converted.amountConverted,
        category: payload.category,
        paid: payload.paid ?? false,
      },
      include: { bank: { select: { name: true } } },
    });

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
          bankName: line.bank.name,
          paid: line.paid,
          category: line.category,
        },
        primaryCurrency: user.primaryCurrency,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  });
}
