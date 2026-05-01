import { addMonths } from "date-fns";

import { type Expense, type Income } from "@prisma/client";

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

/**
 * Estructura mínima para evaluar si una plantilla aplica a un mes dado.
 * `Expense` e `Income` la cumplen por construcción (mismos tres campos).
 */
type RecurringTemplate = Pick<Expense, "isRecurring" | "startMonth" | "endMonth">;

export function templateAppliesToMonth(template: RecurringTemplate, month: Date): boolean {
  const monthStart = toMonthStart(month);
  const tplStart = toMonthStart(template.startMonth);
  const tplEnd = template.endMonth ? toMonthStart(template.endMonth) : null;

  if (!template.isRecurring) {
    return tplStart.getTime() === monthStart.getTime();
  }

  if (tplStart.getTime() > monthStart.getTime()) {
    return false;
  }

  if (tplEnd && monthStart.getTime() > tplEnd.getTime()) {
    return false;
  }

  return true;
}

/** @deprecated Usar `templateAppliesToMonth`. Se mantiene por compatibilidad. */
export function expenseAppliesToMonth(expense: Expense, month: Date): boolean {
  return templateAppliesToMonth(expense, month);
}

export function incomeAppliesToMonth(income: Income, month: Date): boolean {
  return templateAppliesToMonth(income, month);
}
