import { db } from "@/lib/db";

type MonthlyIncomeDelegate = {
  findUnique: typeof db.monthlyIncome.findUnique;
  findMany: typeof db.monthlyIncome.findMany;
  upsert: typeof db.monthlyIncome.upsert;
};

export function getMonthlyIncomeModel(): MonthlyIncomeDelegate | null {
  const model = (db as unknown as { monthlyIncome?: MonthlyIncomeDelegate }).monthlyIncome;
  return model ?? null;
}
