import { describe, expect, it } from "vitest";

import { buildCellAskSystemBlock, type CellAskContext } from "./cell-ask-context";

const sample: CellAskContext = {
  month: "2026-07",
  primaryCurrency: "ARS",
  focus: { type: "line", lineId: "abc", field: "amount" },
  label: "Netflix · $ 8900",
  line: {
    id: "abc",
    name: "Netflix",
    kind: "RECURRING",
    category: "SUSCRIPCIONES",
    bankId: "mp",
    bankName: "Mercado Pago",
    amountConverted: 8900,
    paid: true,
    occurredOn: "2026-07-02",
  },
  monthTotals: { total: 100000, recurring: 80000, oneOff: 20000 },
};

describe("buildCellAskSystemBlock", () => {
  it("includes snapshot and no-advice rule in ES", () => {
    const block = buildCellAskSystemBlock(sample, "es");
    expect(block).toContain("Netflix");
    expect(block).toContain("consejo");
    expect(block).toContain("2026-07");
  });

  it("includes snapshot in EN", () => {
    const block = buildCellAskSystemBlock(sample, "en");
    expect(block).toContain("financial advice");
    expect(block).toContain('"lineId": "abc"');
  });
});
