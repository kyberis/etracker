/**
 * Setup-state hint used by the Telegram channel to drive the AI-driven
 * onboarding flow. While `needsSetup === true`, the agent receives an extra
 * system-prompt block instructing it to greet warmly, ask whether the user
 * wants to start with income or expenses, and recommend concrete prompts.
 *
 * The hint is **derived** from existing data — no new schema. The condition is
 * intentionally permissive: a user who tracked everything in a previous month
 * but has nothing in the current month is *not* considered "fresh"; we look at
 * `primaryCurrencyConfirmedAt` for the long-lived signal and at the current
 * month's lines for the short-lived "anything happening yet?" signal.
 */
import { db } from "@/lib/db";
import { parseMonthKey, getCurrentMonthKey, toMonthStart } from "@/lib/months";

export type TelegramSetupHint = {
  /** True when the agent should run the onboarding script for this turn. */
  needsSetup: boolean;
  /** Mirror of `User.primaryCurrencyConfirmedAt != null`. */
  currencyConfirmed: boolean;
  /** Whether the user already has any income line in the current month. */
  hasIncomeThisMonth: boolean;
  /** Whether the user already has any expense line in the current month. */
  hasExpenseThisMonth: boolean;
  /** Mirror of `User.primaryCurrency` so the agent can use it in examples. */
  primaryCurrency: string;
  /** UI locale (es | en). The setup block uses this to pick the language. */
  locale: string;
};

/**
 * Loads the setup hint for a Telegram message turn. One DB round-trip:
 * a single transaction that fetches the user fields plus the line counts
 * scoped to the current calendar month (UTC).
 *
 * Returns `needsSetup = false` if the user no longer exists (defensive).
 */
export async function loadTelegramSetupHint(
  userId: string,
): Promise<TelegramSetupHint> {
  const monthStart = toMonthStart(parseMonthKey(getCurrentMonthKey()));

  const [user, incomeCount, expenseCount] = await db.$transaction([
    db.user.findUnique({
      where: { id: userId },
      select: {
        primaryCurrency: true,
        primaryCurrencyConfirmedAt: true,
        locale: true,
      },
    }),
    db.monthIncomeLine.count({
      where: { userId, monthRecord: { month: monthStart } },
    }),
    db.monthExpenseLine.count({
      where: { userId, monthRecord: { month: monthStart } },
    }),
  ]);

  if (!user) {
    return {
      needsSetup: false,
      currencyConfirmed: false,
      hasIncomeThisMonth: false,
      hasExpenseThisMonth: false,
      primaryCurrency: "USD",
      locale: "es",
    };
  }

  const currencyConfirmed = Boolean(user.primaryCurrencyConfirmedAt);
  const hasIncomeThisMonth = incomeCount > 0;
  const hasExpenseThisMonth = expenseCount > 0;
  const hasAnyMovement = hasIncomeThisMonth || hasExpenseThisMonth;
  const needsSetup = !currencyConfirmed || !hasAnyMovement;

  return {
    needsSetup,
    currencyConfirmed,
    hasIncomeThisMonth,
    hasExpenseThisMonth,
    primaryCurrency: user.primaryCurrency ?? "USD",
    locale: user.locale ?? "es",
  };
}
