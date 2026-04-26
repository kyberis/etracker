import { db } from "@/lib/db";
import { formatMonthKey, parseMonthKey, toMonthStart } from "@/lib/months";

export type YearMonthSlot = {
  key: string;
  month: number;
  hasBucket: boolean;
  income: number;
  totalExpense: number;
  isFuture: boolean;
  isCurrent: boolean;
  balance: number | null;
  variant: "empty" | "future" | "pastOrCurrent";
};

function utcNowMonthStart() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function getYearTimelineData(userId: string, year: number) {
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEndExclusive = new Date(Date.UTC(year + 1, 0, 1));

  const yearRecords = await db.monthRecord.findMany({
    where: {
      userId,
      month: {
        gte: yearStart,
        lt: yearEndExclusive,
      },
    },
    include: {
      lines: { select: { amount: true } },
    },
  });

  const byKey = new Map(
    yearRecords.map((r) => {
      const key = formatMonthKey(r.month);
      const totalExpense = r.lines.reduce((s, l) => s + Number(l.amount), 0);
      return [key, { income: Number(r.income), totalExpense }];
    }),
  );

  const now = utcNowMonthStart();
  const months: YearMonthSlot[] = [];

  for (let m = 0; m < 12; m += 1) {
    const monthNum = m + 1;
    const key = `${year}-${String(monthNum).padStart(2, "0")}`;
    const monthDate = toMonthStart(parseMonthKey(key));
    const isFuture = monthDate.getTime() > now.getTime();
    const isCurrent = monthDate.getTime() === now.getTime();

    const rec = byKey.get(key);
    const hasBucket = Boolean(rec);
    const income = rec?.income ?? 0;
    const totalExpense = rec?.totalExpense ?? 0;
    const balance = hasBucket ? income - totalExpense : null;

    let variant: YearMonthSlot["variant"];
    if (!hasBucket) {
      variant = "empty";
    } else if (isFuture) {
      variant = "future";
    } else {
      variant = "pastOrCurrent";
    }

    months.push({
      key,
      month: monthNum,
      hasBucket,
      income,
      totalExpense,
      isFuture,
      isCurrent,
      balance,
      variant,
    });
  }

  return { year, months };
}
