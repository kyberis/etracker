import type { MonthLineKind } from "@/lib/month-line-kind";
import {
  effectiveAmountConverted,
  getSimLine,
  type SimStateMap,
} from "@/lib/month-sim";

export type AggregateLine = {
  id: string;
  name: string;
  category: string;
  bankId: string;
  bankName: string;
  kind: MonthLineKind;
  amountConverted: string | number;
};

export function withEffectiveAmounts(
  lines: AggregateLine[],
  sim: SimStateMap,
): Array<AggregateLine & { effective: number }> {
  return lines.map((l) => ({
    ...l,
    effective: effectiveAmountConverted(
      Number(l.amountConverted),
      getSimLine(sim, l.id),
    ),
  }));
}

export function totalsByKind(
  lines: Array<{ kind: MonthLineKind; effective: number }>,
): { recurring: number; oneOff: number; total: number } {
  let recurring = 0;
  let oneOff = 0;
  for (const l of lines) {
    if (l.kind === "RECURRING") recurring += l.effective;
    else oneOff += l.effective;
  }
  return { recurring, oneOff, total: recurring + oneOff };
}

export function totalsByCategory(
  lines: Array<{ category: string; effective: number }>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of lines) {
    if (l.effective <= 0) continue;
    out[l.category] = (out[l.category] ?? 0) + l.effective;
  }
  return out;
}

export function totalsByBank(
  lines: Array<{ bankId: string; bankName: string; effective: number }>,
): Array<{ bankId: string; bankName: string; total: number }> {
  const map = new Map<string, { bankId: string; bankName: string; total: number }>();
  for (const l of lines) {
    if (l.effective <= 0) continue;
    const cur = map.get(l.bankId) ?? {
      bankId: l.bankId,
      bankName: l.bankName,
      total: 0,
    };
    cur.total += l.effective;
    map.set(l.bankId, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function topExpenses(
  lines: Array<{ id: string; name: string; kind: MonthLineKind; effective: number }>,
  n = 8,
): Array<{ id: string; name: string; kind: MonthLineKind; effective: number }> {
  return [...lines]
    .filter((l) => l.effective > 0)
    .sort((a, b) => b.effective - a.effective)
    .slice(0, n);
}

export function activeBankCount(
  lines: Array<{ bankId: string; effective: number }>,
): number {
  return new Set(lines.filter((l) => l.effective > 0).map((l) => l.bankId)).size;
}
