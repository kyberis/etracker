import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

import { db } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { expenseAppliesToMonth, formatMonthKey, parseMonthKey, toMonthStart } from "@/lib/months";
import { getMonthlyIncomeModel } from "@/lib/monthly-income";
import { requireUserId } from "@/lib/session";
import { monthlyIncomeSchema } from "@/lib/validators";

export async function GET(_request: Request, context: { params: Promise<{ month: string }> }) {
  try {
    const userId = await requireUserId();
    const { month: monthKey } = await context.params;
    const month = parseMonthKey(monthKey);
    const monthlyIncomeModel = getMonthlyIncomeModel();

    const [user, monthIncome, banks, expenses] = await Promise.all([
      db.user.findUnique({
        where: { id: userId },
        select: { monthlyIncome: true },
      }),
      monthlyIncomeModel
        ? monthlyIncomeModel.findUnique({
            where: {
              userId_month: {
                userId,
                month: toMonthStart(month),
              },
            },
            select: { amount: true },
          })
        : Promise.resolve(null),
      db.bank.findMany({
        where: { userId },
        orderBy: { name: "asc" },
      }),
      db.expense.findMany({
        where: { userId },
        include: {
          bank: true,
          payments: {
            where: {
              month: toMonthStart(month),
            },
            select: {
              expenseId: true,
              month: true,
            },
          },
        },
        orderBy: [{ name: "asc" }],
      }),
    ]);

    const resolvedExpenses = expenses
      .filter((expense) => expenseAppliesToMonth(expense, month))
      .map((expense) => {
        const paid = expense.payments.some(
          (payment) => toMonthStart(payment.month).getTime() === toMonthStart(month).getTime(),
        );

        return {
          id: expense.id,
          name: expense.name,
          amount: expense.amount,
          bankId: expense.bankId,
          bankName: expense.bank.name,
          isRecurring: expense.isRecurring,
          startMonth: formatMonthKey(expense.startMonth),
          endMonth: expense.endMonth ? formatMonthKey(expense.endMonth) : null,
          paid,
        };
      });

    const bankTotals = banks.map((bank) => {
      const entries = resolvedExpenses.filter((expense) => expense.bankId === bank.id);
      const planned = entries.reduce((sum, expense) => sum + Number(expense.amount), 0);
      const paid = entries
        .filter((expense) => expense.paid)
        .reduce((sum, expense) => sum + Number(expense.amount), 0);

      return {
        bankId: bank.id,
        bankName: bank.name,
        color: bank.color,
        planned,
        paid,
      };
    });

    const totals = bankTotals.reduce(
      (acc, bank) => {
        acc.planned += bank.planned;
        acc.paid += bank.paid;
        return acc;
      },
      { planned: 0, paid: 0 },
    );

    return NextResponse.json({
      month: monthKey,
      income: Number(monthIncome?.amount ?? user?.monthlyIncome ?? 0),
      totals: {
        planned: totals.planned,
        paid: totals.paid,
        remaining: totals.planned - totals.paid,
      },
      bankTotals,
      expenses: resolvedExpenses,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    if (error instanceof Error && error.message.includes("Invalid month format")) {
      return jsonError("Month must be in yyyy-MM format.", 400);
    }
    return jsonError("Unable to load month data.", 500);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ month: string }> }) {
  try {
    const userId = await requireUserId();
    const { month: monthKey } = await context.params;
    const month = parseMonthKey(monthKey);
    const monthlyIncomeModel = getMonthlyIncomeModel();
    if (!monthlyIncomeModel) {
      return jsonError(
        "Monthly income model is unavailable. Run Prisma generate and restart the server.",
        500,
      );
    }

    const body = await request.json();
    const payload = monthlyIncomeSchema.parse(body);

    const record = await monthlyIncomeModel.upsert({
      where: {
        userId_month: {
          userId,
          month: toMonthStart(month),
        },
      },
      create: {
        userId,
        month: toMonthStart(month),
        amount: new Prisma.Decimal(payload.amount.toFixed(2)),
      },
      update: {
        amount: new Prisma.Decimal(payload.amount.toFixed(2)),
      },
    });

    return NextResponse.json({
      month: monthKey,
      income: Number(record.amount),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return jsonError(error.issues[0]?.message ?? "Invalid data.", 400);
    }
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return jsonError("Unauthorized.", 401);
    }
    if (error instanceof Error && error.message.includes("Invalid month format")) {
      return jsonError("Month must be in yyyy-MM format.", 400);
    }
    return jsonError("Unable to update month income.", 500);
  }
}
