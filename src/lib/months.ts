import { addMonths } from "date-fns";

import { type Expense } from "@prisma/client";

export function toMonthStart(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

export function parseMonthKey(monthKey: string): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) {
    throw new Error("Invalid month format. Use yyyy-MM.");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error("Invalid month format. Use yyyy-MM.");
  }
  return new Date(Date.UTC(year, month - 1, 1));
}

export function formatMonthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

/** yyyy-MM of the current calendar month in UTC. */
export function getCurrentMonthKey() {
  return formatMonthKey(new Date());
}

export function isCurrentMonthKey(monthKey: string) {
  return monthKey === getCurrentMonthKey();
}

export function monthRange(start: Date, count: number): Date[] {
  return Array.from({ length: count }).map((_, index) => addMonths(start, index));
}

export function expenseAppliesToMonth(expense: Expense, month: Date): boolean {
  const monthStart = toMonthStart(month);
  const expenseStart = toMonthStart(expense.startMonth);
  const expenseEnd = expense.endMonth ? toMonthStart(expense.endMonth) : null;

  if (!expense.isRecurring) {
    return expenseStart.getTime() === monthStart.getTime();
  }

  if (expenseStart.getTime() > monthStart.getTime()) {
    return false;
  }

  if (expenseEnd && monthStart.getTime() > expenseEnd.getTime()) {
    return false;
  }

  return true;
}
