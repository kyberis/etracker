import {
  Prisma,
  SavingsMovementKind,
  type ExpenseCategory,
  type IncomeCategory,
} from "@prisma/client";
import { tool } from "ai";
import { z } from "zod";

import { chartSpecSchema } from "@/lib/ai/chart-spec";
import { getBanksCached, invalidateBanksCache } from "@/lib/cache/banks";
import { db } from "@/lib/db";
import {
  isUniqueViolation,
  parseIsoDate,
  todayUtcDate,
} from "@/lib/expense-line";
import { FxUnavailableError, convertToPrimary, fetchFxRate } from "@/lib/fx/rates";
import {
  applyPrevMonthLeftoverDecision,
  mergePendingTemplateIncomeLinesIntoMonth,
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
  deleteManualDuplicateMovements,
  deleteSavingsMovement,
  findManualDuplicateMovements,
  getSavingsState,
  recordSavingsMovement,
  removeMonthlySavingsContribution,
  setMonthlySavingsContribution,
} from "@/lib/savings";
import {
  createMonthSchema,
  currencySchema,
  expenseCategoryOptions,
  expenseSchema,
  incomeCategoryOptions,
  incomeSchema,
} from "@/lib/validators";
import { expireYearTimeline } from "@/lib/year-timeline-data";

/** Accepts 6-char hex with or without `#`. Mirrors `bankSchema` in validators. */
const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#?[0-9a-fA-F]{6}$/u, "Color must be a 6-char hex (e.g. #1f6feb).");

