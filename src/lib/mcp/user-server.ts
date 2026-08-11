import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  EventAttributionMode,
  EventStatus,
  ExpenseCategory,
  IncomeCategory,
  Prisma,
  SavingsMovementKind,
} from "@prisma/client";
import { z } from "zod";

import { db } from "@/lib/db";
import {
  isUniqueViolation,
  parseIsoDate,
  todayUtcDate,
} from "@/lib/expense-line";
import {
  formatMonthKey,
  getCurrentMonthKey,
  parseMonthKey,
  toMonthStart,
} from "@/lib/months";
import {
  attachLineToEvent,
  closeEvent as closeEventService,
  createEvent as createEventService,
  detachLineFromEvent,
  getActiveEventsAt,
  getEvent as getEventService,
  listEvents as listEventsService,
  reopenEvent as reopenEventService,
} from "@/lib/events";
import {
  deleteSavingsMovement as deleteSavingsMovementService,
  getSavingsState,
  recordSavingsMovement,
  setMonthlySavingsContribution as setMonthlySavingsContributionService,
} from "@/lib/savings";
import { expireYearTimeline, getYearTimelineData } from "@/lib/year-timeline-data";
import {
  expenseCategoryOptions,
  incomeCategoryOptions,
} from "@/lib/validators";
import { registerClaraSavingsSummaryTool } from "@/lib/mcp/savings-summary-tool";

const monthKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Mes inválido. Usá yyyy-MM (ej. 2026-04).");

const categorySchema = z.enum(expenseCategoryOptions);
const incomeCategorySchema = z.enum(incomeCategoryOptions);

function toMoney(value: number | string): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value);
  if (decimal.isNegative() || decimal.isZero()) {
    throw new Error("El monto tiene que ser mayor a 0.");
  }
  return decimal;
}

