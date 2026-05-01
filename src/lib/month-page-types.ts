export type MonthLinePayload = {
  id: string;
  name: string;
  /** Original amount in the line's `currency`. */
  amount: string;
  /** ISO 4217 currency the user actually charged the expense in. */
  currency: string;
  /** Multiplier locked at entry time (`amount * fxRate = amountConverted`). */
  fxRate: string;
  /** Pre-computed amount in the user's primary currency. Use this for math. */
  amountConverted: string;
  bankId: string;
  bankName: string;
  paid: boolean;
  category: string;
  /**
   * ISO timestamp del momento en que se creó la línea. Es el único orden
   * cronológico real disponible para `MonthExpenseLine` (no hay fecha de
   * transacción explícita), así que lo usamos para ordenar la lista del mes.
   */
  createdAt: string;
};

/** Expense template that applies to this month but has no line in the month bucket yet. */
export type PendingTemplateExpense = {
  templateId: string;
  name: string;
  amount: string;
  bankId: string;
  bankName: string;
  category: string;
};

export type MonthPageDataNoRecord = {
  month: string;
  hasRecord: false;
  defaultIncome: number;
  /** ISO 4217 primary currency for aggregations and for the user's income. */
  primaryCurrency: string;
  incomeHistory: Array<{ month: string; amount: number }>;
};

/**
 * Sugerencia que aparece cuando el mes anterior cerró con un saldo distinto
 * de cero y el usuario todavía no decidió qué hacer. Distingue entre
 * "leftover" (sobró plata) y "deficit" (cerró en rojo).
 *
 * - `type: "leftover"` → opciones: sumar al ingreso del mes actual o dejar
 *   aparte como ahorro.
 * - `type: "deficit"` → opciones: cubrir con la pila de ahorro (parcial si
 *   no alcanza) o arrastrar la deuda como `carryoverFromPrev` negativo.
 *
 * `amount` es siempre el valor absoluto del saldo del mes anterior;
 * `savings` es la pila disponible al momento del snapshot (relevante en el
 * caso `deficit` para mostrar cuánto se puede cubrir).
 */
export type CarryoverPrompt = {
  type: "leftover" | "deficit";
  /** yyyy-MM del mes anterior con registro. */
  prevMonth: string;
  /** Magnitud absoluta del saldo (>0). */
  amount: number;
  /** Pila de ahorro al snapshot, relevante para el caso `deficit`. */
  savings: number;
};

export type MonthPageDataWithRecord = {
  month: string;
  hasRecord: true;
  defaultIncome: number;
  /** ISO 4217 primary currency for aggregations and for the user's income. */
  primaryCurrency: string;
  income: number;
  /** Amount carried over from the previous month and added to this month. */
  carryoverFromPrev: number;
  /** `income + carryoverFromPrev`. Use this for any "ingreso disponible" UI. */
  effectiveIncome: number;
  /** Pending decision about the previous month's leftover, when applicable. */
  carryoverPrompt: CarryoverPrompt | null;
  /** Cumulative savings pile across all "set aside" decisions. */
  savings: number;
  /** True when this page’s month is the current calendar month (UTC). */
  isCurrentMonth: boolean;
  incomeHistory: Array<{ month: string; amount: number }>;
  totals: { planned: number; paid: number; remaining: number };
  /** effectiveIncome − total planned expenses */
  balance: number;
  bankTotals: Array<{
    bankId: string;
    bankName: string;
    color?: string | null;
    planned: number;
    paid: number;
  }>;
  expenses: MonthLinePayload[];
  banks: Array<{ id: string; name: string }>;
  /** Templates that apply to this month but are not yet copied into this bucket. */
  pendingFromTemplates: PendingTemplateExpense[];
  /**
   * Aporte mensual a ahorro registrado para este mes (uno por mes como máximo).
   * Es informativo: NO afecta el balance del mes; solo declara cuánto está
   * dedicando el usuario a la pila global. `null` cuando no se registró.
   */
  monthlySavingsContribution: {
    id: string;
    /** Monto en la moneda en que se persistió el movimiento. */
    amount: number;
    note: string | null;
    /** yyyy-MM-dd. */
    occurredOn: string;
  } | null;
};

export type MonthPageData = MonthPageDataNoRecord | MonthPageDataWithRecord;
