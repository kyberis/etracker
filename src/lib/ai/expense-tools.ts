import { Prisma, type ExpenseCategory } from "@prisma/client";
import { tool } from "ai";
import { z } from "zod";

import { chartSpecSchema } from "@/lib/ai/chart-spec";
import { db } from "@/lib/db";
import { mergePendingTemplateLinesIntoMonth } from "@/lib/month-bucket";
import { loadMonthPageData } from "@/lib/month-page-data";
import {
  formatMonthKey,
  getCurrentMonthKey,
  isCurrentMonthKey,
  parseMonthKey,
  toMonthStart,
} from "@/lib/months";
import {
  createMonthSchema,
  expenseCategoryOptions,
  expenseSchema,
} from "@/lib/validators";

const monthKey = z
  .string()
  .regex(/^\d{4}-\d{2}$/u, "Mes en formato yyyy-MM (p. ej. 2026-04).");
const optionalMonthKey = monthKey.optional();
const categoryEnum = z.enum(expenseCategoryOptions);

/** Matches DB practical limit; avoids oversized prompts. */
const MAX_EXPENSE_IMPORT_INSTRUCTIONS_CHARS = 12_000;

function formatMoney(value: number): string {
  return value.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Build the expense toolset bound to a single user. The tools encapsulate the
 * same business logic as our REST routes (creating templates, adding monthly
 * lines, marking paid, etc.) so the chat agent and the UI never diverge.
 */
export function buildExpenseTools(userId: string) {
  return {
    getMonthState: tool({
      description:
        "Lee el estado del usuario para un mes (yyyy-MM). Si no se pasa mes, usa el mes actual. Devuelve ingreso, líneas, totales planificado/pagado/restante y balance (ingreso - planificado).",
      inputSchema: z.object({ month: optionalMonthKey }),
      execute: async ({ month }) => {
        const target = month ?? getCurrentMonthKey();
        const data = await loadMonthPageData(userId, target);
        if (!data.hasRecord) {
          return {
            month: target,
            hasRecord: false as const,
            defaultIncome: data.defaultIncome,
            note:
              "El mes no está configurado todavía. Podés crearlo con createMonthIfNeeded.",
          };
        }
        return {
          month: target,
          hasRecord: true as const,
          isCurrentMonth: data.isCurrentMonth,
          income: data.income,
          totals: data.totals,
          balance: data.balance,
          summaryText:
            `Ingreso ${formatMoney(data.income)}, planificado ${formatMoney(data.totals.planned)}, ` +
            `pagado ${formatMoney(data.totals.paid)}, restante por pagar ${formatMoney(data.totals.remaining)}, ` +
            `balance ${formatMoney(data.balance)}.`,
          banks: data.banks,
          bankTotals: data.bankTotals,
          expenses: data.expenses,
          pendingFromTemplates: data.pendingFromTemplates,
        };
      },
    }),

    listBanks: tool({
      description:
        "Lista los bancos del usuario con id y nombre. Útil cuando el usuario menciona un banco por nombre.",
      inputSchema: z.object({}),
      execute: async () => {
        const banks = await db.bank.findMany({
          where: { userId },
          orderBy: { name: "asc" },
          select: { id: true, name: true, color: true },
        });
        return { banks };
      },
    }),

    listExpenseTemplates: tool({
      description:
        "Lista las plantillas de gastos del usuario (recurrentes y de un solo mes).",
      inputSchema: z.object({}),
      execute: async () => {
        const expenses = await db.expense.findMany({
          where: { userId },
          orderBy: { name: "asc" },
          include: { bank: { select: { id: true, name: true } } },
        });
        return {
          expenses: expenses.map((e) => ({
            id: e.id,
            name: e.name,
            amount: e.amount.toString(),
            category: e.category,
            isRecurring: e.isRecurring,
            startMonth: formatMonthKey(e.startMonth),
            endMonth: e.endMonth ? formatMonthKey(e.endMonth) : null,
            bank: e.bank,
          })),
        };
      },
    }),

    createExpenseTemplate: tool({
      description:
        "Crea una plantilla de gasto (recurrente o puntual). Si no sabés el bankId pedíselo al usuario o usá listBanks. Para gastos recurrentes a partir de hoy usá el mes actual.",
      inputSchema: z.object({
        name: z.string().min(1).max(120),
        amount: z.number().positive(),
        bankId: z.string().min(1),
        isRecurring: z.boolean().default(true),
        startMonth: monthKey,
        endMonth: optionalMonthKey,
        category: categoryEnum.optional().default("OTROS"),
      }),
      execute: async (input) => {
        const payload = expenseSchema.parse({
          ...input,
          endMonth: input.endMonth ?? undefined,
        });
        const bank = await db.bank.findFirst({
          where: { id: payload.bankId, userId },
          select: { id: true, name: true },
        });
        if (!bank) return { error: "El banco indicado no existe." };

        const created = await db.expense.create({
          data: {
            userId,
            bankId: payload.bankId,
            name: payload.name.trim(),
            amount: new Prisma.Decimal(payload.amount.toFixed(2)),
            isRecurring: payload.isRecurring,
            startMonth: parseMonthKey(payload.startMonth),
            endMonth: payload.endMonth ? parseMonthKey(payload.endMonth) : null,
            category: payload.category,
          },
        });
        return {
          ok: true,
          expense: {
            id: created.id,
            name: created.name,
            amount: created.amount.toString(),
            isRecurring: created.isRecurring,
            startMonth: formatMonthKey(created.startMonth),
            endMonth: created.endMonth ? formatMonthKey(created.endMonth) : null,
            bankName: bank.name,
            category: created.category,
          },
        };
      },
    }),

    addMonthLine: tool({
      description:
        "Agrega un gasto puntual al mes actual (no crea plantilla). Solo se permite el mes en curso. Útil cuando el usuario reporta un gasto suelto, p. ej. desde una foto.",
      inputSchema: z.object({
        name: z.string().min(1).max(120),
        amount: z.number().positive(),
        bankId: z.string().min(1),
        category: categoryEnum.optional().default("OTROS"),
      }),
      execute: async (input) => {
        const month = getCurrentMonthKey();
        const monthStart = toMonthStart(parseMonthKey(month));
        const record = await db.monthRecord.findFirst({
          where: { userId, month: monthStart },
        });
        if (!record) {
          return {
            error:
              "El mes en curso no está configurado todavía. Pedíle al usuario crearlo con createMonthIfNeeded.",
          };
        }
        const bank = await db.bank.findFirst({
          where: { id: input.bankId, userId },
          select: { id: true, name: true },
        });
        if (!bank) return { error: "El banco indicado no existe." };

        const line = await db.monthExpenseLine.create({
          data: {
            monthRecordId: record.id,
            templateId: null,
            bankId: input.bankId,
            name: input.name.trim(),
            amount: new Prisma.Decimal(input.amount.toFixed(2)),
            category: input.category as ExpenseCategory,
            paid: false,
          },
        });
        return {
          ok: true,
          line: {
            id: line.id,
            month,
            name: line.name,
            amount: line.amount.toString(),
            bankName: bank.name,
            category: line.category,
            paid: line.paid,
          },
        };
      },
    }),

    updateMonthLine: tool({
      description:
        "Actualiza una línea del mes (pagado, importe o nombre). Útil para conciliar con una foto del banco o marcar pagos.",
      inputSchema: z.object({
        id: z.string().min(1),
        paid: z.boolean().optional(),
        amount: z.number().positive().optional(),
        name: z.string().min(1).max(120).optional(),
      }),
      execute: async ({ id, paid, amount, name }) => {
        const existing = await db.monthExpenseLine.findFirst({
          where: { id, monthRecord: { userId } },
        });
        if (!existing) return { error: "Línea no encontrada." };

        const data: {
          paid?: boolean;
          amount?: Prisma.Decimal;
          name?: string;
        } = {};
        if (paid !== undefined) data.paid = paid;
        if (amount !== undefined) data.amount = new Prisma.Decimal(amount.toFixed(2));
        if (name !== undefined) data.name = name.trim();
        if (Object.keys(data).length === 0) {
          return { error: "Nada para actualizar." };
        }

        const updated = await db.monthExpenseLine.update({
          where: { id },
          data,
        });
        return {
          ok: true,
          line: {
            id: updated.id,
            name: updated.name,
            amount: updated.amount.toString(),
            paid: updated.paid,
          },
        };
      },
    }),

    createMonthIfNeeded: tool({
      description:
        "Crea el bucket de un mes si todavía no existe, copiando desde plantillas (mode=templates) o desde otro mes (mode=copyFrom + copyFromMonth).",
      inputSchema: z.object({
        month: monthKey,
        mode: z.enum(["templates", "copyFrom"]).default("templates"),
        copyFromMonth: optionalMonthKey,
      }),
      execute: async (input) => {
        const payload = createMonthSchema.parse({
          ...input,
          copyFromMonth: input.copyFromMonth ?? undefined,
        });
        const monthStart = toMonthStart(parseMonthKey(payload.month));
        const existing = await db.monthRecord.findFirst({
          where: { userId, month: monthStart },
        });
        if (existing) {
          return { ok: true, alreadyExisted: true, month: payload.month };
        }
        // Defer to the same helpers as POST /api/months.
        const { createMonthFromCopy, createMonthFromTemplates } = await import(
          "@/lib/month-bucket"
        );
        if (payload.mode === "templates") {
          await createMonthFromTemplates(userId, payload.month);
        } else if (payload.copyFromMonth) {
          try {
            await createMonthFromCopy(userId, payload.month, payload.copyFromMonth);
          } catch (e) {
            if (e instanceof Error && e.message === "SOURCE_NOT_FOUND") {
              return { error: "El mes origen no existe." };
            }
            throw e;
          }
        }
        return { ok: true, alreadyExisted: false, month: payload.month };
      },
    }),

    mergePendingTemplates: tool({
      description:
        "Vuelca las plantillas vigentes que aún no están en el mes a la línea del mes (idempotente).",
      inputSchema: z.object({ month: monthKey }),
      execute: async ({ month }) => {
        try {
          const result = await mergePendingTemplateLinesIntoMonth(userId, month);
          return { ok: true, ...result };
        } catch (e) {
          if (e instanceof Error && e.message === "NO_RECORD") {
            return { error: "El mes no está configurado." };
          }
          throw e;
        }
      },
    }),

    updateExpenseImportInstructions: tool({
      description:
        "Guarda en la cuenta del usuario las instrucciones persistentes para importaciones (Revolut, CSV, fotos), categorías y cómo marcar líneas (p. ej. pagado al importar). Usalo cuando pida recordar algo de forma permanente ('guardá que…', 'de ahora en más…', 'no quiero tener que repetir…'). Si solo agrega una regla nueva sin borrar el resto, usá mode=append (el texto actual está en el system prompt como bloque «Instrucciones personales»). Si reescribe todo el bloque, mode=replace. Después del tool, confirmá en una frase lo guardado.",
      inputSchema: z.object({
        mode: z
          .enum(["replace", "append"])
          .describe(
            "append: concatena debajo de lo ya guardado. replace: reemplaza por completo.",
          ),
        instructions: z
          .string()
          .min(1)
          .max(MAX_EXPENSE_IMPORT_INSTRUCTIONS_CHARS),
      }),
      execute: async ({ mode, instructions }) => {
        const trimmed = instructions.trim();
        const existing = await db.user.findUnique({
          where: { id: userId },
          select: { expenseImportInstructions: true },
        });
        const current = existing?.expenseImportInstructions?.trim() ?? "";
        const next =
          mode === "append" && current ?
            `${current}\n\n${trimmed}`
          : trimmed;

        if (next.length > MAX_EXPENSE_IMPORT_INSTRUCTIONS_CHARS) {
          return {
            error: `El texto supera el máximo de ${MAX_EXPENSE_IMPORT_INSTRUCTIONS_CHARS} caracteres. Pedí al usuario que acorte o borre reglas viejas desde Configuración.`,
          };
        }

        await db.user.update({
          where: { id: userId },
          data: { expenseImportInstructions: next },
        });

        return {
          ok: true as const,
          mode,
          length: next.length,
          preview: next.length > 600 ? `${next.slice(0, 600)}…` : next,
        };
      },
    }),

    renderChart: tool({
      description: [
        "Muestra un gráfico embebido en el chat. Usalo cuando un visual ayude (ingreso vs gastos, distribución por categoría/banco, evolución mensual).",
        "Llamálo SIEMPRE después de obtener los datos con otras tools (getMonthState, listExpenseTemplates, etc.). NO inventes números.",
        "Tipos: 'bar' (comparar magnitudes; soporta stacked u horizontal), 'pie' (distribución 2-8 segmentos), 'line' (serie temporal), 'area' (line con relleno; soporta stacked).",
        "Para bar/line/area: pasá 'xValues' (etiquetas del eje X) y 'series' (cada serie con label + values alineados 1:1 con xValues).",
        "Para pie: pasá 'slices' (cada uno con name + value, sin negativos).",
        "Mantené 'title' breve. Si son montos del usuario, seteá 'currency' (p. ej. 'USD' o 'ARS').",
      ].join(" "),
      inputSchema: chartSpecSchema,
      execute: async (spec) => {
        // The tool just echoes the validated spec. The chat UI picks
        // it up from the tool-result part and renders the chart.
        return { ok: true as const, spec };
      },
    }),
  };
}

export function isCurrentMonth(month: string) {
  return isCurrentMonthKey(month);
}
