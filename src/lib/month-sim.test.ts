import { describe, expect, it } from "vitest";

import {
  applyDeliveryPreset,
  baselineTotal,
  effectiveAmountConverted,
  effectiveTotal,
  isDeliveryLike,
  resetSimState,
  simHasChanges,
} from "./month-sim";

describe("month-sim", () => {
  it("effectiveAmountConverted respects cut and included", () => {
    expect(effectiveAmountConverted(100, { included: true, cutPct: 0 })).toBe(100);
    expect(effectiveAmountConverted(100, { included: true, cutPct: 50 })).toBe(50);
    expect(effectiveAmountConverted(100, { included: false, cutPct: 50 })).toBe(0);
  });

  it("detects delivery-like lines", () => {
    expect(
      isDeliveryLike({ name: "PedidosYa — sushi", category: "ALIMENTACION" }),
    ).toBe(true);
    expect(
      isDeliveryLike({ name: "Rappi burgers", category: "ALIMENTACION" }),
    ).toBe(true);
    expect(
      isDeliveryLike({ name: "Supermercado", category: "ALIMENTACION" }),
    ).toBe(false);
    expect(
      isDeliveryLike({ name: "PedidosYa", category: "TRANSPORTE" }),
    ).toBe(false);
  });

  it("applyDeliveryPreset turns off matching lines", () => {
    const lines = [
      { id: "1", name: "PedidosYa", category: "ALIMENTACION" },
      { id: "2", name: "Alquiler", category: "VIVIENDA" },
    ];
    const next = applyDeliveryPreset(lines, {});
    expect(next["1"]).toEqual({ included: false, cutPct: 0 });
    expect(next["2"]).toBeUndefined();
  });

  it("totals and saved", () => {
    const lines = [
      { id: "a", amountConverted: "100" },
      { id: "b", amountConverted: "40" },
    ];
    expect(baselineTotal(lines)).toBe(140);
    const state = { a: { included: false, cutPct: 0 }, b: { included: true, cutPct: 50 } };
    expect(effectiveTotal(lines, state)).toBe(20);
    expect(simHasChanges(state)).toBe(true);
    expect(simHasChanges(resetSimState())).toBe(false);
  });
});
