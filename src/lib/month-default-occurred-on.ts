import { todayUtcDate } from "@/lib/expense-line";
import { getCurrentMonthKey, parseMonthKey } from "@/lib/months";

/** Default `occurredOn` when adding a line from `/m/[month]` so path month matches. */
export function defaultOccurredOnForMonthView(monthKey: string): string {
  const today = todayUtcDate();
  const todayStr = today.toISOString().slice(0, 10);
  if (getCurrentMonthKey() === monthKey) return todayStr;

  const start = parseMonthKey(monthKey);
  if (monthKey > getCurrentMonthKey()) {
    return start.toISOString().slice(0, 10);
  }
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return end.toISOString().slice(0, 10);
}
