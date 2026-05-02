import type { LanguageModelUsage } from "ai";

/**
 * Loose subset of `LanguageModelUsage` that `calculateCost` actually reads.
 * Accepting a structural subtype lets callers pass plain `{ inputTokens,
 * outputTokens, totalTokens }` aggregates (e.g. from analytics groupBy
 * results) without having to fabricate the full usage object.
 */
type CostUsage = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputTokenDetails?: LanguageModelUsage["inputTokenDetails"];
  outputTokenDetails?: LanguageModelUsage["outputTokenDetails"];
};

/**
 * USD price per 1,000,000 tokens for OpenAI models.
 * Keep this table updated from https://openai.com/api/pricing/.
 * Override at runtime with OPENAI_PRICE_INPUT_PER_M / OPENAI_PRICE_OUTPUT_PER_M
 * / OPENAI_PRICE_CACHED_INPUT_PER_M when calling a model not listed here.
 */
type ModelPricing = {
  inputPerM: number;
  cachedInputPerM?: number;
  outputPerM: number;
};

const PRICING: Record<string, ModelPricing> = {
  "gpt-5.4": { inputPerM: 2.5, cachedInputPerM: 0.25, outputPerM: 15 },
  "gpt-5": { inputPerM: 1.25, cachedInputPerM: 0.125, outputPerM: 10 },
  "gpt-5-mini": { inputPerM: 0.25, cachedInputPerM: 0.025, outputPerM: 2 },
  "gpt-5-nano": { inputPerM: 0.05, cachedInputPerM: 0.005, outputPerM: 0.4 },
  "gpt-4o": { inputPerM: 2.5, cachedInputPerM: 1.25, outputPerM: 10 },
  "gpt-4o-mini": { inputPerM: 0.15, cachedInputPerM: 0.075, outputPerM: 0.6 },
  "gpt-4.1": { inputPerM: 2, cachedInputPerM: 0.5, outputPerM: 8 },
  "gpt-4.1-mini": { inputPerM: 0.4, cachedInputPerM: 0.1, outputPerM: 1.6 },
  "gpt-4.1-nano": { inputPerM: 0.1, cachedInputPerM: 0.025, outputPerM: 0.4 },
  "gpt-4-turbo": { inputPerM: 10, outputPerM: 30 },
  "o1": { inputPerM: 15, cachedInputPerM: 7.5, outputPerM: 60 },
  "o1-mini": { inputPerM: 3, cachedInputPerM: 1.5, outputPerM: 12 },
  "o3-mini": { inputPerM: 1.1, cachedInputPerM: 0.55, outputPerM: 4.4 },
};

function envFloat(name: string): number | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Strip the AI Gateway provider prefix (`openai/gpt-4o` → `gpt-4o`) so
 * lookups against `PRICING` work regardless of whether the caller passed
 * the gateway-formatted id or a bare model name.
 */
function stripProviderPrefix(modelId: string): string {
  const slash = modelId.indexOf("/");
  return slash === -1 ? modelId : modelId.slice(slash + 1);
}

function resolvePricing(modelId: string): ModelPricing | null {
  const direct = PRICING[modelId];
  if (direct) return direct;

  const bare = stripProviderPrefix(modelId);
  const directBare = PRICING[bare];
  if (directBare) return directBare;

  // Fuzzy match against the bare model id so dated variants like
  // `gpt-4o-2024-08-06` or `openai/gpt-5-mini-2026-03-05` resolve to their
  // family pricing. Sort by descending key length so `gpt-5-mini` wins over
  // `gpt-5` for `gpt-5-mini-...`.
  const fuzzy = Object.keys(PRICING)
    .sort((a, b) => b.length - a.length)
    .find((k) => bare.startsWith(k));
  const base = fuzzy ? PRICING[fuzzy] : undefined;

  const override: ModelPricing = {
    inputPerM: envFloat("OPENAI_PRICE_INPUT_PER_M") ?? base?.inputPerM ?? NaN,
    cachedInputPerM:
      envFloat("OPENAI_PRICE_CACHED_INPUT_PER_M") ?? base?.cachedInputPerM,
    outputPerM:
      envFloat("OPENAI_PRICE_OUTPUT_PER_M") ?? base?.outputPerM ?? NaN,
  };

  if (!Number.isFinite(override.inputPerM) || !Number.isFinite(override.outputPerM)) {
    return null;
  }
  return override;
}

export type CostBreakdown = {
  modelId: string;
  pricing: ModelPricing | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  inputUSD: number;
  cachedInputUSD: number;
  outputUSD: number;
  totalUSD: number;
};

export function calculateCost(
  modelId: string,
  usage: CostUsage,
): CostBreakdown {
  const pricing = resolvePricing(modelId);

  const cachedInputTokens = usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const inputTokensTotal = usage.inputTokens ?? 0;
  const nonCachedInput = Math.max(0, inputTokensTotal - cachedInputTokens);
  const outputTokens = usage.outputTokens ?? 0;
  const reasoningTokens = usage.outputTokenDetails?.reasoningTokens ?? 0;
  const totalTokens =
    usage.totalTokens ?? inputTokensTotal + outputTokens;

  if (!pricing) {
    return {
      modelId,
      pricing: null,
      inputTokens: inputTokensTotal,
      cachedInputTokens,
      outputTokens,
      reasoningTokens,
      totalTokens,
      inputUSD: 0,
      cachedInputUSD: 0,
      outputUSD: 0,
      totalUSD: 0,
    };
  }

  const inputUSD = (nonCachedInput / 1_000_000) * pricing.inputPerM;
  const cachedRate = pricing.cachedInputPerM ?? pricing.inputPerM;
  const cachedInputUSD = (cachedInputTokens / 1_000_000) * cachedRate;
  const outputUSD = (outputTokens / 1_000_000) * pricing.outputPerM;
  const totalUSD = inputUSD + cachedInputUSD + outputUSD;

  return {
    modelId,
    pricing,
    inputTokens: inputTokensTotal,
    cachedInputTokens,
    outputTokens,
    reasoningTokens,
    totalTokens,
    inputUSD,
    cachedInputUSD,
    outputUSD,
    totalUSD,
  };
}

/** Format cost as `$0.001234` (6 decimals). */
export function formatUSD(value: number): string {
  return `$${value.toFixed(6)}`;
}
