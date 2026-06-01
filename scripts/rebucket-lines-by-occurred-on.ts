/**
 * One-shot: move month lines whose `monthRecord.month` ≠ UTC month of `occurredOn`.
 * Run with: npx tsx scripts/rebucket-lines-by-occurred-on.ts [--dry-run]
 */
import { db } from "../src/lib/db";
import {
  monthBucketStart,
  rebucketExpenseLineIfNeeded,
  rebucketIncomeLineIfNeeded,
} from "../src/lib/month-line-bucket";
import { formatMonthKey } from "../src/lib/months";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const [expenses, incomes] = await Promise.all([
    db.monthExpenseLine.findMany({
      select: {
        id: true,
        userId: true,
        occurredOn: true,
        monthRecord: { select: { month: true } },
      },
    }),
    db.monthIncomeLine.findMany({
      select: {
        id: true,
        userId: true,
        occurredOn: true,
        monthRecord: { select: { month: true } },
      },
    }),
  ]);

  let moved = 0;
  for (const line of expenses) {
    const bucket = formatMonthKey(line.monthRecord.month);
    const expected = formatMonthKey(monthBucketStart(line.occurredOn));
    if (bucket === expected) continue;
    if (dryRun) {
      console.log(`expense ${line.id}: ${bucket} -> ${expected}`);
    } else {
      await rebucketExpenseLineIfNeeded(line.id, line.userId, line.occurredOn);
    }
    moved++;
  }
  for (const line of incomes) {
    const bucket = formatMonthKey(line.monthRecord.month);
    const expected = formatMonthKey(monthBucketStart(line.occurredOn));
    if (bucket === expected) continue;
    if (dryRun) {
      console.log(`income ${line.id}: ${bucket} -> ${expected}`);
    } else {
      await rebucketIncomeLineIfNeeded(line.id, line.userId, line.occurredOn);
    }
    moved++;
  }
  console.log(dryRun ? `[dry-run] would rebucket ${moved} lines` : `Rebucketed ${moved} lines`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
