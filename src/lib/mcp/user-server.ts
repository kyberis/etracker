import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ExpenseCategory, Prisma } from "@prisma/client";
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
import { expireYearTimeline, getYearTimelineData } from "@/lib/year-timeline-data";
import { expenseCategoryOptions } from "@/lib/validators";

const monthKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}$/, "Mes inválido. Usá yyyy-MM (ej. 2026-04).");

const categorySchema = z.enum(expenseCategoryOptions);

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
        "Devuelve los últimos N meses con bucket creado, con balance, ingresos y total de gastos.",
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
        include: { lines: { select: { amount: true, paid: true } } },
      });
      const result = records.map((r) => {
        const total = r.lines.reduce((s, l) => s + Number(l.amount), 0);
        const paid = r.lines
          .filter((l) => l.paid)
          .reduce((s, l) => s + Number(l.amount), 0);
        const income = Number(r.income);
        return {
          month: formatMonthKey(r.month),
          income,
          totalExpense: total,
          paidExpense: paid,
          remainingExpense: total - paid,
          balance: income - total,
          lineCount: r.lines.length,
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
        "Devuelve líneas de gasto, balance e ingresos del mes indicado (yyyy-MM).",
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
        },
      });
      if (!record) {
        return errContent(
          `El mes ${month} no está creado todavía. Usá el dashboard web para crear el bucket o pedí que se genere desde plantillas.`,
        );
      }
      const total = record.lines.reduce((s, l) => s + Number(l.amount), 0);
      const paid = record.lines
        .filter((l) => l.paid)
        .reduce((s, l) => s + Number(l.amount), 0);
      const income = Number(record.income);
      return jsonContent({
        month,
        income,
        totalExpense: total,
        paidExpense: paid,
        remainingExpense: total - paid,
        balance: income - total,
        lines: record.lines.map((l) => ({
          id: l.id,
          name: l.name,
          amount: Number(l.amount),
          category: l.category,
          paid: l.paid,
          bankId: l.bankId,
          bankName: l.bank.name,
          templateId: l.templateId,
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
        include: { lines: { select: { amount: true, paid: true } } },
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
      const total = record.lines.reduce((s, l) => s + Number(l.amount), 0);
      const paid = record.lines
        .filter((l) => l.paid)
        .reduce((s, l) => s + Number(l.amount), 0);
      const income = Number(record.income);
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
        "Borra una línea de gasto de un mes específico. No toca la plantilla original.",
      inputSchema: {
        lineId: z.string().min(1),
      },
    },
    async ({ lineId }, extra) => {
      const userId = getUserIdFromExtra(extra);
      if (!userId) return errContent("Unauthorized.");
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
}
