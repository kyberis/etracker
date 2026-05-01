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
  .regex(/^\d{4}-\d{2}$/u, "Month in yyyy-MM format (e.g. 2026-04).");
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
        "Reads the user's state for a month (yyyy-MM). If no month is passed, uses the current month. Returns `primaryCurrency`, received income, expected income, income lines (each with its original currency + converted amount + `received` flag), carryover from the previous month, expense lines, planned/paid/remaining totals (in the primary currency), balance (received income + carryover − planned), savings stack, and if applicable `carryoverPrompt` with the previous month's balance pending a decision.",
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
              "The month is not set up yet. You can create it with createMonthIfNeeded.",
          };
        }
        const carryoverNote =
          data.carryoverPrompt &&
          (data.carryoverPrompt.type === "leftover"
            ? `The user closed ${data.carryoverPrompt.prevMonth} with ${data.primaryCurrency} ${formatMoney(data.carryoverPrompt.amount)} unspent and hasn't decided what to do with the leftover. Congratulate them and offer two options: add it to the income of ${target} (\`mode=addToIncome\`) or set it aside as savings (\`mode=setAside\`). When they choose, call applyPrevMonthLeftover.`
            : `The user closed ${data.carryoverPrompt.prevMonth} in the red by ${data.primaryCurrency} ${formatMoney(data.carryoverPrompt.amount)} and hasn't decided how to handle it. Savings stack available: ${data.primaryCurrency} ${formatMoney(data.carryoverPrompt.savings)}. Without lecturing, offer two options: cover with savings (\`mode=coverFromSavings\` — partial coverage if the stack isn't enough) or carry the debt over to the current month (\`mode=carryDebt\`). When they choose, call applyPrevMonthLeftover.`);
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
            `Received income ${data.primaryCurrency} ${formatMoney(data.income)}` +
            (data.incomeTotals.pending > 0
              ? ` (+ ${data.primaryCurrency} ${formatMoney(data.incomeTotals.pending)} expected not yet received)`
              : "") +
            (data.carryoverFromPrev > 0
              ? ` (+ ${data.primaryCurrency} ${formatMoney(data.carryoverFromPrev)} carryover)`
              : "") +
            `, planned ${data.primaryCurrency} ${formatMoney(data.totals.planned)}, ` +
            `paid ${data.primaryCurrency} ${formatMoney(data.totals.paid)}, remaining ${data.primaryCurrency} ${formatMoney(data.totals.remaining)}, ` +
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
        "Lists the user's banks with id and name. Useful when the user mentions a bank by name.",
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
        "Creates a new bank/account for the user (e.g. 'Visa', 'Chase', 'Cash'). " +
        "If one already exists with the same name, returns `error` with a duplicate code. " +
        "`color` is optional in hex (with or without `#`).",
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
            return { error: `A bank named "${name.trim()}" already exists.` };
          }
          throw error;
        }
      },
    }),

    updateBank: tool({
      description:
        "Renames a bank or changes its color. Pass the fields to modify; omitted ones stay the same. " +
        "Verifies the bank belongs to the user.",
      inputSchema: z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(80).optional(),
        color: hexColorSchema.nullable().optional().describe(
          "Hex color (with or without `#`). Pass `null` to clear the color.",
        ),
      }),
      execute: async ({ id, name, color }) => {
        const existing = await db.bank.findFirst({ where: { id, userId } });
        if (!existing) return { error: "The specified bank doesn't exist." };

        const data: { name?: string; color?: string | null } = {};
        if (name !== undefined) data.name = name.trim();
        if (color !== undefined) data.color = normalizeHexColor(color);
        if (Object.keys(data).length === 0) {
          return { error: "Nothing to update." };
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
              error: `A bank with that name already exists. Pick another one or rename the existing one.`,
            };
          }
          throw error;
        }
      },
    }),

    deleteBank: tool({
      description:
        "Deletes a user's bank. Blocked if the bank has associated templates (`Expense`) or " +
        "lines (`MonthExpenseLine`): in that case returns the counts so you can offer to " +
        "reassign to another bank or delete those records first. Ask the user for verbal " +
        "confirmation before calling this tool.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const existing = await db.bank.findFirst({
          where: { id, userId },
          select: { id: true, name: true },
        });
        if (!existing) return { error: "The specified bank doesn't exist." };

        const [templateCount, lineCount] = await Promise.all([
          db.expense.count({ where: { bankId: id, userId } }),
          db.monthExpenseLine.count({ where: { bankId: id, userId } }),
        ]);
        if (templateCount > 0 || lineCount > 0) {
          return {
            error:
              `Can't delete "${existing.name}": it has ${templateCount} template(s) and ${lineCount} line(s) associated. ` +
              "Reassign those records to another bank or delete them first.",
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
        "Lists the user's expense templates (recurring and one-off).",
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
        "Creates an expense template (recurring or one-off). If you don't know the bankId, ask the user or use listBanks. For recurring expenses starting today use the current month.",
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
        if (!bank) return { error: "The specified bank doesn't exist." };

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
        "Updates an existing expense template. Pass only the fields to modify (name, amount, bank, category, recurrence, start/end month). " +
        "Does not materialize changes onto months already created; future months (or those synced with `mergePendingTemplates`) will pick up the new values. " +
        "If you pass `endMonth=null`, it's left open (no end date).",
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
        if (!existing) return { error: "The specified template doesn't exist." };

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
          if (!bank) return { error: "The specified bank doesn't exist." };
          data.bankId = bankId;
        }

        if (Object.keys(data).length === 0) {
          return { error: "Nothing to update." };
        }

        // Cross-field validation: one-off templates must not have endMonth, and
        // endMonth must be >= startMonth on the resulting record.
        const nextRecurring = data.isRecurring ?? existing.isRecurring;
        const nextStart = data.startMonth ?? existing.startMonth;
        const nextEnd = data.endMonth !== undefined ? data.endMonth : existing.endMonth;
        if (!nextRecurring && nextEnd) {
          return { error: "One-off templates can't have an endMonth." };
        }
        if (nextEnd && nextEnd < nextStart) {
          return { error: "endMonth must be >= startMonth." };
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
        "Deletes a template (`Expense`). Lines (`MonthExpenseLine`) already materialized in " +
        "existing months are preserved and simply left unlinked (`templateId=null`), so history " +
        "isn't lost. Ask the user for verbal confirmation before calling this tool.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const existing = await db.expense.findFirst({
          where: { id, userId },
          select: { id: true, name: true },
        });
        if (!existing) return { error: "The specified template doesn't exist." };

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
        "Adds a one-off expense to the current month (does not create a template). Only the current month is allowed. " +
        "Useful when the user reports a one-off expense (bank screenshot, message, receipt). " +
        "By default the line is created as **paid** (`paid=true`) because the user usually reports " +
        "something already spent. Pass `paid=false` ONLY if the user explicitly says it isn't paid yet. " +
        "If the expense is in a currency other than the user's primary, pass `currency` (ISO 4217). " +
        "You can override the exchange rate with `fxRate` (e.g. parallel market rates); if omitted, " +
        "we fetch an automatic rate and freeze it onto the line. " +
        "Lines are unique by (user, date, description, amount, currency): " +
        "if an identical one already exists the tool returns `duplicate=true` without creating anything.",
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
            "Whether the expense is already paid. Default true because users usually report expenses already made.",
          ),
        currency: currencySchema
          .optional()
          .describe(
            "ISO 4217 (3 letters). Default = user's primary currency. Pass it when the user says 'I paid in USD/ARS/EUR'.",
          ),
        fxRate: z
          .number()
          .positive()
          .optional()
          .describe(
            "Manual override of the exchange rate. Useful for cases like parallel-market rates. If omitted, we use the live rate.",
          ),
        occurredOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Date in yyyy-MM-dd format.")
          .optional()
          .describe(
            "Actual date of the expense (yyyy-MM-dd). Default = today. Pass it if the user indicates a different date (e.g. 'last week', a dated receipt).",
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
        if (!user) return { error: "User not found." };
        if (!record) {
          return {
            error:
              "The current month is not set up yet. Ask the user to create it with createMonthIfNeeded.",
          };
        }
        const bank = await db.bank.findFirst({
          where: { id: input.bankId, userId },
          select: { id: true, name: true },
        });
        if (!bank) return { error: "The specified bank doesn't exist." };

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
              error: `Couldn't fetch the exchange rate ${error.from}->${error.to}. Ask the user for a rate and retry passing "fxRate".`,
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
                "An expense with that date, description, and amount already existed. Did not duplicate it.",
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
        "Updates a month line. Editable fields: `paid`, `amount`, `name`, `currency`, `fxRate`, `bankId`, `category`, `occurredOn` (yyyy-MM-dd). " +
        "Useful for reconciling with a bank screenshot, moving a line to another bank/category, correcting the actual date, or marking payments. " +
        "If you pass `currency` or `fxRate`, we recalculate `amountConverted` with the matching rate; if only `amount` changes and the currency stays the same, we keep the rate already fixed on the line.",
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
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Date in yyyy-MM-dd format.")
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
        if (!existing) return { error: "Line not found." };

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
          if (!parsed) return { error: "Invalid occurredOn (yyyy-MM-dd)." };
          data.occurredOn = parsed;
        }

        if (bankId !== undefined) {
          const bank = await db.bank.findFirst({
            where: { id: bankId, userId },
            select: { id: true },
          });
          if (!bank) return { error: "The specified bank doesn't exist." };
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
          if (!user) return { error: "User not found." };
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
                error: `Couldn't fetch the exchange rate ${error.from}->${error.to}. Ask the user for a rate and retry passing "fxRate".`,
              };
            }
            throw error;
          }
        }

        if (Object.keys(data).length === 0) {
          return { error: "Nothing to update." };
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
                "There's already an expense with that date, description, and amount; I can't leave two identical ones.",
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
        "Deletes a month line (`MonthExpenseLine`). Does not touch the original template. " +
        "Ask the user for verbal confirmation before calling this tool.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const existing = await db.monthExpenseLine.findFirst({
          where: { id, monthRecord: { userId } },
          include: { monthRecord: { select: { month: true } } },
        });
        if (!existing) return { error: "Line not found." };

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
        "Lists the user's income templates (recurring and one-off). Useful when " +
        "the user talks about 'my salary', 'what I earn from rent', 'the fixed freelance retainer', etc.",
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
        "Creates an income template (recurring or one-off). Use it when the user mentions " +
        "a fixed incoming payment: monthly salary, rent they receive, freelance retainer, etc. " +
        "`bankId` is OPTIONAL (incoming payments aren't always tied to an account — if the user " +
        "doesn't clarify, leave it empty). For income in a currency other than the primary, pass " +
        "`currency`. `category` helps classify (SUELDO, FREELANCE, NEGOCIO, INVERSIONES, " +
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
          if (!bank) return { error: "The specified bank doesn't exist." };
        }
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { primaryCurrency: true },
        });
        if (!user) return { error: "User not found." };

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
        "Updates an existing income template. Pass only the fields to modify " +
        "(name, amount, bank, currency, category, recurrence, start/end month). " +
        "Pass `bankId=null` to unlink the bank. Does not materialize changes onto months already " +
        "created; future months (or those synced with `mergePendingTemplates`) " +
        "will pick up the new values.",
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
        if (!existing) return { error: "The specified template doesn't exist." };

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
            if (!bank) return { error: "The specified bank doesn't exist." };
            data.bankId = bankId;
          }
        }

        if (Object.keys(data).length === 0) {
          return { error: "Nothing to update." };
        }

        const nextRecurring = data.isRecurring ?? existing.isRecurring;
        const nextStart = data.startMonth ?? existing.startMonth;
        const nextEnd = data.endMonth !== undefined ? data.endMonth : existing.endMonth;
        if (!nextRecurring && nextEnd) {
          return { error: "One-off templates can't have an endMonth." };
        }
        if (nextEnd && nextEnd < nextStart) {
          return { error: "endMonth must be >= startMonth." };
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
        "Deletes an income template. Lines (`MonthIncomeLine`) already materialized in " +
        "existing months are preserved and simply left unlinked (`templateId=null`). " +
        "Ask the user for verbal confirmation before calling this tool.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const existing = await db.income.findFirst({
          where: { id, userId },
          select: { id: true, name: true },
        });
        if (!existing) return { error: "The specified template doesn't exist." };

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
        "Records a ONE-OFF incoming payment in the current month (does not create a template). Only the " +
        "current month is allowed. Use it when the user says 'I got paid X', 'they paid me $Y', 'they " +
        "transferred me $Z for freelance', 'the bonus came in', 'I got a refund', etc. " +
        "By default the line is created as **received** (`received=true`) because the user " +
        "is reporting something already received. Pass `received=false` ONLY if they clarify they're still " +
        "waiting for the payment (e.g. 'next payday I'll get X'). " +
        "`bankId` is OPTIONAL: if the user doesn't clarify, leave it empty. " +
        "If the payment is in a currency other than the primary, pass `currency` (ISO 4217). " +
        "Lines are unique by (user, date, description, amount, currency): " +
        "if an identical one already exists the tool returns `duplicate=true` without creating anything.",
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
            "Whether the money has already arrived. Default true because users usually report payments already received.",
          ),
        currency: currencySchema
          .optional()
          .describe(
            "ISO 4217. Default = user's primary currency. Pass it when the user says 'I got paid in USD/ARS/EUR'.",
          ),
        fxRate: z
          .number()
          .positive()
          .optional()
          .describe(
            "Manual override of the exchange rate. Useful for cases like parallel-market rates when the payment arrives in a currency other than the primary.",
          ),
        occurredOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Date in yyyy-MM-dd format.")
          .optional()
          .describe(
            "Actual date of the payment (yyyy-MM-dd). Default = today. Pass it if the user indicates a different date.",
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
        if (!user) return { error: "User not found." };
        if (!record) {
          return {
            error:
              "The current month is not set up yet. Ask the user to create it with createMonthIfNeeded.",
          };
        }
        let bankName: string | null = null;
        if (input.bankId) {
          const bank = await db.bank.findFirst({
            where: { id: input.bankId, userId },
            select: { id: true, name: true },
          });
          if (!bank) return { error: "The specified bank doesn't exist." };
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
              error: `Couldn't fetch the exchange rate ${error.from}->${error.to}. Ask the user for a rate and retry passing "fxRate".`,
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
                "An incoming payment with that date, description, and amount already existed. Did not duplicate it.",
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
        "Updates a month income line. Editable fields: `received`, `amount`, " +
        "`name`, `currency`, `fxRate`, `bankId`, `category`, `occurredOn`. " +
        "Useful to confirm that an expected payment arrived (`received=true`), correct " +
        "amount/date, or move it to another bank/category. If you pass `currency` or `fxRate`, " +
        "we recalculate `amountConverted`; if only `amount` changes and the currency stays the same, " +
        "we keep the rate already fixed.",
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
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Date in yyyy-MM-dd format.")
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
        if (!existing) return { error: "Income line not found." };

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
          if (!parsed) return { error: "Invalid occurredOn (yyyy-MM-dd)." };
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
            if (!bank) return { error: "The specified bank doesn't exist." };
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
          if (!user) return { error: "User not found." };
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
                error: `Couldn't fetch the exchange rate ${error.from}->${error.to}. Ask the user for a rate and retry passing "fxRate".`,
              };
            }
            throw error;
          }
        }

        if (Object.keys(data).length === 0) {
          return { error: "Nothing to update." };
        }

        let updated;
        try {
          updated = await db.monthIncomeLine.update({ where: { id }, data });
        } catch (error) {
          if (isUniqueViolation(error)) {
            return {
              error:
                "There's already an incoming payment with that date, description, and amount; I can't leave two identical ones.",
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
        "Deletes a month income line (`MonthIncomeLine`). Does not touch the original " +
        "template. Ask the user for verbal confirmation before calling this tool.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const existing = await db.monthIncomeLine.findFirst({
          where: { id, userId },
          include: { monthRecord: { select: { month: true } } },
        });
        if (!existing) return { error: "Income line not found." };

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
        "Creates a month bucket if it doesn't exist yet, copying from templates (mode=templates) or from another month (mode=copyFrom + copyFromMonth).",
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
              return { error: "The source month doesn't exist." };
            }
            throw e;
          }
        }
        return { ok: true, alreadyExisted: false, month: payload.month };
      },
    }),

    mergePendingTemplates: tool({
      description:
        "Pours active templates (expenses + incomes) that aren't yet in the month into the " +
        "matching lines (idempotent). Returns the count of lines created per " +
        "type (`addedExpenses`, `addedIncomes`).",
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
            return { error: "The month is not set up." };
          }
          throw e;
        }
      },
    }),

    applyPrevMonthLeftover: tool({
      description:
        "Applies the user's decision about the previous month's balance to the chosen month (default = current month). " +
        "If the previous month closed with a LEFTOVER: use `addToIncome` (adds to `carryoverFromPrev` of the month) or " +
        "`setAside` (accumulates in the savings stack as a CARRYOVER_DEPOSIT movement). " +
        "If it closed with DEBT (negative balance): use `coverFromSavings` (withdraws up to `min(savings, |debt|)` " +
        "as a DEBT_COVERAGE movement; if it's not enough, the remaining debt stays as a negative " +
        "`carryoverFromPrev` on the current month) or `carryDebt` (all the debt moves to the current month without touching the stack). " +
        "Idempotent: if already decided, returns `alreadyDecided=true`. Call it ONLY when getMonthState " +
        "has returned a `carryoverPrompt` and the user has chosen a valid option according to the prompt's `type` " +
        "(`leftover` or `deficit`).",
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
              "The month is not set up yet. Call createMonthIfNeeded before applying the leftover.",
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
              "There was no pending balance from the previous month. We marked the decision as taken so we don't ask again.",
          };
        }
        if (result.type === "modeMismatch") {
          return {
            error:
              result.expected === "leftover"
                ? "The previous month closed with a leftover: use `addToIncome` or `setAside`."
                : "The previous month closed with debt: use `coverFromSavings` or `carryDebt`.",
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
        "Reads the current state of the global savings stack: accumulated balance and the last N movements " +
        "(default 20, max 100) most recent first. Each movement includes `kind` " +
        "(MONTHLY_CONTRIBUTION = informational monthly contribution, CARRYOVER_DEPOSIT = leftover routed to savings, " +
        "DEBT_COVERAGE = withdrawal to cover a negative month, MANUAL_DEPOSIT/MANUAL_WITHDRAWAL = ad-hoc), " +
        "SIGNED amount (positive in, negative out), `monthKey` when there's an associated month, date, and note.",
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
            `Savings stack: ${state.currency} ${formatMoney(state.balance)} ` +
            `(${state.movements.length} recent movement(s)).`,
        };
      },
    }),

    addSavingsMovement: tool({
      description:
        "Records a manual movement in the savings stack. " +
        "`kind=MANUAL_DEPOSIT` to add money (ADDS to the stack). " +
        "`kind=MANUAL_WITHDRAWAL` to take money out (SUBTRACTS from the stack — use it when the user says " +
        "'I withdrew X from savings', 'subtract X', 'I spent X from the stack'). " +
        "`amount` is always positive; we apply the sign based on `kind`. For withdrawals, we validate that the " +
        "stack has enough — otherwise we return `error`. " +
        "Do NOT use this tool for the user's monthly contribution (use `setMonthlySavingsContribution`) or to " +
        "cover the previous month's debt (use `applyPrevMonthLeftover` with `mode=coverFromSavings`).",
      inputSchema: z.object({
        kind: z.enum(["MANUAL_DEPOSIT", "MANUAL_WITHDRAWAL"]),
        amount: z.number().positive(),
        note: z.string().max(500).optional(),
        occurredOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Date in yyyy-MM-dd format.")
          .optional(),
      }),
      execute: async ({ kind, amount, note, occurredOn }) => {
        const user = await db.user.findUnique({
          where: { id: userId },
          select: { primaryCurrency: true, savings: true },
        });
        if (!user) return { error: "User not found." };
        const magnitude = new Prisma.Decimal(amount.toFixed(2));
        if (kind === "MANUAL_WITHDRAWAL" && user.savings.lessThan(magnitude)) {
          return {
            error:
              `The stack has ${user.primaryCurrency} ${formatMoney(Number(user.savings))} ` +
              `and isn't enough to withdraw ${user.primaryCurrency} ${formatMoney(amount)}.`,
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
        "Deletes a manual movement from the savings ledger (`MANUAL_DEPOSIT` or `MANUAL_WITHDRAWAL`) and " +
        "reverts its effect on the stack. Use it when the user says 'delete that savings movement', " +
        "'remove the deposit I entered wrong', 'delete the withdrawal of X', etc. " +
        "Blocked for system movements (`MONTHLY_CONTRIBUTION`, `CARRYOVER_DEPOSIT`, " +
        "`DEBT_COVERAGE`): to undo a monthly contribution use `removeMonthlySavingsContribution`; " +
        "to undo a carryover decision (leftover routed or debt coverage) " +
        "there's no direct revert tool — tell the user they need to redo the month's decision. " +
        "If unsure about the id, first call `getSavingsState` to list the movements. " +
        "Ask for brief verbal confirmation before calling this tool.",
      inputSchema: z.object({ id: z.string().min(1) }),
      execute: async ({ id }) => {
        const existing = await db.savingsMovement.findFirst({
          where: { id, userId },
          select: { id: true, kind: true, amount: true, currency: true },
        });
        if (!existing) return { error: "The specified movement doesn't exist." };
        if (
          existing.kind !== SavingsMovementKind.MANUAL_DEPOSIT &&
          existing.kind !== SavingsMovementKind.MANUAL_WITHDRAWAL
        ) {
          return {
            error:
              `That movement is a system one (${existing.kind}) and can't be deleted by hand. ` +
              "For the monthly contribution use removeMonthlySavingsContribution; for carryover " +
              "movements (CARRYOVER_DEPOSIT/DEBT_COVERAGE) you need to redo the decision of the month that originated them.",
            kind: existing.kind,
          };
        }
        const result = await deleteSavingsMovement(id, userId);
        if (!result.ok) return { error: "The specified movement doesn't exist." };
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
        "Detects and deletes duplicate MANUAL_* movements from the savings ledger. " +
        "Two movements count as duplicates if they share `kind`, signed amount, currency, " +
        "date (`occurredOn`), and note (null and empty note count the same). Only affects " +
        "`MANUAL_DEPOSIT` and `MANUAL_WITHDRAWAL`: system kinds " +
        "(MONTHLY_CONTRIBUTION, CARRYOVER_DEPOSIT, DEBT_COVERAGE) already have per-month uniqueness and are ignored. " +
        "By default runs in `dryRun=true` and returns detected groups without deleting anything — use it " +
        "to show the user what was duplicated and ask for confirmation. Only then call it with " +
        "`dryRun=false` to apply the deletion: in each group it keeps the oldest movement " +
        "(by `createdAt`) and deletes the rest, adjusting the stack in a single transaction. " +
        "Ask for brief verbal confirmation before passing `dryRun=false`.",
      inputSchema: z.object({
        dryRun: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "If true (default), only lists the detected duplicates. Pass false to delete them.",
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
            note: "No duplicate manual movements were found in the stack.",
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
              `Detected ${groups.length} group(s) with ${totalDuplicates} extra movement(s). ` +
              "Ask the user for confirmation and call again with dryRun=false to delete them.",
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
        "Upsert of the user's INFORMATIONAL monthly contribution for a month (yyyy-MM). The amount enters the stack " +
        "as a `MONTHLY_CONTRIBUTION` movement but does NOT affect the month's balance (it's not deducted from " +
        "income nor shown as an expense). There's ONLY ONE contribution per month; if one already existed, it's replaced. " +
        "Requires the month to be created (createMonthIfNeeded first if not).",
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
        if (!user) return { error: "User not found." };
        if (!monthRecord) {
          return {
            error:
              "The month is not set up yet. Call createMonthIfNeeded first.",
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
        "Deletes the user's informational monthly contribution for a month (yyyy-MM) if it exists. Reverts the " +
        "effect on the stack. Returns `removed=false` when there was no contribution recorded.",
      inputSchema: z.object({ month: monthKey }),
      execute: async ({ month }) => {
        const monthStart = toMonthStart(parseMonthKey(month));
        const monthRecord = await db.monthRecord.findFirst({
          where: { userId, month: monthStart },
          select: { id: true },
        });
        if (!monthRecord) {
          return { error: "The month is not set up yet." };
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
        "Updates the user's UI/agent language. Call when the user explicitly asks to switch language (e.g. 'speak English', 'switch to Spanish', 'use Spanish for replies'). After this tool runs, the agent's NEXT reply MUST already be in the new locale, with a short acknowledgement.",
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
        "Sets the user's primary currency (ISO 4217, e.g. USD/ARS/EUR). " +
        "ALL the math (totals, balance, income) is reported in this currency; " +
        "individual expenses can be in another one and are converted automatically. " +
        "Call it ONLY when the user confirms their primary currency (explicit text or response to your onboarding question). " +
        "Also sets `primaryCurrencyConfirmedAt` so we don't ask again.",
      inputSchema: z.object({
        currency: currencySchema.describe(
          "3-letter ISO 4217 code, uppercase (USD, ARS, EUR, BRL, …).",
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
            "Existing lines keep their original exchange rate; only new totals change.",
        };
      },
    }),

    getFxRate: tool({
      description:
        "Queries the current exchange rate `1 from = X to`. If `to` is omitted, we use the user's primary currency. " +
        "Useful to preview conversions before entering an expense, or when the user asks 'what's USD/ARS at?'. " +
        "The rate is cached for 1h. If the source doesn't respond, we return `error` and it's best to ask the user for a manual rate " +
        "to use as `fxRate` in addMonthLine/updateMonthLine.",
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
          if (!user) return { error: "User not found." };
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
              error: `Couldn't fetch the exchange rate ${error.from}->${error.to}. Ask the user for a manual rate.`,
            };
          }
          throw error;
        }
      },
    }),

    updateExpenseImportInstructions: tool({
      description:
        "Stores on the user's account persistent instructions for imports (CSV, photos), categories, and how to mark lines (e.g. paid on import). Use it when they ask to remember something permanently ('save that…', 'from now on…', 'I don't want to have to repeat…'). If they're only adding a new rule without deleting the rest, use mode=append (the current text is in the system prompt as the \"Personal instructions\" block). If they're rewriting the whole block, mode=replace. After the tool, confirm in one sentence what was saved.",
      inputSchema: z.object({
        mode: z
          .enum(["replace", "append"])
          .describe(
            "append: appends below what's already saved. replace: replaces entirely.",
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
            error: `The text exceeds the ${MAX_EXPENSE_IMPORT_INSTRUCTIONS_CHARS}-character maximum. Ask the user to shorten it or delete old rules from Settings.`,
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
        "Renders a chart embedded in the chat. Use it when a visual helps (income vs expenses, distribution by category/bank, monthly evolution).",
        "ALWAYS call it after fetching data with other tools (getMonthState, listExpenseTemplates, etc.). Do NOT make up numbers.",
        "Types: 'bar' (compare magnitudes; supports stacked or horizontal), 'pie' (distribution, 2-8 segments), 'line' (time series), 'area' (line with fill; supports stacked).",
        "For bar/line/area: pass 'xValues' (X-axis labels) and 'series' (each with label + values aligned 1:1 with xValues).",
        "For pie: pass 'slices' (each with name + value, no negatives).",
        "Keep 'title' short. If the numbers are user amounts, set 'currency' (e.g. 'USD' or 'ARS').",
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
