import type { ResolvedOfficeUser } from "./resolve-office-user";

export interface ClaraOfficeSavingsSummary {
  emergencyBalanceEur: number;
  emergencyTargetEur: number;
  surplusEur: number;
  freeInInvestingBucketEur: number;
  note?: string;
}

/** Three months of declared income as emergency target; surplus is pile above target. */
export function buildClaraOfficeSavingsSummary(user: ResolvedOfficeUser): ClaraOfficeSavingsSummary {
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
