import type { ResolvedOfficeUser } from "./resolve-office-user";
import { loadMonthPageData } from "@/lib/month-page-data";
import { formatMonthKey } from "@/lib/months";

export interface ClaraOfficeMonthCashflow {
  monthKey: string;
  dayOfMonth: number;
  daysInMonth: number;
  hasMonthRecord: boolean;
  currency: string;
  incomeReceived?: number;
  incomeExpected?: number;
  plannedExpenses?: number;
  paidExpenses?: number;
  remainingExpenses?: number;
  monthBalance?: number;
}

export interface ClaraOfficeSavingsSummary extends ClaraOfficeMonthCashflow {
  emergencyBalanceEur: number;
  emergencyTargetEur: number;
  surplusEur: number;
  freeInInvestingBucketEur: number;
  note?: string;
}

export function utcCalendar(now = new Date()): Pick<
  ClaraOfficeMonthCashflow,
  "monthKey" | "dayOfMonth" | "daysInMonth"
> {
  const year = now.getUTCFullYear();
  const monthIndex = now.getUTCMonth();
  return {
    monthKey: formatMonthKey(now),
    dayOfMonth: now.getUTCDate(),
    daysInMonth: new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate(),
  };
}

/** Three months of declared income as emergency target; surplus is pile above target. */
export function buildClaraOfficeSavingsSummary(user: ResolvedOfficeUser): {
  emergencyBalanceEur: number;
  emergencyTargetEur: number;
  surplusEur: number;
  freeInInvestingBucketEur: number;
  note?: string;
} {
  const balance = Number(user.savings);
  const monthlyIncome = Number(user.monthlyIncome);
  const emergencyTargetEur =
    monthlyIncome > 0 ? Math.round(monthlyIncome * 3) : Math.max(0, Math.round(balance * 0.8));
  const surplusEur = Math.max(0, Math.round(balance - emergencyTargetEur));

  return {
    emergencyBalanceEur: Math.round(balance),
    emergencyTargetEur,
    surplusEur,
    freeInInvestingBucketEur: surplusEur,
    note: user.primaryCurrency !== "EUR" ? `Amounts shown in ${user.primaryCurrency}` : undefined,
  };
}

/**
 * Emergency-fund math plus current-month cashflow aggregates (no line items).
 * Used by Warren via GET /api/internal/office/savings-summary.
 */
export async function buildClaraOfficeCashflowSnapshot(
  user: ResolvedOfficeUser,
  now = new Date(),
): Promise<ClaraOfficeSavingsSummary> {
  const calendar = utcCalendar(now);
  const emergency = buildClaraOfficeSavingsSummary(user);
  const data = await loadMonthPageData(user.id, calendar.monthKey);

  if (!data.hasRecord) {
    return {
      ...emergency,
      ...calendar,
      hasMonthRecord: false,
      currency: user.primaryCurrency,
    };
  }

  return {
    ...emergency,
    ...calendar,
    hasMonthRecord: true,
    currency: data.primaryCurrency,
    incomeReceived: Math.round(data.income),
    incomeExpected: Math.round(data.incomeExpected),
    plannedExpenses: Math.round(data.totals.planned),
    paidExpenses: Math.round(data.totals.paid),
    remainingExpenses: Math.round(data.totals.remaining),
    monthBalance: Math.round(data.balance),
  };
}
