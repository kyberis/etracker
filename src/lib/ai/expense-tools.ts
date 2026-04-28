import { Prisma, type ExpenseCategory } from "@prisma/client";
import { tool } from "ai";
import { z } from "zod";

import { chartSpecSchema } from "@/lib/ai/chart-spec";
import { getBanksCached } from "@/lib/cache/banks";
import { db } from "@/lib/db";
import { FxUnavailableError, convertToPrimary } from "@/lib/fx/rates";
import {
  applyPrevMonthLeftoverDecision,
  mergePendingTemplateLinesIntoMonth,
} from "@/lib/month-bucket";
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
  currencySchema,
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
        "Lee el estado del usuario para un mes (yyyy-MM). Si no se pasa mes, usa el mes actual. Devuelve `primaryCurrency`, ingreso, carryover del mes anterior, líneas (cada una con su moneda original + monto convertido), totales planificado/pagado/restante (en moneda principal), balance (ingreso + carryover − planificado), pila de ahorros del usuario y, si aplica, `carryoverPrompt` con el sobrante del mes anterior pendiente de decisión.",
      inputSchema: z.object({ month: optionalMonthKey }),
      execute: async ({ month }) => {
        const target = month ?? getCurrentMonthKey();
        const data = await loadMonthPageData(userId, target);
        if (!data.hasRecord) {
          return {
            month: target,
            hasRecord: false as const,
            defaultIncome: data.defaultIncome,
            primaryCurrency: data.primaryCurrency,
            note:
              "El mes no está configurado todavía. Podés crearlo con createMonthIfNeeded.",
          };
        }
        const carryoverNote =
          data.carryoverPrompt &&
          `El usuario cerró ${data.carryoverPrompt.prevMonth} con ${data.primaryCurrency} ${formatMoney(data.carryoverPrompt.amount)} sin gastar y todavía no decidió qué hacer con ese sobrante. Felicitalo y ofrecele dos opciones: sumarlo al ingreso de ${target} o dejarlo aparte como ahorros. Cuando elija, llamá applyPrevMonthLeftover.`;
        return {
          month: target,
          hasRecord: true as const,
          primaryCurrency: data.primaryCurrency,
          isCurrentMonth: data.isCurrentMonth,
          income: data.income,
          carryoverFromPrev: data.carryoverFromPrev,
          effectiveIncome: data.effectiveIncome,
          savings: data.savings,
          carryoverPrompt: data.carryoverPrompt,
          carryoverNote: carryoverNote ?? null,
          totals: data.totals,
          balance: data.balance,
          summaryText:
            `Ingreso ${data.primaryCurrency} ${formatMoney(data.income)}` +
            (data.carryoverFromPrev > 0
              ? ` (+ ${data.primaryCurrency} ${formatMoney(data.carryoverFromPrev)} carryover)`
              : "") +
            `, planificado ${data.primaryCurrency} ${formatMoney(data.totals.planned)}, ` +
            `pagado ${data.primaryCurrency} ${formatMoney(data.totals.paid)}, restante ${data.primaryCurrency} ${formatMoney(data.totals.remaining)}, ` +
            `balance ${data.primaryCurrency} ${formatMoney(data.balance)}.`,
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
        const banks = await getBanksCached(userId);
        return {
          banks: banks.map((b) => ({ id: b.id, name: b.name, color: b.color })),
        };
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
        "Agrega un gasto puntual al mes actual (no crea plantilla). Solo se permite el mes en curso. " +
        "Útil cuando el usuario reporta un gasto suelto (foto del banco, mensaje, ticket). " +
        "Por defecto la línea se crea como **pagada** (`paid=true`) porque el usuario está reportando " +
        "algo que ya gastó. Pasá `paid=false` SOLO si el usuario aclara explícitamente que aún no lo pagó. " +
        "Si el gasto está en otra moneda que la principal del usuario, pasá `currency` (ISO 4217). " +
        "Podés overridear el tipo de cambio con `fxRate` (p. ej. dólar blue en Argentina); si lo omitís, " +
        "buscamos un rate automático y lo dejamos congelado en la línea.",
      inputSchema: z.object({
        name: z.string().min(1).max(120),
        amount: z.number().positive(),
        bankId: z.string().min(1),
        category: categoryEnum.optional().default("OTROS"),
        paid: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Si el gasto ya está pagado. Default true porque el usuario suele reportar gastos hechos.",
          ),
        currency: currencySchema
          .optional()
          .describe(
            "ISO 4217 (3 letras). Default = moneda principal del usuario. Pasala cuando el usuario diga 'compré en USD/ARS/EUR'.",
          ),
        fxRate: z
          .number()
          .positive()
          .optional()
          .describe(
            "Override manual del tipo de cambio. Útil para casos como dólar blue/MEP. Si la omitís, usamos el rate del momento.",
          ),
      }),
      execute: async (input) => {
        const month = getCurrentMonthKey();
        const monthStart = toMonthStart(parseMonthKey(month));
        const [user, record] = await Promise.all([
          db.user.findUnique({
            where: { id: userId },
            select: { primaryCurrency: true },
          }),
          db.monthRecord.findFirst({ where: { userId, month: monthStart } }),
        ]);
        if (!user) return { error: "Usuario no encontrado." };
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

        let converted;
        try {
          converted = await convertToPrimary({
            amount: input.amount,
            currency: input.currency ?? user.primaryCurrency,
            primary: user.primaryCurrency,
            fxRate: input.fxRate,
          });
        } catch (error) {
          if (error instanceof FxUnavailableError) {
            return {
              error: `No pudimos obtener el tipo de cambio ${error.from}->${error.to}. Pedile al usuario un rate y volvé a intentar pasando "fxRate".`,
            };
          }
          throw error;
        }

        const line = await db.monthExpenseLine.create({
          data: {
            monthRecordId: record.id,
            templateId: null,
            bankId: input.bankId,
            name: input.name.trim(),
            amount: converted.amount,
            currency: converted.currency,
            fxRate: converted.fxRate,
            amountConverted: converted.amountConverted,
            category: input.category as ExpenseCategory,
            paid: input.paid,
          },
        });
        return {
          ok: true,
          line: {
            id: line.id,
            month,
            name: line.name,
            amount: line.amount.toString(),
            currency: line.currency,
            fxRate: line.fxRate.toString(),
            amountConverted: line.amountConverted.toString(),
            primaryCurrency: user.primaryCurrency,
            bankName: bank.name,
            category: line.category,
            paid: line.paid,
          },
        };
      },
    }),

    updateMonthLine: tool({
      description:
        "Actualiza una línea del mes (pagado, importe, nombre, moneda o tipo de cambio). " +
        "Útil para conciliar con una foto del banco o marcar pagos. " +
        "Si pasás `currency` o `fxRate`, recalculamos `amountConverted` con el rate correspondiente.",
      inputSchema: z.object({
        id: z.string().min(1),
        paid: z.boolean().optional(),
        amount: z.number().positive().optional(),
        name: z.string().min(1).max(120).optional(),
        currency: currencySchema.optional(),
        fxRate: z.number().positive().optional(),
      }),
      execute: async ({ id, paid, amount, name, currency, fxRate }) => {
        const existing = await db.monthExpenseLine.findFirst({
          where: { id, monthRecord: { userId } },
        });
        if (!existing) return { error: "Línea no encontrada." };

        const data: {
          paid?: boolean;
          amount?: Prisma.Decimal;
          name?: string;
          currency?: string;
          fxRate?: Prisma.Decimal;
          amountConverted?: Prisma.Decimal;
        } = {};
        if (paid !== undefined) data.paid = paid;
        if (name !== undefined) data.name = name.trim();

        const amountChanged = amount !== undefined;
        const currencyChanged = currency !== undefined;
        const rateChanged = fxRate !== undefined;
        if (amountChanged || currencyChanged || rateChanged) {
          const user = await db.user.findUnique({
            where: { id: userId },
            select: { primaryCurrency: true },
          });
          if (!user) return { error: "Usuario no encontrado." };
          const nextCurrency = currency ?? existing.currency;
          const nextAmount = amount ?? Number(existing.amount);
          // Just amount edit + same currency: keep the locked rate.
          const useExistingRate =
            !currencyChanged &&
            !rateChanged &&
            amountChanged &&
            nextCurrency.toUpperCase() === existing.currency.toUpperCase();
          try {
            const converted = await convertToPrimary({
              amount: nextAmount,
              currency: nextCurrency,
              primary: user.primaryCurrency,
              fxRate: useExistingRate ? existing.fxRate : fxRate,
            });
            data.amount = converted.amount;
            data.currency = converted.currency;
            data.fxRate = converted.fxRate;
            data.amountConverted = converted.amountConverted;
          } catch (error) {
            if (error instanceof FxUnavailableError) {
              return {
                error: `No pudimos obtener el tipo de cambio ${error.from}->${error.to}. Pedile al usuario un rate y volvé a intentar pasando "fxRate".`,
              };
            }
            throw error;
          }
        }

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
            currency: updated.currency,
            fxRate: updated.fxRate.toString(),
            amountConverted: updated.amountConverted.toString(),
            paid: updated.paid,
          },
        };
      },
    }),

    setMonthIncome: tool({
      description:
        "Setea el ingreso (income) de un mes específico (yyyy-MM). Reemplaza el valor existente por el monto pasado. " +
        "Requiere que el mes ya exista (si no, llamá createMonthIfNeeded primero). " +
        "Usalo cuando el usuario diga 'mi ingreso este mes es X', 'cobré X', 'ganaste X de sueldo', etc. " +
        "Para gastos individuales NO uses esto: usá addMonthLine. Para cambiar una línea de gasto usá updateMonthLine.",
      inputSchema: z.object({
        month: optionalMonthKey,
        amount: z
          .number()
          .min(0)
          .describe("Monto del ingreso del mes (en la moneda del usuario, sin signo)."),
      }),
      execute: async ({ month, amount }) => {
        const target = month ?? getCurrentMonthKey();
        const monthStart = toMonthStart(parseMonthKey(target));
        const existing = await db.monthRecord.findFirst({
          where: { userId, month: monthStart },
        });
        if (!existing) {
          return {
            error:
              "El mes no está configurado todavía. Llamá createMonthIfNeeded antes de setear el ingreso.",
          };
        }
        const updated = await db.monthRecord.update({
          where: { id: existing.id },
          data: { income: new Prisma.Decimal(amount.toFixed(2)) },
        });
        return {
          ok: true as const,
          month: target,
          income: Number(updated.income),
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

    applyPrevMonthLeftover: tool({
      description:
        "Aplica la decisión del usuario sobre el sobrante del mes anterior al mes elegido (default = mes actual). " +
        "`mode=addToIncome`: lo suma al ingreso del mes (en `MonthRecord.carryoverFromPrev`). " +
        "`mode=setAside`: lo acumula en la pila de ahorros del usuario. " +
        "Idempotente: si ya se decidió, devuelve `alreadyDecided=true`. Llamalo SOLO cuando getMonthState haya devuelto un `carryoverPrompt` y el usuario haya elegido una de las dos opciones.",
      inputSchema: z.object({
        month: optionalMonthKey,
        mode: z.enum(["addToIncome", "setAside"]),
      }),
      execute: async ({ month, mode }) => {
        const target = month ?? getCurrentMonthKey();
        const result = await applyPrevMonthLeftoverDecision(userId, target, mode);
        if (result.type === "noRecord") {
          return {
            error:
              "El mes no está configurado todavía. Llamá createMonthIfNeeded antes de aplicar el sobrante.",
          };
        }
        if (result.type === "alreadyDecided") {
          return { ok: true as const, alreadyDecided: true as const, month: target };
        }
        if (result.type === "noLeftover") {
          return {
            ok: true as const,
            alreadyDecided: false as const,
            applied: false as const,
            month: target,
            note:
              "No había sobrante en el mes anterior. Marcamos la decisión como tomada para no volver a preguntar.",
          };
        }
        return {
          ok: true as const,
          alreadyDecided: false as const,
          applied: true as const,
          month: target,
          mode: result.mode,
          amount: result.amount,
        };
      },
    }),

    setPrimaryCurrency: tool({
      description:
        "Define la moneda principal del usuario (ISO 4217, p. ej. USD/ARS/EUR). " +
        "TODA la matemática (totales, balance, ingreso) se reporta en esta moneda; " +
        "los gastos individuales pueden estar en otra y se convierten automáticamente. " +
        "Llamala SOLO cuando el usuario confirma su moneda principal (texto explícito o respuesta a tu pregunta de onboarding). " +
        "También marca `primaryCurrencyConfirmedAt` para que no volvamos a preguntarle.",
      inputSchema: z.object({
        currency: currencySchema.describe(
          "Código ISO 4217 de 3 letras, en mayúsculas (USD, ARS, EUR, BRL, …).",
        ),
      }),
      execute: async ({ currency }) => {
        const updated = await db.user.update({
          where: { id: userId },
          data: {
            primaryCurrency: currency,
            primaryCurrencyConfirmedAt: new Date(),
          },
          select: { primaryCurrency: true, primaryCurrencyConfirmedAt: true },
        });
        return {
          ok: true as const,
          primaryCurrency: updated.primaryCurrency,
          confirmedAt: updated.primaryCurrencyConfirmedAt?.toISOString() ?? null,
          note:
            "Las líneas existentes mantienen su tipo de cambio original; sólo cambian los totales nuevos.",
        };
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