function fmt(n: number) {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function jsonContent(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errContent(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true as const,
  };
}

/**
 * Pull the authenticated user id off the per-request `extra.authInfo` set by
 * `withMcpAuth`. Returns `null` when the token verifier hasn't populated it
 * (which should be impossible if the route handler is wrapped correctly).
 */
function getUserIdFromExtra(extra: { authInfo?: { extra?: Record<string, unknown> } }) {
  const userId = extra.authInfo?.extra?.userId;
  return typeof userId === "string" && userId.length > 0 ? userId : null;
}

/**
 * Wires a user-scoped MCP server. Every tool reads `userId` from the
 * per-request `authInfo` set by the bearer-token verifier in the route
 * handler — we never trust client-supplied ids.
 */
export function registerUserMcp(server: McpServer): void {
  // ── Resources ───────────────────────────────────────────────────────────

  server.registerResource(
    "profile",
    "ada://user/profile",
    {
      title: "Perfil del usuario",
      description: "Datos de la cuenta: email, ingreso mensual, instrucciones para el agente.",
      mimeType: "application/json",
    },
    async (uri, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) {
        return {
          contents: [
            { uri: uri.href, mimeType: "text/plain", text: "Unauthorized." },
          ],
        };
      }
      const user = await db.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          monthlyIncome: true,
          primaryCurrency: true,
          expenseImportInstructions: true,
          createdAt: true,
        },
      });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                id: user?.id,
                email: user?.email,
                monthlyIncome: user ? Number(user.monthlyIncome) : null,
                primaryCurrency: user?.primaryCurrency ?? null,
                expenseImportInstructions: user?.expenseImportInstructions ?? null,
                createdAt: user?.createdAt?.toISOString() ?? null,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerResource(
    "banks",
    "ada://user/banks",
    {
      title: "Bancos del usuario",
      description: "Lista de bancos/cuentas registrados por el usuario.",
      mimeType: "application/json",
    },
    async (uri, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) {
        return {
          contents: [
            { uri: uri.href, mimeType: "text/plain", text: "Unauthorized." },
          ],
        };
      }
      const banks = await db.bank.findMany({
        where: { userId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, color: true, createdAt: true },
      });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(banks, null, 2),
          },
        ],
      };
    },
  );

  server.registerResource(
    "incomes",
    "ada://user/incomes",
    {
      title: "Plantillas de ingreso",
      description:
        "Plantillas (Income) recurrentes y puntuales del usuario: sueldos, alquileres cobrados, freelance fijo, etc.",
      mimeType: "application/json",
    },
    async (uri, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) {
        return {
          contents: [
            { uri: uri.href, mimeType: "text/plain", text: "Unauthorized." },
          ],
        };
      }
      const incomes = await db.income.findMany({
        where: { userId },
        orderBy: [{ isRecurring: "desc" }, { name: "asc" }],
        include: { bank: { select: { id: true, name: true } } },
      });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              incomes.map((i) => ({
                id: i.id,
                name: i.name,
                amount: Number(i.amount),
                currency: i.currency,
                category: i.category,
                isRecurring: i.isRecurring,
                startMonth: formatMonthKey(i.startMonth),
                endMonth: i.endMonth ? formatMonthKey(i.endMonth) : null,
                bank: i.bank,
              })),
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── Tools: read ─────────────────────────────────────────────────────────

  server.registerTool(
    "getProfile",
    {
      title: "Obtener perfil",
      description: "Devuelve email, ingreso mensual y reglas del usuario.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const user = await db.user.findUnique({
        where: { id: userId },
        select: {
          email: true,
          monthlyIncome: true,
          primaryCurrency: true,
          expenseImportInstructions: true,
        },
      });
      if (!user) return errContent("Usuario no encontrado.");
      return jsonContent({
        email: user.email,
        monthlyIncome: Number(user.monthlyIncome),
        primaryCurrency: user.primaryCurrency,
        expenseImportInstructions: user.expenseImportInstructions,
      });
    },
  );

  server.registerTool(
    "listBanks",
    {
      title: "Listar bancos",
      description: "Devuelve todos los bancos del usuario.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const banks = await db.bank.findMany({
        where: { userId },
        orderBy: { name: "asc" },
      });
      return jsonContent(
        banks.map((b) => ({
          id: b.id,
          name: b.name,
          color: b.color,
          createdAt: b.createdAt.toISOString(),
        })),
      );
    },
  );

  server.registerTool(
    "listExpenseTemplates",
    {
      title: "Listar plantillas de gasto",
      description:
        "Plantillas (Expense) recurrentes y puntuales que definen el catálogo de gastos.",
      inputSchema: {
        bankId: z.string().optional(),
      },
    },
    async ({ bankId }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const templates = await db.expense.findMany({
        where: { userId, ...(bankId ? { bankId } : {}) },
        include: { bank: { select: { name: true } } },
        orderBy: [{ isRecurring: "desc" }, { name: "asc" }],
      });
      return jsonContent(
        templates.map((t) => ({
          id: t.id,
          name: t.name,
          amount: Number(t.amount),
          category: t.category,
          isRecurring: t.isRecurring,
          startMonth: formatMonthKey(t.startMonth),
          endMonth: t.endMonth ? formatMonthKey(t.endMonth) : null,
          bankId: t.bankId,
          bankName: t.bank.name,
        })),
      );
    },
  );

  server.registerTool(
    "listMonths",
    {
      title: "Listar meses",
      description:
        "Devuelve los últimos N meses con bucket creado, con balance, ingreso recibido (sum de líneas con `received=true`), ingreso previsto (todas las líneas) y total de gastos.",
      inputSchema: {
        limit: z.number().int().min(1).max(36).default(12),
      },
    },
    async ({ limit }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const records = await db.monthRecord.findMany({
        where: { userId },
        orderBy: { month: "desc" },
        take: limit,
        include: {
          lines: { select: { amountConverted: true, paid: true } },
          incomeLines: {
            select: { amountConverted: true, received: true },
          },
        },
      });
      const result = records.map((r) => {
        const total = r.lines.reduce(
          (s, l) => s + Number(l.amountConverted),
          0,
        );
        const paid = r.lines
          .filter((l) => l.paid)
          .reduce((s, l) => s + Number(l.amountConverted), 0);
        const incomeReceived = r.incomeLines
          .filter((l) => l.received)
          .reduce((s, l) => s + Number(l.amountConverted), 0);
        const incomeExpected = r.incomeLines.reduce(
          (s, l) => s + Number(l.amountConverted),
          0,
        );
        return {
          month: formatMonthKey(r.month),
          income: incomeReceived,
          incomeExpected,
          totalExpense: total,
          paidExpense: paid,
          remainingExpense: total - paid,
          balance: incomeReceived - total,
          lineCount: r.lines.length,
          incomeLineCount: r.incomeLines.length,
        };
      });
      return jsonContent(result);
    },
  );

  server.registerTool(
    "getMonth",
    {
      title: "Detalle de un mes",
      description:
        "Devuelve líneas de gasto, líneas de ingreso, balance e ingresos del mes indicado (yyyy-MM). El balance usa solo ingresos `received=true`.",
      inputSchema: {
        month: monthKeySchema,
      },
    },
    async ({ month }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const start = toMonthStart(parseMonthKey(month));
      const record = await db.monthRecord.findFirst({
        where: { userId, month: start },
        include: {
          lines: {
            include: { bank: { select: { name: true, color: true } } },
            orderBy: [{ paid: "asc" }, { name: "asc" }],
          },
          incomeLines: {
            include: { bank: { select: { name: true, color: true } } },
            orderBy: [{ received: "asc" }, { name: "asc" }],
          },
        },
      });
      if (!record) {
        return errContent(
          `El mes ${month} no está creado todavía. Usá el dashboard web para crear el bucket o pedí que se genere desde plantillas.`,
        );
      }
      const total = record.lines.reduce(
        (s, l) => s + Number(l.amountConverted),
        0,
      );
      const paid = record.lines
        .filter((l) => l.paid)
        .reduce((s, l) => s + Number(l.amountConverted), 0);
      const incomeReceived = record.incomeLines
        .filter((l) => l.received)
        .reduce((s, l) => s + Number(l.amountConverted), 0);
      const incomeExpected = record.incomeLines.reduce(
        (s, l) => s + Number(l.amountConverted),
        0,
      );
      return jsonContent({
        month,
        income: incomeReceived,
        incomeExpected,
        totalExpense: total,
        paidExpense: paid,
        remainingExpense: total - paid,
        balance: incomeReceived - total,
        lines: record.lines.map((l) => ({
          id: l.id,
          name: l.name,
          amount: Number(l.amount),
          amountConverted: Number(l.amountConverted),
          currency: l.currency,
          category: l.category,
          paid: l.paid,
          bankId: l.bankId,
          bankName: l.bank.name,
          templateId: l.templateId,
        })),
        incomeLines: record.incomeLines.map((l) => ({
          id: l.id,
          name: l.name,
          amount: Number(l.amount),
          amountConverted: Number(l.amountConverted),
          currency: l.currency,
          category: l.category,
          received: l.received,
          bankId: l.bankId,
          bankName: l.bank?.name ?? null,
          templateId: l.templateId,
          occurredOn: l.occurredOn.toISOString().slice(0, 10),
        })),
      });
    },
  );

  server.registerTool(
    "getCurrentBalance",
    {
      title: "Balance del mes en curso",
      description:
        "Atajo para `getMonth` con el mes calendario actual (UTC). Útil para responder “cuánto me queda este mes”.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const month = getCurrentMonthKey();
      const start = toMonthStart(parseMonthKey(month));
      const record = await db.monthRecord.findFirst({
        where: { userId, month: start },
        include: {
          lines: { select: { amountConverted: true, paid: true } },
          incomeLines: { select: { amountConverted: true, received: true } },
        },
      });
      if (!record) {
        return jsonContent({
          month,
          message: "El mes actual no tiene bucket creado.",
          income: null,
          totalExpense: null,
          balance: null,
        });
      }
      const total = record.lines.reduce(
        (s, l) => s + Number(l.amountConverted),
        0,
      );
      const paid = record.lines
        .filter((l) => l.paid)
        .reduce((s, l) => s + Number(l.amountConverted), 0);
      const income = record.incomeLines
        .filter((l) => l.received)
        .reduce((s, l) => s + Number(l.amountConverted), 0);
      return jsonContent({
        month,
        income,
        totalExpense: total,
        paidExpense: paid,
        remainingExpense: total - paid,
        balance: income - total,
        message: `Te quedan $${fmt(income - total)} de ${fmt(income)} de ingreso.`,
      });
    },
  );

  server.registerTool(
    "getYearTimeline",
    {
      title: "Timeline anual",
      description:
        "Devuelve los 12 meses del año pedido con income, total y balance por mes.",
      inputSchema: {
        year: z.number().int().min(1970).max(2100),
      },
    },
    async ({ year }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const data = await getYearTimelineData(userId, year);
      return jsonContent(data);
    },
  );

  // ── Tools: write ────────────────────────────────────────────────────────

  server.registerTool(
    "addExpenseTemplate",
    {
      title: "Crear plantilla de gasto",
      description:
        "Crea una plantilla (Expense). Si `isRecurring` es true, la plantilla se proyecta a cada mes nuevo. Si es false, aplica solo al mes en `startMonth`.",
      inputSchema: {
        name: z.string().min(1).max(120),
        amount: z.number().positive(),
        bankId: z.string().min(1),
        category: categorySchema.default("OTROS"),
        isRecurring: z.boolean().default(true),
        startMonth: monthKeySchema,
        endMonth: monthKeySchema.optional(),
      },
    },
    async (
      { name, amount, bankId, category, isRecurring, startMonth, endMonth },
      extra,
    ) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const bank = await db.bank.findFirst({ where: { id: bankId, userId } });
      if (!bank) return errContent("Banco no encontrado.");
      if (!isRecurring && endMonth) {
        return errContent("Los gastos puntuales no pueden tener endMonth.");
      }
      if (endMonth && endMonth < startMonth) {
        return errContent("endMonth tiene que ser >= startMonth.");
      }
      const created = await db.expense.create({
        data: {
          userId,
          bankId,
          name,
          amount: toMoney(amount),
          category: category as ExpenseCategory,
          isRecurring,
          startMonth: toMonthStart(parseMonthKey(startMonth)),
          endMonth: endMonth ? toMonthStart(parseMonthKey(endMonth)) : null,
        },
      });
      return jsonContent({
        ok: true,
        id: created.id,
        message: `Plantilla "${name}" creada. Aplica desde ${startMonth}${endMonth ? ` hasta ${endMonth}` : isRecurring ? " en adelante" : " (solo ese mes)"}.`,
      });
    },
  );

  server.registerTool(
    "addExpenseToMonth",
    {
      title: "Agregar gasto a un mes",
      description:
        "Agrega una línea de gasto al mes indicado (sin crear plantilla). Útil para gastos puntuales que no se repiten.",
      inputSchema: {
        month: monthKeySchema,
        bankId: z.string().min(1),
        name: z.string().min(1).max(120),
        amount: z.number().positive(),
        category: categorySchema.default("OTROS"),
        paid: z.boolean().default(false),
        occurredOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Fecha en formato yyyy-MM-dd.")
          .optional(),
      },
    },
    async ({ month, bankId, name, amount, category, paid, occurredOn }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const start = toMonthStart(parseMonthKey(month));
      const [bank, monthRecord, user] = await Promise.all([
        db.bank.findFirst({ where: { id: bankId, userId } }),
        db.monthRecord.findFirst({ where: { userId, month: start } }),
        db.user.findUnique({ where: { id: userId }, select: { primaryCurrency: true } }),
      ]);
      if (!bank) return errContent("Banco no encontrado.");
      if (!monthRecord) {
        return errContent(
          `El mes ${month} no tiene bucket. Creá el mes desde el dashboard web primero.`,
        );
      }
      const primaryCurrency = user?.primaryCurrency ?? "USD";
      const moneyAmount = toMoney(amount);
      const occurredOnDate = parseIsoDate(occurredOn) ?? todayUtcDate();
      let line;
      try {
        line = await db.monthExpenseLine.create({
          data: {
            userId,
            monthRecordId: monthRecord.id,
            bankId,
            name,
            occurredOn: occurredOnDate,
            amount: moneyAmount,
            currency: primaryCurrency,
            fxRate: toMoney(1),
            amountConverted: moneyAmount,
            category: category as ExpenseCategory,
            paid,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return jsonContent({
            ok: true,
            duplicate: true,
            message: `Ya existía un gasto idéntico ("${name}", $${fmt(amount)}) en esa fecha; no lo dupliqué.`,
          });
        }
        throw error;
      }
      const year = start.getUTCFullYear();
      await expireYearTimeline(userId, year);
      return jsonContent({
        ok: true,
        duplicate: false,
        id: line.id,
        message: `Agregué "${name}" por $${fmt(amount)} a ${month}.`,
      });
    },
  );

  server.registerTool(
    "markLinePaid",
    {
      title: "Marcar línea como pagada",
      description:
        "Pone una línea de gasto del mes en pagado/no pagado. Devuelve el balance actualizado.",
      inputSchema: {
        lineId: z.string().min(1),
        paid: z.boolean(),
      },
    },
    async ({ lineId, paid }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const line = await db.monthExpenseLine.findUnique({
        where: { id: lineId },
        include: { monthRecord: { select: { userId: true, month: true } } },
      });
      if (!line || line.monthRecord.userId !== userId) {
        return errContent("Línea no encontrada.");
      }
      await db.monthExpenseLine.update({
        where: { id: lineId },
        data: { paid },
      });
      await expireYearTimeline(userId, line.monthRecord.month.getUTCFullYear());
      return jsonContent({
        ok: true,
        lineId,
        paid,
        message: paid
          ? `Marqué "${line.name}" como pagado.`
          : `"${line.name}" vuelve a estar pendiente.`,
      });
    },
  );

  server.registerTool(
    "deleteLine",
    {
      title: "Eliminar línea del mes",
      description:
        "Borra una línea de gasto de un mes específico. No toca la plantilla original. " +
        "Tool destructivo: requiere `confirm: true` después de que el humano confirme. " +
        "Cliente AI: leé la línea con getMonth, mostrale al usuario qué se va a borrar y solo pasá `confirm: true` cuando responda explícitamente que sí.",
      inputSchema: {
        lineId: z.string().min(1),
        confirm: z
          .literal(true)
          .describe(
            "Must be true after explicit human confirmation; otherwise the tool refuses.",
          ),
      },
    },
    async ({ lineId, confirm }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      if (confirm !== true) {
        return errContent(
          "deleteLine refused: pass confirm=true after explicit human confirmation.",
        );
      }
      const line = await db.monthExpenseLine.findUnique({
        where: { id: lineId },
        include: { monthRecord: { select: { userId: true, month: true } } },
      });
      if (!line || line.monthRecord.userId !== userId) {
        return errContent("Línea no encontrada.");
      }
      await db.monthExpenseLine.delete({ where: { id: lineId } });
      await expireYearTimeline(userId, line.monthRecord.month.getUTCFullYear());
      return jsonContent({
        ok: true,
        message: `Eliminé "${line.name}".`,
      });
    },
  );

  server.registerTool(
    "createBank",
    {
      title: "Crear banco",
      description: "Registra un nuevo banco/cuenta para el usuario.",
      inputSchema: {
        name: z.string().min(1).max(80),
        color: z
          .string()
          .regex(/^#?[0-9a-fA-F]{6}$/u)
          .optional(),
      },
    },
    async ({ name, color }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const existing = await db.bank.findFirst({ where: { userId, name } });
      if (existing) {
        return errContent(`Ya tenés un banco llamado "${name}".`);
      }
      const bank = await db.bank.create({
        data: { userId, name, color: color ?? null },
      });
      return jsonContent({ ok: true, id: bank.id, name: bank.name });
    },
  );

  // ── Tools: ahorros ──────────────────────────────────────────────────────

  server.registerTool(
    "getSavings",
    {
      title: "Estado de la pila de ahorros",
      description:
        "Devuelve el balance global de ahorros del usuario y los últimos N movimientos del ledger (default 20, máx 100). Cada movimiento incluye `kind` (MONTHLY_CONTRIBUTION, CARRYOVER_DEPOSIT, DEBT_COVERAGE, MANUAL_DEPOSIT, MANUAL_WITHDRAWAL), monto firmado (positivo entra, negativo sale), `monthKey` cuando aplica, fecha y nota.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
      },
    },
    async ({ limit }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const state = await getSavingsState(userId, { limit: limit ?? 20 });
      return jsonContent(state);
    },
  );

  server.registerTool(
    "addSavingsMovement",
    {
      title: "Agregar movimiento manual de ahorro",
      description:
        "Registra un depósito (MANUAL_DEPOSIT) o retiro (MANUAL_WITHDRAWAL) ad-hoc en la pila. `amount` siempre positivo; el signo se aplica server-side. Para retiros valida que la pila alcance.",
      inputSchema: {
        kind: z.enum(["MANUAL_DEPOSIT", "MANUAL_WITHDRAWAL"]),
        amount: z.number().positive(),
        note: z.string().max(500).optional(),
        occurredOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Fecha en formato yyyy-MM-dd.")
          .optional(),
      },
    },
    async ({ kind, amount, note, occurredOn }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { primaryCurrency: true, savings: true },
      });
      if (!user) return errContent("Usuario no encontrado.");
      const magnitude = new Prisma.Decimal(amount.toFixed(2));
      if (kind === "MANUAL_WITHDRAWAL" && user.savings.lessThan(magnitude)) {
        return errContent(
          `La pila tiene ${user.primaryCurrency} ${fmt(Number(user.savings))} y no alcanza para retirar ${user.primaryCurrency} ${fmt(amount)}.`,
        );
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
      return jsonContent({
        ok: true,
        balance: result.balance,
        movement: {
          id: result.movement.id,
          kind: result.movement.kind,
          amount: Number(result.movement.amount),
          currency: result.movement.currency,
          note: result.movement.note,
          occurredOn: result.movement.occurredOn.toISOString().slice(0, 10),
        },
      });
    },
  );

  server.registerTool(
    "deleteSavingsMovement",
    {
      title: "Borrar movimiento manual de ahorro",
      description:
        "Borra un movimiento MANUAL_DEPOSIT o MANUAL_WITHDRAWAL del ledger y revierte su efecto sobre la pila. " +
        "Bloqueado para movimientos del sistema (MONTHLY_CONTRIBUTION, CARRYOVER_DEPOSIT, DEBT_COVERAGE): esos solo se deshacen rehaciendo la decisión del mes que los originó. " +
        "Tool destructivo: requiere `confirm: true` después de que el humano confirme.",
      inputSchema: {
        id: z.string().min(1),
        confirm: z
          .literal(true)
          .describe(
            "Must be true after explicit human confirmation; otherwise the tool refuses.",
          ),
      },
    },
    async ({ id, confirm }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      if (confirm !== true) {
        return errContent(
          "deleteSavingsMovement refused: pass confirm=true after explicit human confirmation.",
        );
      }
      const existing = await db.savingsMovement.findFirst({
        where: { id, userId },
        select: { id: true, kind: true },
      });
      if (!existing) return errContent("Movimiento no encontrado.");
      if (
        existing.kind !== SavingsMovementKind.MANUAL_DEPOSIT &&
        existing.kind !== SavingsMovementKind.MANUAL_WITHDRAWAL
      ) {
        return errContent(
          `Movimiento del sistema (${existing.kind}); no se puede borrar a mano.`,
        );
      }
      const result = await deleteSavingsMovementService(id, userId);
      if (!result.ok) return errContent("Movimiento no encontrado.");
      return jsonContent({ ok: true, balance: result.balance });
    },
  );

  // ── Tools: ingresos ─────────────────────────────────────────────────────

  server.registerTool(
    "listIncomeTemplates",
    {
      title: "Listar plantillas de ingreso",
      description:
        "Plantillas (Income) recurrentes y puntuales que definen el catálogo de ingresos del usuario.",
      inputSchema: {
        bankId: z.string().optional(),
      },
    },
    async ({ bankId }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const templates = await db.income.findMany({
        where: { userId, ...(bankId ? { bankId } : {}) },
        include: { bank: { select: { name: true } } },
        orderBy: [{ isRecurring: "desc" }, { name: "asc" }],
      });
      return jsonContent(
        templates.map((t) => ({
          id: t.id,
          name: t.name,
          amount: Number(t.amount),
          currency: t.currency,
          category: t.category,
          isRecurring: t.isRecurring,
          startMonth: formatMonthKey(t.startMonth),
          endMonth: t.endMonth ? formatMonthKey(t.endMonth) : null,
          bankId: t.bankId,
          bankName: t.bank?.name ?? null,
        })),
      );
    },
  );

  server.registerTool(
    "addIncomeTemplate",
    {
      title: "Crear plantilla de ingreso",
      description:
        "Crea una plantilla (Income). Si `isRecurring` es true, se proyecta a cada mes nuevo. Si es false, aplica solo al mes en `startMonth`. `bankId` es opcional.",
      inputSchema: {
        name: z.string().min(1).max(120),
        amount: z.number().positive(),
        bankId: z.string().min(1).optional(),
        category: incomeCategorySchema.default("OTROS"),
        currency: z
          .string()
          .regex(/^[A-Za-z]{3}$/u, "Currency must be a 3-letter ISO code.")
          .optional(),
        isRecurring: z.boolean().default(true),
        startMonth: monthKeySchema,
        endMonth: monthKeySchema.optional(),
      },
    },
    async (
      {
        name,
        amount,
        bankId,
        category,
        currency,
        isRecurring,
        startMonth,
        endMonth,
      },
      extra,
    ) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      if (bankId) {
        const bank = await db.bank.findFirst({ where: { id: bankId, userId } });
        if (!bank) return errContent("Banco no encontrado.");
      }
      if (!isRecurring && endMonth) {
        return errContent("Los ingresos puntuales no pueden tener endMonth.");
      }
      if (endMonth && endMonth < startMonth) {
        return errContent("endMonth tiene que ser >= startMonth.");
      }
      const user = await db.user.findUnique({
        where: { id: userId },
        select: { primaryCurrency: true },
      });
      if (!user) return errContent("Usuario no encontrado.");
      const created = await db.income.create({
        data: {
          userId,
          bankId: bankId ?? null,
          name,
          amount: toMoney(amount),
          currency: (currency ?? user.primaryCurrency).toUpperCase(),
          category: category as IncomeCategory,
          isRecurring,
          startMonth: toMonthStart(parseMonthKey(startMonth)),
          endMonth: endMonth ? toMonthStart(parseMonthKey(endMonth)) : null,
        },
      });
      return jsonContent({
        ok: true,
        id: created.id,
        message: `Plantilla de ingreso "${name}" creada. Aplica desde ${startMonth}${endMonth ? ` hasta ${endMonth}` : isRecurring ? " en adelante" : " (solo ese mes)"}.`,
      });
    },
  );

  server.registerTool(
    "addIncomeToMonth",
    {
      title: "Agregar cobro a un mes",
      description:
        "Agrega una línea de ingreso al mes indicado (sin crear plantilla). Útil para cobros puntuales (freelance, bonos, regalos). `bankId` es opcional. Por defecto `received=false` (previsto); el usuario lo confirma cuando entra la plata.",
      inputSchema: {
        month: monthKeySchema,
        bankId: z.string().min(1).optional(),
        name: z.string().min(1).max(120),
        amount: z.number().positive(),
        category: incomeCategorySchema.default("OTROS"),
        received: z.boolean().default(false),
        occurredOn: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Fecha en formato yyyy-MM-dd.")
          .optional(),
      },
    },
    async (
      { month, bankId, name, amount, category, received, occurredOn },
      extra,
    ) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const start = toMonthStart(parseMonthKey(month));
      const [bank, monthRecord, user] = await Promise.all([
        bankId
          ? db.bank.findFirst({ where: { id: bankId, userId } })
          : Promise.resolve(null),
        db.monthRecord.findFirst({ where: { userId, month: start } }),
        db.user.findUnique({
          where: { id: userId },
          select: { primaryCurrency: true },
        }),
      ]);
      if (bankId && !bank) return errContent("Banco no encontrado.");
      if (!monthRecord) {
        return errContent(
          `El mes ${month} no tiene bucket. Creá el mes desde el dashboard web primero.`,
        );
      }
      const primaryCurrency = user?.primaryCurrency ?? "USD";
      const moneyAmount = toMoney(amount);
      const occurredOnDate = parseIsoDate(occurredOn) ?? todayUtcDate();
      let line;
      try {
        line = await db.monthIncomeLine.create({
          data: {
            userId,
            monthRecordId: monthRecord.id,
            bankId: bankId ?? null,
            name,
            occurredOn: occurredOnDate,
            amount: moneyAmount,
            currency: primaryCurrency,
            fxRate: toMoney(1),
            amountConverted: moneyAmount,
            category: category as IncomeCategory,
            received,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return jsonContent({
            ok: true,
            duplicate: true,
            message: `Ya existía un cobro idéntico ("${name}", $${fmt(amount)}) en esa fecha; no lo dupliqué.`,
          });
        }
        throw error;
      }
      const year = start.getUTCFullYear();
      await expireYearTimeline(userId, year);
      return jsonContent({
        ok: true,
        duplicate: false,
        id: line.id,
        message: `Agregué cobro "${name}" por $${fmt(amount)} a ${month}.`,
      });
    },
  );

  server.registerTool(
    "markIncomeReceived",
    {
      title: "Marcar cobro como recibido",
      description:
        "Pone una línea de ingreso del mes como recibida/no recibida. El balance del mes solo cuenta las recibidas.",
      inputSchema: {
        lineId: z.string().min(1),
        received: z.boolean(),
      },
    },
    async ({ lineId, received }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const line = await db.monthIncomeLine.findUnique({
        where: { id: lineId },
        include: { monthRecord: { select: { userId: true, month: true } } },
      });
      if (!line || line.monthRecord.userId !== userId) {
        return errContent("Línea de ingreso no encontrada.");
      }
      await db.monthIncomeLine.update({
        where: { id: lineId },
        data: { received },
      });
      await expireYearTimeline(userId, line.monthRecord.month.getUTCFullYear());
      return jsonContent({
        ok: true,
        lineId,
        received,
        message: received
          ? `Marqué "${line.name}" como recibido.`
          : `"${line.name}" vuelve a estar como previsto.`,
      });
    },
  );

  server.registerTool(
    "deleteIncomeLine",
    {
      title: "Eliminar línea de ingreso",
      description:
        "Borra una línea de ingreso (`MonthIncomeLine`) de un mes específico. No toca la plantilla original. " +
        "Tool destructivo: requiere `confirm: true` después de que el humano confirme.",
      inputSchema: {
        lineId: z.string().min(1),
        confirm: z
          .literal(true)
          .describe(
            "Must be true after explicit human confirmation; otherwise the tool refuses.",
          ),
      },
    },
    async ({ lineId, confirm }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      if (confirm !== true) {
        return errContent(
          "deleteIncomeLine refused: pass confirm=true after explicit human confirmation.",
        );
      }
      const line = await db.monthIncomeLine.findUnique({
        where: { id: lineId },
        include: { monthRecord: { select: { userId: true, month: true } } },
      });
      if (!line || line.monthRecord.userId !== userId) {
        return errContent("Línea de ingreso no encontrada.");
      }
      await db.monthIncomeLine.delete({ where: { id: lineId } });
      await expireYearTimeline(userId, line.monthRecord.month.getUTCFullYear());
      return jsonContent({
        ok: true,
        message: `Eliminé "${line.name}".`,
      });
    },
  );

  server.registerTool(
    "setMonthlySavingsContribution",
    {
      title: "Aporte mensual a ahorro (informativo)",
      description:
        "Upsert del aporte mensual del usuario para un mes (yyyy-MM). Suma a la pila pero NO descuenta del balance del mes ni aparece como gasto. Hay un solo aporte por mes; si ya existía, se reemplaza.",
      inputSchema: {
        month: monthKeySchema,
        amount: z.number().positive(),
        note: z.string().max(500).optional(),
      },
    },
    async ({ month, amount, note }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
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
      if (!user) return errContent("Usuario no encontrado.");
      if (!monthRecord) {
        return errContent(
          `El mes ${month} no tiene bucket. Creá el mes desde el dashboard primero.`,
        );
      }
      const result = await setMonthlySavingsContributionService({
        userId,
        monthRecordId: monthRecord.id,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        currency: user.primaryCurrency,
        note: note ?? null,
        occurredOn: monthStart,
      });
      return jsonContent({
        ok: true,
        replaced: result.replaced,
        balance: result.balance,
        month,
        amount: Number(result.movement.amount),
      });
    },
  );

  // ── Tools: billeteras de evento ────────────────────────────────────────

  server.registerTool(
    "listEvents",
    {
      title: "Listar billeteras de evento",
      description:
        "Lista las billeteras de evento del usuario (viajes, eventos puntuales). Pasá `status: 'OPEN'` para ver solo las activas. " +
        "Cada evento incluye totales (totalConverted, lineCount), rango de fechas, modo de atribución y el mes destino si está cerrado.",
      inputSchema: {
        status: z.enum(["OPEN", "CLOSED"]).optional(),
      },
    },
    async ({ status }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const events = await listEventsService(
        userId,
        status === "OPEN"
          ? { status: EventStatus.OPEN }
          : status === "CLOSED"
            ? { status: EventStatus.CLOSED }
            : {},
      );
      return jsonContent({ events });
    },
  );

  server.registerTool(
    "getActiveEvents",
    {
      title: "Eventos activos en una fecha",
      description:
        "Devuelve los eventos OPEN cuyo rango contiene `on` (default = hoy, UTC). Útil antes de cargar un gasto para detectar si pertenece a un viaje en curso.",
      inputSchema: {
        on: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/u, "Fecha en formato yyyy-MM-dd.")
          .optional(),
      },
    },
    async ({ on }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const date = parseIsoDate(on) ?? todayUtcDate();
      const events = await getActiveEventsAt(userId, date);
      return jsonContent({
        on: date.toISOString().slice(0, 10),
        events,
      });
    },
  );

  server.registerTool(
    "getEvent",
    {
      title: "Ver una billetera de evento",
      description:
        "Devuelve totales y metadatos de una billetera específica (totalConverted, lineCount, rango, status, attributionMode/Month).",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const event = await getEventService(userId, id);
      if (!event) return errContent("Evento no encontrado.");
      return jsonContent({ event });
    },
  );

  server.registerTool(
    "createEvent",
    {
      title: "Crear billetera de evento",
      description:
        "Crea una billetera para un viaje / evento con un rango de fechas. " +
        "`attributionMode` default = 'LUMP_SUM' (al cerrar se imputan todos los gastos a un único mes); usá 'BY_DATE' si querés que cada gasto quede en su mes real.",
      inputSchema: {
        name: z.string().min(1).max(120),
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).optional(),
        color: z.string().regex(/^#?[0-9a-fA-F]{6}$/u).optional(),
        attributionMode: z.enum(["BY_DATE", "LUMP_SUM"]).optional(),
      },
    },
    async ({ name, startDate, endDate, color, attributionMode }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      const start = parseIsoDate(startDate);
      if (!start) return errContent("startDate inválido (yyyy-MM-dd).");
      const end = endDate ? parseIsoDate(endDate) : null;
      if (endDate && !end) return errContent("endDate inválido (yyyy-MM-dd).");
      try {
        const event = await createEventService({
          userId,
          name,
          startDate: start,
          endDate: end ?? null,
          color: color ?? null,
          attributionMode:
            attributionMode === "BY_DATE"
              ? EventAttributionMode.BY_DATE
              : EventAttributionMode.LUMP_SUM,
        });
        return jsonContent({ ok: true, event });
      } catch (error) {
        if (error instanceof Error && error.message === "EVENT_INVALID_RANGE") {
          return errContent("endDate debe ser posterior a startDate.");
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "closeEvent",
    {
      title: "Cerrar billetera de evento",
      description:
        "Cierra una billetera. Para LUMP_SUM, mueve TODAS las líneas al mes destino en una sola transacción (preserva occurredOn). " +
        "Tool destructivo (mueve líneas entre meses): requiere `confirm: true` después de la confirmación humana.",
      inputSchema: {
        id: z.string().min(1),
        attributionMode: z.enum(["BY_DATE", "LUMP_SUM"]),
        attributionMonth: monthKeySchema.optional(),
        confirm: z
          .literal(true)
          .describe(
            "Must be true after explicit human confirmation; otherwise the tool refuses.",
          ),
      },
    },
    async ({ id, attributionMode, attributionMonth, confirm }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      if (confirm !== true) {
        return errContent(
          "closeEvent refused: pass confirm=true after explicit human confirmation.",
        );
      }
      if (attributionMode === "LUMP_SUM" && !attributionMonth) {
        return errContent(
          "attributionMonth (yyyy-MM) es obligatorio para LUMP_SUM.",
        );
      }
      try {
        const event = await closeEventService({
          userId,
          eventId: id,
          mode:
            attributionMode === "LUMP_SUM"
              ? EventAttributionMode.LUMP_SUM
              : EventAttributionMode.BY_DATE,
          attributionMonth: attributionMonth ?? null,
        });
        if (!event) return errContent("Evento no encontrado.");
        return jsonContent({ ok: true, event });
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "EVENT_ALREADY_CLOSED") {
            return errContent("El evento ya está cerrado.");
          }
          if (error.message === "EVENT_MISSING_ATTRIBUTION_MONTH") {
            return errContent(
              "attributionMonth (yyyy-MM) es obligatorio para LUMP_SUM.",
            );
          }
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "reopenEvent",
    {
      title: "Reabrir billetera de evento",
      description:
        "Reabre una billetera cerrada. Si estaba en LUMP_SUM, vuelve a poner cada línea en el mes que corresponde a su `occurredOn`.",
      inputSchema: { id: z.string().min(1) },
    },
    async ({ id }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      try {
        const event = await reopenEventService({ userId, eventId: id });
        if (!event) return errContent("Evento no encontrado.");
        return jsonContent({ ok: true, event });
      } catch (error) {
        if (error instanceof Error && error.message === "EVENT_NOT_CLOSED") {
          return errContent("El evento no está cerrado.");
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "attachExpenseToEvent",
    {
      title: "Sumar un gasto a una billetera de evento",
      description:
        "Engancha una `MonthExpenseLine` existente al evento. Si la fecha del gasto cae fuera del rango del viaje, " +
        "NO la asocia a menos que pases `confirmOutOfRange: true` (además de `confirm: true`) después de que el humano lo pida. " +
        "Tool de mutación: requiere `confirm: true`.",
      inputSchema: {
        eventId: z.string().min(1),
        lineId: z.string().min(1),
        confirm: z
          .literal(true)
          .describe(
            "Must be true after explicit human confirmation; otherwise the tool refuses.",
          ),
        confirmOutOfRange: z
          .boolean()
          .optional()
          .describe(
            "Required when the expense date is outside the event range — only after the human asked to attach it anyway (or extend the trip first).",
          ),
      },
    },
    async ({ eventId, lineId, confirm, confirmOutOfRange }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      if (confirm !== true) {
        return errContent(
          "attachExpenseToEvent refused: pass confirm=true after explicit human confirmation.",
        );
      }
      try {
        const result = await attachLineToEvent({
          userId,
          eventId,
          lineId,
          allowOutOfRange: confirmOutOfRange === true,
        });
        if (!result.ok) {
          if (result.needsConfirmation) {
            return errContent(
              "La fecha del gasto está fuera del rango del viaje. No se asoció. " +
                "Pedí confirmación humana y reintentá con confirmOutOfRange=true, o extendé endDate primero.",
            );
          }
          return errContent("Evento o línea no encontrados.");
        }
        return jsonContent({
          ok: true,
          outOfRange: result.outOfRange ?? false,
        });
      } catch (error) {
        if (error instanceof Error && error.message === "EVENT_CLOSED") {
          return errContent(
            "El evento está cerrado. Reabrilo antes de sumar gastos.",
          );
        }
        throw error;
      }
    },
  );

  server.registerTool(
    "detachExpenseFromEvent",
    {
      title: "Sacar un gasto de una billetera de evento",
      description:
        "Quita el `eventId` de una línea del mes. La línea queda como gasto suelto. Tool de mutación: requiere `confirm: true`.",
      inputSchema: {
        lineId: z.string().min(1),
        confirm: z
          .literal(true)
          .describe(
            "Must be true after explicit human confirmation; otherwise the tool refuses.",
          ),
      },
    },
    async ({ lineId, confirm }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
      if (confirm !== true) {
        return errContent(
          "detachExpenseFromEvent refused: pass confirm=true after explicit human confirmation.",
        );
      }
      const result = await detachLineFromEvent({ userId, lineId });
      if (!result.ok) return errContent("Línea no encontrada.");
      return jsonContent({ ok: true });
    },
  );

  registerClaraSavingsSummaryTool(server);
}
