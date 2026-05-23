import { Prisma, SavingsMovementKind } from "@prisma/client";

import { db } from "@/lib/db";
import { recordSavingsMovement } from "@/lib/savings";
import { todayUtcDate } from "@/lib/expense-line";

const OFFICE_RELEASE_NOTE = "Trefolio Office: released for investing";

export async function proposeOfficeSavingsRelease(
  userId: string,
  amountEur: number,
): Promise<{ ok: true; message: string; balance: number } | { ok: false; error: string }> {
  if (!Number.isFinite(amountEur) || amountEur <= 0) {
    return { ok: false, error: "invalid_amount" };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { primaryCurrency: true, savings: true },
  });
  if (!user) return { ok: false, error: "user_not_found" };

  const magnitude = new Prisma.Decimal(amountEur.toFixed(2));
  if (user.savings.lessThan(magnitude)) {
    return { ok: false, error: "insufficient_savings" };
  }

  const result = await recordSavingsMovement({
    userId,
    kind: SavingsMovementKind.MANUAL_WITHDRAWAL,
    amount: magnitude.negated(),
    currency: user.primaryCurrency,
    note: OFFICE_RELEASE_NOTE,
    occurredOn: todayUtcDate(),
  });

  return {
    ok: true,
    message: `Marked ${amountEur} ${user.primaryCurrency} as released for investing`,
    balance: result.balance,
  };
}
