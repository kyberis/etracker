import type { ExpenseCategory, IncomeCategory } from "@prisma/client";
import { OccurrenceDateSource } from "@prisma/client";

import { db } from "@/lib/db";
import { isUniqueViolation } from "@/lib/expense-line";
import { convertToPrimary, FxUnavailableError } from "@/lib/fx/rates";
import { resolveMonthRecordId } from "@/lib/month-line-bucket";
import { expireYearTimeline } from "@/lib/year-timeline-data";

export type ImportLineResult =
  | { ok: true; duplicate: boolean; lineId: string | null; lineType: "expense" | "income" }
  | { ok: false; error: string };

export async function importBankExpenseLine(input: {
  userId: string;
  bankId: string;
  name: string;
  amount: number;
  currency: string;
  occurredOn: Date;
  category: ExpenseCategory;
}): Promise<ImportLineResult> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { primaryCurrency: true },
  });
  if (!user) return { ok: false, error: "USER_NOT_FOUND" };

  let monthRecordId: string;
  try {
    monthRecordId = await resolveMonthRecordId(input.userId, input.occurredOn);
  } catch {
    return { ok: false, error: "MONTH_SETUP_FAILED" };
  }

  let converted;
  try {
    converted = await convertToPrimary({
      amount: input.amount,
      currency: input.currency,
      primary: user.primaryCurrency,
    });
  } catch (error) {
    if (error instanceof FxUnavailableError) {
      return { ok: false, error: `FX_UNAVAILABLE:${error.from}->${error.to}` };
    }
    throw error;
  }

  try {
    const line = await db.monthExpenseLine.create({
      data: {
        userId: input.userId,
        monthRecordId,
        templateId: null,
        bankId: input.bankId,
        name: input.name.trim(),
        occurredOn: input.occurredOn,
        occurredOnSource: OccurrenceDateSource.ARTIFACT,
        amount: converted.amount,
        currency: converted.currency,
        fxRate: converted.fxRate,
        amountConverted: converted.amountConverted,
        category: input.category,
        paid: true,
      },
    });
    await expireYearTimeline(input.userId, input.occurredOn.getUTCFullYear());
    return { ok: true, duplicate: false, lineId: line.id, lineType: "expense" };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: true, duplicate: true, lineId: null, lineType: "expense" };
    }
    throw error;
  }
}

export async function importBankIncomeLine(input: {
  userId: string;
  bankId: string;
  name: string;
  amount: number;
  currency: string;
  occurredOn: Date;
  category: IncomeCategory;
}): Promise<ImportLineResult> {
  const user = await db.user.findUnique({
    where: { id: input.userId },
    select: { primaryCurrency: true },
  });
  if (!user) return { ok: false, error: "USER_NOT_FOUND" };

  let monthRecordId: string;
  try {
    monthRecordId = await resolveMonthRecordId(input.userId, input.occurredOn);
  } catch {
    return { ok: false, error: "MONTH_SETUP_FAILED" };
  }

  let converted;
  try {
    converted = await convertToPrimary({
      amount: input.amount,
      currency: input.currency,
      primary: user.primaryCurrency,
    });
  } catch (error) {
    if (error instanceof FxUnavailableError) {
      return { ok: false, error: `FX_UNAVAILABLE:${error.from}->${error.to}` };
    }
    throw error;
  }

  try {
    const line = await db.monthIncomeLine.create({
      data: {
        userId: input.userId,
        monthRecordId,
        templateId: null,
        bankId: input.bankId,
        name: input.name.trim(),
        occurredOn: input.occurredOn,
        occurredOnSource: OccurrenceDateSource.ARTIFACT,
        amount: converted.amount,
        currency: converted.currency,
        fxRate: converted.fxRate,
        amountConverted: converted.amountConverted,
        category: input.category,
        received: true,
      },
    });
    await expireYearTimeline(input.userId, input.occurredOn.getUTCFullYear());
    return { ok: true, duplicate: false, lineId: line.id, lineType: "income" };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: true, duplicate: true, lineId: null, lineType: "income" };
    }
    throw error;
  }
}
