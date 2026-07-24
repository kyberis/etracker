/**
 * Client-side simulation helpers for the month desktop grid.
 * Simulation never persists — only transforms amounts for display/charts.
 */

export type SimLineState = {
  included: boolean;
  /** 0–100, step 5 in the UI. */
  cutPct: number;
};

export type SimStateMap = Record<string, SimLineState>;

export const DEFAULT_SIM_LINE: SimLineState = { included: true, cutPct: 0 };

/** Heuristic for the "Sin delivery" preset (PRD / exec plan). */
export const DELIVERY_NAME_RE =
  /pedidosya|pedidos\s*ya|rappi|delivery|uber\s*eats/i;

export function getSimLine(state: SimStateMap, lineId: string): SimLineState {
  return state[lineId] ?? DEFAULT_SIM_LINE;
}

export function effectiveAmountConverted(
  amountConverted: number,
  sim: SimLineState,
): number {
  if (!sim.included) return 0;
  const cut = Math.min(100, Math.max(0, sim.cutPct));
  return Math.round(amountConverted * (1 - cut / 100) * 100) / 100;
}

export function isDeliveryLike(line: {
  name: string;
  category: string;
}): boolean {
  return line.category === "ALIMENTACION" && DELIVERY_NAME_RE.test(line.name);
}

export function applyDeliveryPreset(
  lines: Array<{ id: string; name: string; category: string }>,
  state: SimStateMap,
): SimStateMap {
  const next = { ...state };
  for (const line of lines) {
    if (isDeliveryLike(line)) {
      next[line.id] = { included: false, cutPct: 0 };
    }
  }
  return next;
}

export function resetSimState(): SimStateMap {
  return {};
}

export function simHasChanges(state: SimStateMap): boolean {
  return Object.values(state).some((s) => !s.included || s.cutPct > 0);
}

export function baselineTotal(
  lines: Array<{ amountConverted: string | number }>,
): number {
  return lines.reduce((s, l) => s + Number(l.amountConverted), 0);
}

export function effectiveTotal(
  lines: Array<{ id: string; amountConverted: string | number }>,
  state: SimStateMap,
): number {
  return lines.reduce(
    (s, l) =>
      s + effectiveAmountConverted(Number(l.amountConverted), getSimLine(state, l.id)),
    0,
  );
}

export function simStorageKey(userKey: string, month: string): string {
  return `clara.monthSim:${userKey}:${month}`;
}
