/**
 * Structured context for cell-ask on the month desktop grid.
 * Sent to `/api/chat` with `surface: "month-grid"` so the agent can answer
 * about a specific cell without inventing lines.
 */

export type CellAskFocus =
  | { type: "line"; lineId: string; field?: string }
  | { type: "bank"; bankId: string }
  | { type: "kpi"; kpi: "total" | "recurring" | "oneoff" | "banks" };

export type CellAskSnapshotLine = {
  id: string;
  name: string;
  kind: "RECURRING" | "ONE_OFF";
  category: string;
  bankId: string;
  bankName: string;
  amountConverted: number;
  paid: boolean;
  occurredOn: string;
};

export type CellAskContext = {
  month: string;
  primaryCurrency: string;
  focus: CellAskFocus;
  label: string;
  /** Focused line when focus.type === "line". */
  line?: CellAskSnapshotLine;
  /** Aggregate snapshot for the month (primary currency). */
  monthTotals: {
    total: number;
    recurring: number;
    oneOff: number;
  };
  bankTotal?: { bankId: string; bankName: string; total: number };
};

export function buildCellAskSystemBlock(
  ctx: CellAskContext,
  locale: "es" | "en",
): string {
  const payload = JSON.stringify(ctx, null, 2);
  if (locale === "en") {
    return `

Cell-ask context (month desktop grid):
The user clicked a cell/KPI and is asking about that focus only.
- Answer briefly with the numbers in the snapshot. Do not invent lines or amounts.
- Describe patterns (e.g. delivery share); never give investment/financial advice.
- If they ask "what if I remove this", compute arithmetic from the snapshot and suggest the Simulate tab for scenarios.
- Prefer tools only when the snapshot is insufficient; do not mutate unless the user explicitly asks to change data.
Snapshot JSON:
${payload}`;
  }
  return `

Contexto cell-ask (vista tabla del mes):
El usuario clickeó una celda/KPI y pregunta sobre ese foco.
- Respondé breve con los números del snapshot. No inventes líneas ni montos.
- Describí patrones (p. ej. cuánto suma delivery); nunca des consejo de inversión ni financiero.
- Si pregunta "qué pasa si lo saco", calculá con el snapshot y sugerí la pestaña Simular.
- Usá tools solo si el snapshot no alcanza; no mutés datos salvo que lo pida explícito.
Snapshot JSON:
${payload}`;
}
