import type { LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";

import { calculateCost, formatUSD } from "./cost";

function usage(partial: Partial<LanguageModelUsage>): LanguageModelUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputTokenDetails: {
      noCacheTokens: undefined,
      cacheReadTokens: undefined,
      cacheWriteTokens: undefined,
    },
    outputTokenDetails: {
      reasoningTokens: undefined,
      acceptedPredictionTokens: undefined,
      rejectedPredictionTokens: undefined,
    },
    ...partial,
  } as LanguageModelUsage;
}

describe("ai/cost", () => {
  describe("calculateCost", () => {
    it("computes USD for a known model with cached + non-cached input", () => {
      const out = calculateCost(
        "gpt-4o-mini",
        usage({
          inputTokens: 10_000,
          outputTokens: 5_000,
          totalTokens: 15_000,
          inputTokenDetails: {
            noCacheTokens: 6_000,
            cacheReadTokens: 4_000,
            cacheWriteTokens: undefined,
          },
        }),
      );

      // 10k - 4k cached = 6k @ $0.15/M
      expect(out.inputUSD).toBeCloseTo((6_000 / 1_000_000) * 0.15, 10);
      // 4k cached @ $0.075/M
      expect(out.cachedInputUSD).toBeCloseTo((4_000 / 1_000_000) * 0.075, 10);
      // 5k output @ $0.6/M
      expect(out.outputUSD).toBeCloseTo((5_000 / 1_000_000) * 0.6, 10);
      expect(out.totalUSD).toBeCloseTo(
        out.inputUSD + out.cachedInputUSD + out.outputUSD,
        10,
      );
      expect(out.modelId).toBe("gpt-4o-mini");
    });

    it("falls back to a fuzzy match for versioned model ids", () => {
      const out = calculateCost(
        "gpt-4o-2024-08-06",
        usage({ inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 }),
      );
      expect(out.pricing).not.toBeNull();
      expect(out.totalUSD).toBeGreaterThan(0);
    });

    it("returns zero usage when model is unknown and no overrides set", () => {
      const out = calculateCost(
        "totally-made-up-model",
        usage({ inputTokens: 1000, outputTokens: 1000, totalTokens: 2000 }),
      );
      expect(out.pricing).toBeNull();
      expect(out.totalUSD).toBe(0);
    });
  });

  describe("formatUSD", () => {
    it("formats with 6 decimals and a leading $", () => {
      expect(formatUSD(0.001234)).toBe("$0.001234");
      expect(formatUSD(0)).toBe("$0.000000");
    });
  });
});