/** Normalises hex color to `#rrggbb` (or null when omitted/empty). */
function normalizeHexColor(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

const monthKey = z
  .string()
  .regex(/^\d{4}-\d{2}$/u, "Mes en formato yyyy-MM (p. ej. 2026-04).");
const optionalMonthKey = monthKey.optional();
const categoryEnum = z.enum(expenseCategoryOptions);
const incomeCategoryEnum = z.enum(incomeCategoryOptions);

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
        "Lee el estado del usuario para un mes (yyyy-MM). Si no se pasa mes, usa el mes actual. Devuelve `primaryCurrency`, ingreso recibido, ingreso previsto, líneas de ingreso (cada cobro con su moneda original + monto convertido + flag `received`), carryover del mes anterior, líneas de gasto, totales planificado/pagado/restante (en moneda principal), balance (ingreso recibido + carryover − planificado), pila de ahorros y, si aplica, `carryoverPrompt` con el saldo del mes anterior pendiente de decisión.",
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
          (data.carryoverPrompt.type === "leftover"
            ? `El usuario cerró ${data.carryoverPrompt.prevMonth} con ${data.primaryCurrency} ${formatMoney(data.carryoverPrompt.amount)} sin gastar y todavía no decidió qué hacer con ese sobrante. Felicitalo y ofrecele dos opciones: sumarlo al ingreso de ${target} (\`mode=addToIncome\`) o dejarlo aparte como ahorros (\`mode=setAside\`). Cuando elija, llamá applyPrevMonthLeftover.`
            : `El usuario cerró ${data.carryoverPrompt.prevMonth} en rojo por ${data.primaryCurrency} ${formatMoney(data.carryoverPrompt.amount)} y todavía no decidió cómo manejarlo. Pila de ahorro disponible: ${data.primaryCurrency} ${formatMoney(data.carryoverPrompt.savings)}. Sin sermones, ofrecele dos opciones: cubrir con ahorros (\`mode=coverFromSavings\` — cobertura parcial si la pila no alcanza) o arrastrar la deuda al mes actual (\`mode=carryDebt\`). Cuando elija, llamá applyPrevMonthLeftover.`);
        return {
          month: target,
          hasRecord: true as const,
          primaryCurrency: data.primaryCurrency,
          isCurrentMonth: data.isCurrentMonth,
          income: data.income,
          incomeExpected: data.incomeExpected,
          incomeTotals: data.incomeTotals,
          carryoverFromPrev: data.carryoverFromPrev,
          effectiveIncome: data.effectiveIncome,
          savings: data.savings,
          carryoverPrompt: data.carryoverPrompt,
          carryoverNote: carryoverNote ?? null,
          totals: data.totals,
          balance: data.balance,
          summaryText:
            `Ingreso recibido ${data.primaryCurrency} ${formatMoney(data.income)}` +
            (data.incomeTotals.pending > 0
              ? ` (+ ${data.primaryCurrency} ${formatMoney(data.incomeTotals.pending)} previsto sin recibir)`
              : "") +
            (data.carryoverFromPrev > 0
              ? ` (+ ${data.primaryCurrency} ${formatMoney(data.carryoverFromPrev)} carryover)`
              : "") +
            `, planificado ${data.primaryCurrency} ${formatMoney(data.totals.planned)}, ` +
            `pagado ${data.primaryCurrency} ${formatMoney(data.totals.paid)}, restante ${data.primaryCurrency} ${formatMoney(data.totals.remaining)}, ` +
            `balance ${data.primaryCurrency} ${formatMoney(data.balance)}.`,
          banks: data.banks,
          bankTotals: data.bankTotals,
          expenses: data.expenses,
          incomes: data.incomes,
          pendingFromTemplates: data.pendingFromTemplates,
          pendingIncomesFromTemplates: data.pendingIncomesFromTemplates,
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

    createBank: tool({
      description:
        "Crea un nuevo banco/cuenta para el usuario (p. ej. 'Visa', 'Galicia', 'Efectivo'). " +
        "Si ya existe uno con el mismo nombre devuelve `error` con código duplicado. " +
        "`color` opcional en hex (con o sin `#`).",
      inputSchema: z.object({
        name: z.string().min(1).max(80),
        color: hexColorSchema.optional(),
      }),
      execute: async ({ name, color }) => {
        try {
          const bank = await db.bank.create({
            data: {
              userId,
              name: name.trim(),
              color: normalizeHexColor(color),
            },
          });
          await invalidateBanksCache(userId);
          return {
            ok: true as const,
            bank: { id: bank.id, name: bank.name, color: bank.color },
          };
        } catch (error) {
          if (isUniqueViolation(error)) {
            return { error: `Ya existe un banco llamado "${name.trim()}".` };
          }
          throw error;
        }
      },
    }),

    updateBank: tool({
      description:
        "Renombra un banco o cambia su color. Pasá los campos a modificar; los omitidos quedan igual. " +
        "Verifica que el banco pertenezca al usuario.",
      inputSchema: z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(80).optional(),
        color: hexColorSchema.nullable().optional().describe(
          "Color hex (con o sin `#`). Pasá `null` para limpiar el color.",
        ),
      }),
      execute: async ({ id, name, color }) => {
        const existing = await db.bank.findFirst({ where: { id, userId } });
        if (!existing) return { error: "El banco indicado no existe." };

        const data: { name?: string; color?: string | null } = {};
        if (name !== undefined) data.name = name.trim();
        if (color !== undefined) data.color = normalizeHexColor(color);
        if (Object.keys(data).length === 0) {
          return { error: "Nada para actualizar." };
        }

        try {
          const bank = await db.bank.update({ where: { id }, data });
          await invalidateBanksCache(userId);
          return {
            ok: true as const,
            bank: { id: bank.id, name: bank.name, color: bank.color },
          };
        } catch (error) {
          if (isUniqueViolation(error)) {
            return {
              error: `Ya existe un banco con ese nombre. Elegí otro o renombrá el anterior.`,
            };
          }
          throw error;
        }
      },
    }),

    deleteBank: tool({
      description:
        "Borra un banco del usuario. Bloqueado si el banco tiene plantillas (`Expense`) o " +
        "líneas (`MonthExpenseLine`) asociadas: en ese caso devuelve los conteos para que " +
        "ofrezcas reasignar a otro banco o borrar primero esos registros. Pedí confirmación " +
        "verbal al usuario antes de llamar este tool.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const existing = await db.bank.findFirst({
          where: { id, userId },
          select: { id: true, name: true },
        });
        if (!existing) return { error: "El banco indicado no existe." };

        const [templateCount, lineCount] = await Promise.all([
          db.expense.count({ where: { bankId: id, userId } }),
          db.monthExpenseLine.count({ where: { bankId: id, userId } }),
        ]);
        if (templateCount > 0 || lineCount > 0) {
          return {
            error:
              `No puedo borrar "${existing.name}": tiene ${templateCount} plantilla(s) y ${lineCount} línea(s) asociadas. ` +
              "Reasigná esos registros a otro banco o borralos primero.",
            templateCount,
            lineCount,
          };
        }

        await db.bank.delete({ where: { id } });
        await invalidateBanksCache(userId);
        return { ok: true as const, deleted: { id: existing.id, name: existing.name } };
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

    updateExpenseTemplate: tool({
      description:
        "Actualiza una plantilla de gasto existente. Pasá solo los campos a modificar (nombre, monto, banco, categoría, recurrencia, mes de inicio/fin). " +
        "No materializa cambios sobre meses ya creados; los meses futuros (o los que se sincronicen con `mergePendingTemplates`) tomarán los nuevos valores. " +
        "Si pasás `endMonth=null`, lo dejamos abierto (sin fecha de cierre).",
      inputSchema: z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(120).optional(),
        amount: z.number().positive().optional(),
        bankId: z.string().min(1).optional(),
        isRecurring: z.boolean().optional(),
        startMonth: optionalMonthKey,
        endMonth: monthKey.nullable().optional(),
        category: categoryEnum.optional(),
      }),
      execute: async ({
        id,
        name,
        amount,
        bankId,
        isRecurring,
        startMonth,
        endMonth,
        category,
      }) => {
        const existing = await db.expense.findFirst({ where: { id, userId } });
        if (!existing) return { error: "La plantilla indicada no existe." };

        const data: {
          name?: string;
          amount?: Prisma.Decimal;
          bankId?: string;
          isRecurring?: boolean;
          startMonth?: Date;
          endMonth?: Date | null;
          category?: ExpenseCategory;
        } = {};
        if (name !== undefined) data.name = name.trim();
        if (amount !== undefined) {
          data.amount = new Prisma.Decimal(amount.toFixed(2));
        }
        if (category !== undefined) data.category = category as ExpenseCategory;
        if (isRecurring !== undefined) data.isRecurring = isRecurring;
        if (startMonth !== undefined) data.startMonth = parseMonthKey(startMonth);
        if (endMonth !== undefined) {
          data.endMonth = endMonth === null ? null : parseMonthKey(endMonth);
        }
        if (bankId !== undefined) {
          const bank = await db.bank.findFirst({
            where: { id: bankId, userId },
            select: { id: true },
          });
          if (!bank) return { error: "El banco indicado no existe." };
          data.bankId = bankId;
        }

        if (Object.keys(data).length === 0) {
          return { error: "Nada para actualizar." };
        }

        // Cross-field validation: one-off templates must not have endMonth, and
        // endMonth must be >= startMonth on the resulting record.
        const nextRecurring = data.isRecurring ?? existing.isRecurring;
        const nextStart = data.startMonth ?? existing.startMonth;
        const nextEnd = data.endMonth !== undefined ? data.endMonth : existing.endMonth;
        if (!nextRecurring && nextEnd) {
          return { error: "Las plantillas puntuales no pueden tener endMonth." };
        }
        if (nextEnd && nextEnd < nextStart) {
          return { error: "endMonth tiene que ser >= startMonth." };
        }

        const updated = await db.expense.update({
          where: { id },
          data,
          include: { bank: { select: { name: true } } },
        });
        return {
          ok: true as const,
          expense: {
            id: updated.id,
            name: updated.name,
            amount: updated.amount.toString(),
            isRecurring: updated.isRecurring,
            startMonth: formatMonthKey(updated.startMonth),
            endMonth: updated.endMonth ? formatMonthKey(updated.endMonth) : null,
            bankId: updated.bankId,
            bankName: updated.bank.name,
            category: updated.category,
          },
        };
      },
    }),

    deleteExpenseTemplate: tool({
      description:
        "Borra una plantilla (`Expense`). Las líneas (`MonthExpenseLine`) ya materializadas en " +
        "meses existentes se preservan y simplemente quedan desvinculadas (`templateId=null`), así que el " +
        "histórico no se pierde. Pedí confirmación verbal al usuario antes de llamar este tool.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const existing = await db.expense.findFirst({
          where: { id, userId },
          select: { id: true, name: true },
        });
        if (!existing) return { error: "La plantilla indicada no existe." };

        const lineCount = await db.monthExpenseLine.count({
          where: { templateId: id, userId },
        });
        await db.expense.delete({ where: { id } });
        return {
          ok: true as const,
          deleted: { id: existing.id, name: existing.name },
          detachedLineCount: lineCount,
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
        "buscamos un rate automático y lo dejamos congelado en la línea. " +
        "Las líneas son únicas por (usuario, fecha, descripción, monto, moneda): " +
        "si ya existe una idéntica el tool devuelve `duplicate=true` sin crear nada.",
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
        occurredOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Fecha en formato yyyy-MM-dd.")
          .optional()
          .describe(
            "Fecha real del gasto (yyyy-MM-dd). Default = hoy. Pasala si el usuario indica una fecha distinta (p. ej. 'la semana pasada', un comprobante con fecha).",
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

        const occurredOn = parseIsoDate(input.occurredOn) ?? todayUtcDate();
        let line;
        try {
          line = await db.monthExpenseLine.create({
            data: {
              userId,
              monthRecordId: record.id,
              templateId: null,
              bankId: input.bankId,
              name: input.name.trim(),
              occurredOn,
              amount: converted.amount,
              currency: converted.currency,
              fxRate: converted.fxRate,
              amountConverted: converted.amountConverted,
              category: input.category as ExpenseCategory,
              paid: input.paid,
            },
          });
        } catch (error) {
          if (isUniqueViolation(error)) {
            return {
              ok: true as const,
              duplicate: true as const,
              note:
                "Ya existía un gasto con esa fecha, descripción y monto. No lo dupliqué.",
            };
          }
          throw error;
        }
        return {
          ok: true as const,
          duplicate: false as const,
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
        "Actualiza una línea del mes. Campos editables: `paid`, `amount`, `name`, `currency`, `fxRate`, `bankId`, `category`, `occurredOn` (yyyy-MM-dd). " +
        "Útil para conciliar con una foto del banco, mover una línea a otro banco/categoría, corregir la fecha real o marcar pagos. " +
        "Si pasás `currency` o `fxRate`, recalculamos `amountConverted` con el rate correspondiente; si solo cambia `amount` y la moneda no varía, mantenemos el rate ya fijado en la línea.",
      inputSchema: z.object({
        id: z.string().min(1),
        paid: z.boolean().optional(),
        amount: z.number().positive().optional(),
        name: z.string().min(1).max(120).optional(),
        currency: currencySchema.optional(),
        fxRate: z.number().positive().optional(),
        bankId: z.string().min(1).optional(),
        category: categoryEnum.optional(),
        occurredOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Fecha en formato yyyy-MM-dd.")
          .optional(),
      }),
      execute: async ({
        id,
        paid,
        amount,
        name,
        currency,
        fxRate,
        bankId,
        category,
        occurredOn,
      }) => {
        const existing = await db.monthExpenseLine.findFirst({
          where: { id, monthRecord: { userId } },
          include: { monthRecord: { select: { month: true } } },
        });
        if (!existing) return { error: "Línea no encontrada." };

        const data: {
          paid?: boolean;
          amount?: Prisma.Decimal;
          name?: string;
          currency?: string;
          fxRate?: Prisma.Decimal;
          amountConverted?: Prisma.Decimal;
          bankId?: string;
          category?: ExpenseCategory;
          occurredOn?: Date;
        } = {};
        if (paid !== undefined) data.paid = paid;
        if (name !== undefined) data.name = name.trim();
        if (category !== undefined) data.category = category as ExpenseCategory;

        if (occurredOn !== undefined) {
          const parsed = parseIsoDate(occurredOn);
          if (!parsed) return { error: "occurredOn inválido (yyyy-MM-dd)." };
          data.occurredOn = parsed;
        }

        if (bankId !== undefined) {
          const bank = await db.bank.findFirst({
            where: { id: bankId, userId },
            select: { id: true },
          });
          if (!bank) return { error: "El banco indicado no existe." };
          data.bankId = bankId;
        }

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

        let updated;
        try {
          updated = await db.monthExpenseLine.update({
            where: { id },
            data,
          });
        } catch (error) {
          if (isUniqueViolation(error)) {
            return {
              error:
                "Ya hay un gasto con esa fecha, descripción y monto; no puedo dejar dos idénticos.",
            };
          }
          throw error;
        }
        await expireYearTimeline(
          userId,
          existing.monthRecord.month.getUTCFullYear(),
        );
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
            bankId: updated.bankId,
            category: updated.category,
            occurredOn: updated.occurredOn.toISOString().slice(0, 10),
          },
        };
      },
    }),

    deleteMonthLine: tool({
      description:
        "Borra una línea del mes (`MonthExpenseLine`). No toca la plantilla original. " +
        "Pedí confirmación verbal al usuario antes de llamar este tool.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const existing = await db.monthExpenseLine.findFirst({
          where: { id, monthRecord: { userId } },
          include: { monthRecord: { select: { month: true } } },
        });
        if (!existing) return { error: "Línea no encontrada." };

        await db.monthExpenseLine.delete({ where: { id } });
        await expireYearTimeline(
          userId,
          existing.monthRecord.month.getUTCFullYear(),
        );
        return {
          ok: true as const,
          deleted: {
            id: existing.id,
            name: existing.name,
            amount: existing.amount.toString(),
            currency: existing.currency,
          },
        };
      },
    }),

    listIncomeTemplates: tool({
      description:
        "Lista las plantillas de ingreso del usuario (recurrentes y de un solo mes). Útil cuando " +
        "el usuario habla de 'mi sueldo', 'lo que cobro de alquiler', 'el freelance fijo', etc.",
      inputSchema: z.object({}),
      execute: async () => {
        const incomes = await db.income.findMany({
          where: { userId },
          orderBy: { name: "asc" },
          include: { bank: { select: { id: true, name: true } } },
        });
        return {
          incomes: incomes.map((i) => ({
            id: i.id,
            name: i.name,
            amount: i.amount.toString(),
            currency: i.currency,
            category: i.category,
            isRecurring: i.isRecurring,
            startMonth: formatMonthKey(i.startMonth),
            endMonth: i.endMonth ? formatMonthKey(i.endMonth) : null,
            bank: i.bank,
          })),
        };
      },
    }),

    createIncomeTemplate: tool({
      description:
        "Crea una plantilla de ingreso (recurrente o puntual). Usalo cuando el usuario te cuente " +
        "un cobro fijo: sueldo mensual, alquiler que cobra, freelance retainer, etc. " +
        "`bankId` es OPCIONAL (los cobros no siempre se asocian a una cuenta — si el usuario no " +
        "lo aclara, dejalo vacío). Para ingresos en moneda distinta a la principal, pasá " +
        "`currency`. `category` ayuda a clasificar (SUELDO, FREELANCE, NEGOCIO, INVERSIONES, " +
        "ALQUILER, BONO, REEMBOLSO, REGALO, OTROS).",
      inputSchema: z.object({
        name: z.string().min(1).max(120),
        amount: z.number().positive(),
        bankId: z.string().min(1).optional(),
        isRecurring: z.boolean().default(true),
        startMonth: monthKey,
        endMonth: optionalMonthKey,
        category: incomeCategoryEnum.optional().default("OTROS"),
        currency: currencySchema.optional(),
      }),
      execute: async (input) => {
        const payload = incomeSchema.parse({
          ...input,
          bankId: input.bankId ?? undefined,
          endMonth: input.endMonth ?? undefined,
        });
        if (payload.bankId) {
          const bank = await db.bank.findFirst({
            where: { id: payload.bankId, userId },
            select: { id: true },
          });
          if (!bank) return { error: "El banco indicado no existe." };
        }
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { primaryCurrency: true },
        });
        if (!user) return { error: "Usuario no encontrado." };

        const created = await db.income.create({
          data: {
            userId,
            bankId: payload.bankId ?? null,
            name: payload.name.trim(),
            amount: new Prisma.Decimal(payload.amount.toFixed(2)),
            currency: payload.currency ?? user.primaryCurrency,
            isRecurring: payload.isRecurring,
            startMonth: parseMonthKey(payload.startMonth),
            endMonth: payload.endMonth ? parseMonthKey(payload.endMonth) : null,
            category: payload.category,
          },
          include: { bank: { select: { name: true } } },
        });
        return {
          ok: true as const,
          income: {
            id: created.id,
            name: created.name,
            amount: created.amount.toString(),
            currency: created.currency,
            isRecurring: created.isRecurring,
            startMonth: formatMonthKey(created.startMonth),
            endMonth: created.endMonth ? formatMonthKey(created.endMonth) : null,
            bankName: created.bank?.name ?? null,
            category: created.category,
          },
        };
      },
    }),

    updateIncomeTemplate: tool({
      description:
        "Actualiza una plantilla de ingreso existente. Pasá solo los campos a modificar " +
        "(nombre, monto, banco, moneda, categoría, recurrencia, mes de inicio/fin). " +
        "Pasá `bankId=null` para desasociar el banco. No materializa cambios sobre meses ya " +
        "creados; los meses futuros (o los que se sincronicen con `mergePendingTemplates`) " +
        "tomarán los nuevos valores.",
      inputSchema: z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(120).optional(),
        amount: z.number().positive().optional(),
        bankId: z.union([z.string().min(1), z.null()]).optional(),
        isRecurring: z.boolean().optional(),
        startMonth: optionalMonthKey,
        endMonth: monthKey.nullable().optional(),
        category: incomeCategoryEnum.optional(),
        currency: currencySchema.optional(),
      }),
      execute: async ({
        id,
        name,
        amount,
        bankId,
        isRecurring,
        startMonth,
        endMonth,
        category,
        currency,
      }) => {
        const existing = await db.income.findFirst({ where: { id, userId } });
        if (!existing) return { error: "La plantilla indicada no existe." };

        const data: {
          name?: string;
          amount?: Prisma.Decimal;
          bankId?: string | null;
          isRecurring?: boolean;
          startMonth?: Date;
          endMonth?: Date | null;
          category?: IncomeCategory;
          currency?: string;
        } = {};
        if (name !== undefined) data.name = name.trim();
        if (amount !== undefined) {
          data.amount = new Prisma.Decimal(amount.toFixed(2));
        }
        if (category !== undefined) data.category = category as IncomeCategory;
        if (currency !== undefined) data.currency = currency;
        if (isRecurring !== undefined) data.isRecurring = isRecurring;
        if (startMonth !== undefined) data.startMonth = parseMonthKey(startMonth);
        if (endMonth !== undefined) {
          data.endMonth = endMonth === null ? null : parseMonthKey(endMonth);
        }
        if (bankId !== undefined) {
          if (bankId === null) {
            data.bankId = null;
          } else {
            const bank = await db.bank.findFirst({
              where: { id: bankId, userId },
              select: { id: true },
            });
            if (!bank) return { error: "El banco indicado no existe." };
            data.bankId = bankId;
          }
        }

        if (Object.keys(data).length === 0) {
          return { error: "Nada para actualizar." };
        }

        const nextRecurring = data.isRecurring ?? existing.isRecurring;
        const nextStart = data.startMonth ?? existing.startMonth;
        const nextEnd = data.endMonth !== undefined ? data.endMonth : existing.endMonth;
        if (!nextRecurring && nextEnd) {
          return { error: "Las plantillas puntuales no pueden tener endMonth." };
        }
        if (nextEnd && nextEnd < nextStart) {
          return { error: "endMonth tiene que ser >= startMonth." };
        }

        const updated = await db.income.update({
          where: { id },
          data,
          include: { bank: { select: { name: true } } },
        });
        return {
          ok: true as const,
          income: {
            id: updated.id,
            name: updated.name,
            amount: updated.amount.toString(),
            currency: updated.currency,
            isRecurring: updated.isRecurring,
            startMonth: formatMonthKey(updated.startMonth),
            endMonth: updated.endMonth ? formatMonthKey(updated.endMonth) : null,
            bankId: updated.bankId,
            bankName: updated.bank?.name ?? null,
            category: updated.category,
          },
        };
      },
    }),

    deleteIncomeTemplate: tool({
      description:
        "Borra una plantilla de ingreso. Las líneas (`MonthIncomeLine`) ya materializadas en " +
        "meses existentes se preservan y simplemente quedan desvinculadas (`templateId=null`). " +
        "Pedí confirmación verbal al usuario antes de llamar este tool.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const existing = await db.income.findFirst({
          where: { id, userId },
          select: { id: true, name: true },
        });
        if (!existing) return { error: "La plantilla indicada no existe." };

        const lineCount = await db.monthIncomeLine.count({
          where: { templateId: id, userId },
        });
        await db.income.delete({ where: { id } });
        return {
          ok: true as const,
          deleted: { id: existing.id, name: existing.name },
          detachedLineCount: lineCount,
        };
      },
    }),

    addIncomeLine: tool({
      description:
        "Registra un cobro PUNTUAL en el mes en curso (no crea plantilla). Solo se permite el " +
        "mes en curso. Usalo cuando el usuario diga 'cobré X', 'me pagaron $Y', 'me " +
        "transfirieron $Z de freelance', 'me llegó el bono', 'me devolvieron plata', etc. " +
        "Por defecto la línea se crea como **recibida** (`received=true`) porque el usuario " +
        "está reportando algo que ya entró. Pasá `received=false` SOLO si aclara que todavía " +
        "está esperando el pago (p. ej. 'la próxima quincena cobro X'). " +
        "`bankId` es OPCIONAL: si el usuario no lo aclara, dejalo vacío. " +
        "Si el cobro está en otra moneda que la principal, pasá `currency` (ISO 4217). " +
        "Las líneas son únicas por (usuario, fecha, descripción, monto, moneda): " +
        "si ya existe una idéntica el tool devuelve `duplicate=true` sin crear nada.",
      inputSchema: z.object({
        name: z.string().min(1).max(120),
        amount: z.number().positive(),
        bankId: z.string().min(1).optional(),
        category: incomeCategoryEnum.optional().default("OTROS"),
        received: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Si la plata ya entró. Default true porque el usuario suele reportar cobros hechos.",
          ),
        currency: currencySchema
          .optional()
          .describe(
            "ISO 4217. Default = moneda principal del usuario. Pasala cuando el usuario diga 'cobré en USD/ARS/EUR'.",
          ),
        fxRate: z
          .number()
          .positive()
          .optional()
          .describe(
            "Override manual del tipo de cambio. Útil para casos como dólar blue/MEP cuando el cobro entra en moneda distinta a la principal.",
          ),
        occurredOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Fecha en formato yyyy-MM-dd.")
          .optional()
          .describe(
            "Fecha real del cobro (yyyy-MM-dd). Default = hoy. Pasala si el usuario indica una fecha distinta.",
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
        let bankName: string | null = null;
        if (input.bankId) {
          const bank = await db.bank.findFirst({
            where: { id: input.bankId, userId },
            select: { id: true, name: true },
          });
          if (!bank) return { error: "El banco indicado no existe." };
          bankName = bank.name;
        }

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

        const occurredOn = parseIsoDate(input.occurredOn) ?? todayUtcDate();
        let line;
        try {
          line = await db.monthIncomeLine.create({
            data: {
              userId,
              monthRecordId: record.id,
              templateId: null,
              bankId: input.bankId ?? null,
              name: input.name.trim(),
              occurredOn,
              amount: converted.amount,
              currency: converted.currency,
              fxRate: converted.fxRate,
              amountConverted: converted.amountConverted,
              category: input.category as IncomeCategory,
              received: input.received,
            },
          });
        } catch (error) {
          if (isUniqueViolation(error)) {
            return {
              ok: true as const,
              duplicate: true as const,
              note:
                "Ya existía un cobro con esa fecha, descripción y monto. No lo dupliqué.",
            };
          }
          throw error;
        }
        await expireYearTimeline(userId, monthStart.getUTCFullYear());
        return {
          ok: true as const,
          duplicate: false as const,
          line: {
            id: line.id,
            month,
            name: line.name,
            amount: line.amount.toString(),
            currency: line.currency,
            fxRate: line.fxRate.toString(),
            amountConverted: line.amountConverted.toString(),
            primaryCurrency: user.primaryCurrency,
            bankName,
            category: line.category,
            received: line.received,
            occurredOn: line.occurredOn.toISOString().slice(0, 10),
          },
        };
      },
    }),

    updateIncomeLine: tool({
      description:
        "Actualiza una línea de ingreso del mes. Campos editables: `received`, `amount`, " +
        "`name`, `currency`, `fxRate`, `bankId`, `category`, `occurredOn`. " +
        "Útil para confirmar que un cobro previsto ya entró (`received=true`), corregir " +
        "monto/fecha, o moverlo a otro banco/categoría. Si pasás `currency` o `fxRate`, " +
        "recalculamos `amountConverted`; si solo cambia `amount` y la moneda no varía, " +
        "mantenemos el rate ya fijado.",
      inputSchema: z.object({
        id: z.string().min(1),
        received: z.boolean().optional(),
        amount: z.number().positive().optional(),
        name: z.string().min(1).max(120).optional(),
        currency: currencySchema.optional(),
        fxRate: z.number().positive().optional(),
        bankId: z.union([z.string().min(1), z.null()]).optional(),
        category: incomeCategoryEnum.optional(),
        occurredOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Fecha en formato yyyy-MM-dd.")
          .optional(),
      }),
      execute: async ({
        id,
        received,
        amount,
        name,
        currency,
        fxRate,
        bankId,
        category,
        occurredOn,
      }) => {
        const existing = await db.monthIncomeLine.findFirst({
          where: { id, userId },
          include: { monthRecord: { select: { month: true } } },
        });
        if (!existing) return { error: "Línea de ingreso no encontrada." };

        const data: {
          received?: boolean;
          amount?: Prisma.Decimal;
          name?: string;
          currency?: string;
          fxRate?: Prisma.Decimal;
          amountConverted?: Prisma.Decimal;
          bankId?: string | null;
          category?: IncomeCategory;
          occurredOn?: Date;
        } = {};
        if (received !== undefined) data.received = received;
        if (name !== undefined) data.name = name.trim();
        if (category !== undefined) data.category = category as IncomeCategory;

        if (occurredOn !== undefined) {
          const parsed = parseIsoDate(occurredOn);
          if (!parsed) return { error: "occurredOn inválido (yyyy-MM-dd)." };
          data.occurredOn = parsed;
        }

        if (bankId !== undefined) {
          if (bankId === null) {
            data.bankId = null;
          } else {
            const bank = await db.bank.findFirst({
              where: { id: bankId, userId },
              select: { id: true },
            });
            if (!bank) return { error: "El banco indicado no existe." };
            data.bankId = bankId;
          }
        }

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

        let updated;
        try {
          updated = await db.monthIncomeLine.update({ where: { id }, data });
        } catch (error) {
          if (isUniqueViolation(error)) {
            return {
              error:
                "Ya hay un cobro con esa fecha, descripción y monto; no puedo dejar dos idénticos.",
            };
          }
          throw error;
        }
        await expireYearTimeline(
          userId,
          existing.monthRecord.month.getUTCFullYear(),
        );
        return {
          ok: true as const,
          line: {
            id: updated.id,
            name: updated.name,
            amount: updated.amount.toString(),
            currency: updated.currency,
            fxRate: updated.fxRate.toString(),
            amountConverted: updated.amountConverted.toString(),
            received: updated.received,
            bankId: updated.bankId,
            category: updated.category,
            occurredOn: updated.occurredOn.toISOString().slice(0, 10),
          },
        };
      },
    }),

    deleteIncomeLine: tool({
      description:
        "Borra una línea de ingreso del mes (`MonthIncomeLine`). No toca la plantilla " +
        "original. Pedí confirmación verbal al usuario antes de llamar este tool.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const existing = await db.monthIncomeLine.findFirst({
          where: { id, userId },
          include: { monthRecord: { select: { month: true } } },
        });
        if (!existing) return { error: "Línea de ingreso no encontrada." };

        await db.monthIncomeLine.delete({ where: { id } });
        await expireYearTimeline(
          userId,
          existing.monthRecord.month.getUTCFullYear(),
        );
        return {
          ok: true as const,
          deleted: {
            id: existing.id,
            name: existing.name,
            amount: existing.amount.toString(),
            currency: existing.currency,
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
        "Vuelca las plantillas (gastos + ingresos) vigentes que aún no están en el mes a las " +
        "líneas correspondientes (idempotente). Devuelve el conteo de líneas creadas por cada " +
        "tipo (`addedExpenses`, `addedIncomes`).",
      inputSchema: z.object({ month: monthKey }),
      execute: async ({ month }) => {
        try {
          const [expenses, incomes] = await Promise.all([
            mergePendingTemplateLinesIntoMonth(userId, month),
            mergePendingTemplateIncomeLinesIntoMonth(userId, month),
          ]);
          return {
            ok: true,
            addedExpenses: expenses.added,
            addedIncomes: incomes.added,
          };
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
        "Aplica la decisión del usuario sobre el saldo del mes anterior al mes elegido (default = mes actual). " +
        "Si el mes anterior cerró con SOBRANTE: usá `addToIncome` (lo suma a `carryoverFromPrev` del mes) o " +
        "`setAside` (lo acumula en la pila de ahorros como movimiento CARRYOVER_DEPOSIT). " +
        "Si cerró con DEUDA (saldo negativo): usá `coverFromSavings` (retira hasta `min(savings, |deuda|)` " +
        "como movimiento DEBT_COVERAGE; si no alcanza, la deuda restante queda como `carryoverFromPrev` " +
        "negativo del mes actual) o `carryDebt` (toda la deuda pasa al mes actual sin tocar la pila). " +
        "Idempotente: si ya se decidió, devuelve `alreadyDecided=true`. Llamalo SOLO cuando getMonthState " +
        "haya devuelto un `carryoverPrompt` y el usuario haya elegido una opción válida según el `type` " +
        "del prompt (`leftover` o `deficit`).",
      inputSchema: z.object({
        month: optionalMonthKey,
        mode: z.enum(["addToIncome", "setAside", "coverFromSavings", "carryDebt"]),
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
              "No había saldo pendiente del mes anterior. Marcamos la decisión como tomada para no volver a preguntar.",
          };
        }
        if (result.type === "modeMismatch") {
          return {
            error:
              result.expected === "leftover"
                ? "El mes anterior cerró con sobrante: usá `addToIncome` o `setAside`."
                : "El mes anterior cerró con deuda: usá `coverFromSavings` o `carryDebt`.",
          };
        }
        return {
          ok: true as const,
          alreadyDecided: false as const,
          applied: true as const,
          month: target,
          mode: result.mode,
          leftover: result.leftover,
          ...(result.covered !== undefined ? { covered: result.covered } : {}),
          ...(result.remainingDebt !== undefined
            ? { remainingDebt: result.remainingDebt }
            : {}),
        };
      },
    }),

    getSavingsState: tool({
      description:
        "Lee el estado actual de la pila global de ahorros: balance acumulado y los últimos N movimientos " +
        "(default 20, máx 100) más recientes primero. Cada movimiento incluye `kind` " +
        "(MONTHLY_CONTRIBUTION = aporte mensual informativo, CARRYOVER_DEPOSIT = sobrante derivado a ahorro, " +
        "DEBT_COVERAGE = retiro para cubrir mes negativo, MANUAL_DEPOSIT/MANUAL_WITHDRAWAL = ad-hoc), " +
        "monto FIRMADO (positivo entra, negativo sale), `monthKey` cuando hay mes asociado, fecha y nota.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async ({ limit }) => {
        const state = await getSavingsState(userId, { limit: limit ?? 20 });
        return {
          balance: state.balance,
          currency: state.currency,
          movements: state.movements,
          summaryText:
            `Pila de ahorro: ${state.currency} ${formatMoney(state.balance)} ` +
            `(${state.movements.length} movimiento(s) recientes).`,
        };
      },
    }),

    addSavingsMovement: tool({
      description:
        "Registra un movimiento manual en la pila de ahorros. " +
        "`kind=MANUAL_DEPOSIT` para meter plata (SUMA a la pila). " +
        "`kind=MANUAL_WITHDRAWAL` para sacar plata (RESTA de la pila — usalo cuando el usuario diga " +
        "'saqué/retiré X de los ahorros', 'restale X', 'gasté X de la pila'). " +
        "`amount` siempre positivo; el signo lo aplicamos según `kind`. Para retiros, validamos que la " +
        "pila alcance — si no, devolvemos `error`. " +
        "NO uses este tool para el aporte mensual del usuario (usá `setMonthlySavingsContribution`) ni para " +
        "cubrir deuda del mes anterior (usá `applyPrevMonthLeftover` con `mode=coverFromSavings`).",
      inputSchema: z.object({
        kind: z.enum(["MANUAL_DEPOSIT", "MANUAL_WITHDRAWAL"]),
        amount: z.number().positive(),
        note: z.string().max(500).optional(),
        occurredOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Fecha en formato yyyy-MM-dd.")
          .optional(),
      }),
      execute: async ({ kind, amount, note, occurredOn }) => {
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { primaryCurrency: true, savings: true },
        });
        if (!user) return { error: "Usuario no encontrado." };
        const magnitude = new Prisma.Decimal(amount.toFixed(2));
        if (kind === "MANUAL_WITHDRAWAL" && user.savings.lessThan(magnitude)) {
          return {
            error:
              `La pila tiene ${user.primaryCurrency} ${formatMoney(Number(user.savings))} ` +
              `y no alcanza para retirar ${user.primaryCurrency} ${formatMoney(amount)}.`,
          };
        }
        const signed =
          kind === "MANUAL_WITHDRAWAL" ? magnitude.negated() : magnitude;
        const result = await recordSavingsMovement({
          userId,
          kind:
            kind === "MANUAL_WITHDRAWAL"
              ? SavingsMovementKind.MANUAL_WITHDRAWAL
              : SavingsMovementKind.MANUAL_DEPOSIT,
          amount: signed,
          currency: user.primaryCurrency,
          note: note ?? null,
          occurredOn: parseIsoDate(occurredOn) ?? undefined,
        });
        return {
          ok: true as const,
          balance: result.balance,
          movement: {
            id: result.movement.id,
            kind: result.movement.kind,
            amount: Number(result.movement.amount),
            currency: result.movement.currency,
            note: result.movement.note,
            occurredOn: result.movement.occurredOn.toISOString().slice(0, 10),
          },
        };
      },
    }),

    deleteSavingsMovement: tool({
      description:
        "Borra un movimiento manual del ledger de ahorros (`MANUAL_DEPOSIT` o `MANUAL_WITHDRAWAL`) y " +
        "revierte su efecto sobre la pila. Usalo cuando el usuario diga 'borrá ese movimiento de ahorros', " +
        "'sacá el depósito que cargué mal', 'borrá el retiro de X', etc. " +
        "Bloqueado para movimientos del sistema (`MONTHLY_CONTRIBUTION`, `CARRYOVER_DEPOSIT`, " +
        "`DEBT_COVERAGE`): para deshacer un aporte mensual usá `removeMonthlySavingsContribution`; " +
        "para deshacer una decisión de carryover (sobrante derivado o cobertura de deuda) " +
        "no hay tool de revert directo, avisale al usuario que tiene que rehacer la decisión del mes. " +
        "Si dudás del id, primero llamá `getSavingsState` para listar los movimientos. " +
        "Pedí confirmación verbal corta antes de llamar este tool.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const existing = await db.savingsMovement.findFirst({
          where: { id, userId },
          select: { id: true, kind: true, amount: true, currency: true },
        });
        if (!existing) return { error: "El movimiento indicado no existe." };
        if (
          existing.kind !== SavingsMovementKind.MANUAL_DEPOSIT &&
          existing.kind !== SavingsMovementKind.MANUAL_WITHDRAWAL
        ) {
          return {
            error:
              `Ese movimiento es del sistema (${existing.kind}) y no se puede borrar a mano. ` +
              "Para el aporte mensual usá removeMonthlySavingsContribution; para los movimientos de " +
              "carryover (CARRYOVER_DEPOSIT/DEBT_COVERAGE) hay que rehacer la decisión del mes que los originó.",
            kind: existing.kind,
          };
        }
        const result = await deleteSavingsMovement(id, userId);
        if (!result.ok) return { error: "El movimiento indicado no existe." };
        return {
          ok: true as const,
          balance: result.balance,
          deleted: {
            id: existing.id,
            kind: existing.kind,
            amount: Number(existing.amount),
            currency: existing.currency,
          },
        };
      },
    }),

    dedupeSavingsMovements: tool({
      description:
        "Detecta y borra movimientos MANUAL_* duplicados del ledger de ahorros. " +
        "Dos movimientos cuentan como duplicados si comparten `kind`, monto firmado, moneda, " +
        "fecha (`occurredOn`) y nota (nota nula y vacía cuentan iguales). Solo afecta " +
        "`MANUAL_DEPOSIT` y `MANUAL_WITHDRAWAL`: los kinds del sistema " +
        "(MONTHLY_CONTRIBUTION, CARRYOVER_DEPOSIT, DEBT_COVERAGE) ya tienen unicidad por mes y se ignoran. " +
        "Por defecto corre en `dryRun=true` y devuelve los grupos detectados sin borrar nada — usalo " +
        "para mostrarle al usuario qué se duplicó y pedir confirmación. Recién después llamalo con " +
        "`dryRun=false` para aplicar el borrado: en cada grupo conserva el movimiento más antiguo " +
        "(por `createdAt`) y borra el resto, ajustando la pila en una sola transacción. " +
        "Pedí confirmación verbal corta antes de pasar `dryRun=false`.",
      inputSchema: z.object({
        dryRun: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Si es true (default), solo lista los duplicados detectados. Pasá false para borrarlos.",
          ),
      }),
      execute: async ({ dryRun }) => {
        // Tolerate callers that bypass schema parsing (tests, MCP shims).
        const isDryRun = dryRun !== false;
        const groups = await findManualDuplicateMovements(userId);
        const totalDuplicates = groups.reduce(
          (acc, g) => acc + g.duplicateIds.length,
          0,
        );
        if (groups.length === 0) {
          return {
            ok: true as const,
            dryRun: isDryRun,
            groups: [],
            totalDuplicates: 0,
            note: "No encontré movimientos manuales duplicados en la pila.",
          };
        }
        if (isDryRun) {
          return {
            ok: true as const,
            dryRun: true as const,
            applied: false as const,
            totalDuplicates,
            groups: groups.map((g) => ({
              kind: g.kind,
              amount: g.amount,
              currency: g.currency,
              occurredOn: g.occurredOn,
              note: g.note,
              keeperId: g.keeperId,
              duplicateIds: g.duplicateIds,
              extraCount: g.duplicateIds.length,
            })),
            note:
              `Detecté ${groups.length} grupo(s) con ${totalDuplicates} movimiento(s) extra. ` +
              "Pedile confirmación al usuario y volvé a llamar con dryRun=false para borrarlos.",
          };
        }
        const idsToDelete = groups.flatMap((g) => g.duplicateIds);
        const result = await deleteManualDuplicateMovements(userId, idsToDelete);
        return {
          ok: true as const,
          dryRun: false as const,
          applied: true as const,
          totalDuplicates,
          deletedCount: result.deletedCount,
          balance: result.balance,
          groups: groups.map((g) => ({
            kind: g.kind,
            amount: g.amount,
            currency: g.currency,
            occurredOn: g.occurredOn,
            note: g.note,
            keeperId: g.keeperId,
            duplicateIds: g.duplicateIds,
            extraCount: g.duplicateIds.length,
          })),
        };
      },
    }),

    setMonthlySavingsContribution: tool({
      description:
        "Upsert del aporte mensual INFORMATIVO del usuario para un mes (yyyy-MM). El monto entra a la pila " +
        "como movimiento `MONTHLY_CONTRIBUTION` pero NO afecta el balance del mes (no se descuenta del " +
        "ingreso ni aparece como gasto). Hay UN solo aporte por mes; si ya existía, lo reemplaza. " +
        "Requiere que el mes esté creado (createMonthIfNeeded antes si no).",
      inputSchema: z.object({
        month: monthKey,
        amount: z.number().positive(),
        note: z.string().max(500).optional(),
      }),
      execute: async ({ month, amount, note }) => {
        const monthStart = toMonthStart(parseMonthKey(month));
        const [user, monthRecord] = await Promise.all([
          db.user.findUnique({
            where: { id: userId },
            select: { primaryCurrency: true },
          }),
          db.monthRecord.findFirst({
            where: { userId, month: monthStart },
            select: { id: true },
          }),
        ]);
        if (!user) return { error: "Usuario no encontrado." };
        if (!monthRecord) {
          return {
            error:
              "El mes no está configurado todavía. Llamá createMonthIfNeeded antes.",
          };
        }
        const result = await setMonthlySavingsContribution({
          userId,
          monthRecordId: monthRecord.id,
          amount: new Prisma.Decimal(amount.toFixed(2)),
          currency: user.primaryCurrency,
          note: note ?? null,
          occurredOn: monthStart,
        });
        return {
          ok: true as const,
          replaced: result.replaced,
          balance: result.balance,
          month,
          amount: Number(result.movement.amount),
        };
      },
    }),

    removeMonthlySavingsContribution: tool({
      description:
        "Borra el aporte mensual informativo del usuario para un mes (yyyy-MM) si existe. Revierte el " +
        "efecto sobre la pila. Devuelve `removed=false` cuando no había aporte registrado.",
      inputSchema: z.object({ month: monthKey }),
      execute: async ({ month }) => {
        const monthStart = toMonthStart(parseMonthKey(month));
        const monthRecord = await db.monthRecord.findFirst({
          where: { userId, month: monthStart },
          select: { id: true },
        });
        if (!monthRecord) {
          return { error: "El mes no está configurado todavía." };
        }
        const result = await removeMonthlySavingsContribution({
          userId,
          monthRecordId: monthRecord.id,
        });
        return { ok: true as const, removed: result.removed, balance: result.balance, month };
      },
    }),

    setUserLocale: tool({
      description:
        "Updates the user's UI/agent language. Call when the user explicitly asks to switch language (e.g. 'habla en inglés', 'switch to Spanish', 'cambiá a español'). After this tool runs, the agent's NEXT reply MUST already be in the new locale, with a short acknowledgement.",
      inputSchema: z.object({
        locale: z
          .enum(["es", "en"])
          .describe("Target locale: 'es' (rioplatense Spanish) or 'en' (neutral English)."),
      }),
      execute: async ({ locale }) => {
        await db.user.update({
          where: { id: userId },
          data: { locale },
        });
        return { ok: true as const, locale };
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

    getFxRate: tool({
      description:
        "Consulta el tipo de cambio actual `1 from = X to`. Si omitís `to`, usamos la moneda principal del usuario. " +
        "Útil para previsualizar conversiones antes de cargar un gasto, o cuando el usuario pregunta '¿a cuánto está USD/ARS?'. " +
        "El rate se cachea por 1h. Si la fuente no responde, devolvemos `error` y conviene pedirle al usuario un rate manual " +
        "para usar como `fxRate` en addMonthLine/updateMonthLine.",
      inputSchema: z.object({
        from: currencySchema,
        to: currencySchema.optional(),
      }),
      execute: async ({ from, to }) => {
        let target = to;
        if (!target) {
          const user = await db.user.findUnique({
            where: { id: userId },
            select: { primaryCurrency: true },
          });
          if (!user) return { error: "Usuario no encontrado." };
          target = user.primaryCurrency;
        }
        try {
          const rate = await fetchFxRate(from, target);
          return {
            ok: true as const,
            from,
            to: target,
            fxRate: rate.toString(),
            example: `1 ${from} ≈ ${rate.toString()} ${target}`,
          };
        } catch (error) {
          if (error instanceof FxUnavailableError) {
            return {
              error: `No pudimos obtener el tipo de cambio ${error.from}->${error.to}. Pedile al usuario un rate manual.`,
            };
          }
          throw error;
        }
      },
    }),

    updateExpenseImportInstructions: tool({
      description:
        "Guarda en la cuenta del usuario las instrucciones persistentes para importaciones (CSV, fotos), categorías y cómo marcar líneas (p. ej. pagado al importar). Usalo cuando pida recordar algo de forma permanente ('guardá que…', 'de ahora en más…', 'no quiero tener que repetir…'). Si solo agrega una regla nueva sin borrar el resto, usá mode=append (el texto actual está en el system prompt como bloque «Instrucciones personales»). Si reescribe todo el bloque, mode=replace. Después del tool, confirmá en una frase lo guardado.",
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
