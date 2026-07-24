import { describe, expect, it } from "vitest";

import {
  activeBankCount,
  topExpenses,
  totalsByCategory,
  totalsByKind,
  withEffectiveAmounts,
} from "./month-aggregates";

const lines = [
  {
    id: "1",
    name: "Alquiler",
    category: "VIVIENDA",
    bankId: "g",
    bankName: "Galicia",
    kind: "RECURRING" as const,
    amountConverted: "100",
  },
  {
    id: "2",
    name: "Café",
    category: "ALIMENTACION",
    bankId: "m",
    bankName: "MP",
    kind: "ONE_OFF" as const,
    amountConverted: "40",
  },
  {
    id: "3",
    name: "Netflix",
    category: "SUSCRIPCIONES",
    bankId: "m",
    bankName: "MP",
    kind: "RECURRING" as const,
    amountConverted: "10",
  },
];

describe("month-aggregates", () => {
  it("applies sim and aggregates", () => {
    const eff = withEffectiveAmounts(lines, {
      "2": { included: true, cutPct: 50 },
    });
    expect(eff.find((l) => l.id === "2")?.effective).toBe(20);
    expect(totalsByKind(eff)).toEqual({
      recurring: 110,
      oneOff: 20,
      total: 130,
    });
    expect(totalsByCategory(eff).ALIMENTACION).toBe(20);
    expect(activeBankCount(eff)).toBe(2);
    expect(topExpenses(eff, 2).map((l) => l.id)).toEqual(["1", "2"]);
  });
});
