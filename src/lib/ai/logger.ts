import type { LanguageModelUsage, ModelMessage } from "ai";

import { calculateCost, formatUSD, type CostBreakdown } from "@/lib/ai/cost";

/**
 * Structured logger for OpenAI traffic.
 *
 * One JSON line per event prefixed with `[ai]` so it survives any log
 * aggregator. Designed to be greppable: `rg '\\[ai\\]' logs/...`.
 */

type BaseFields = {
  source: "web" | "telegram";
  userId: string;
  model: string;
  /** A short id grouping the request + its steps + finish event. */
  traceId: string;
};

type ToolCallSummary = {
  name: string;
  /** Arguments stringified and truncated to keep the log lean. */
  args: string;
};

type ToolResultSummary = {
  name: string;
  result: string;
};

const MAX_STRING = 2_000;

function truncate(value: string, max = MAX_STRING): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…(+${value.length - max} chars)`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function emit(event: Record<string, unknown>) {
  console.log(`[ai] ${safeStringify(event)}`);
}

export function newTraceId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Returns a compact summary of the message (text + image count). */
function summarizeMessage(message: ModelMessage) {
  const role = message.role;
  if (typeof message.content === "string") {
    return { role, text: truncate(message.content), images: 0 };
  }
  let text = "";
  let images = 0;
  let other = 0;
  for (const part of message.content) {
    if (part.type === "text") {
      text += (text ? "\n" : "") + part.text;
    } else if (part.type === "image" || part.type === "file") {
      images += 1;
    } else if (part.type === "tool-call" || part.type === "tool-result") {
      other += 1;
    } else {
      other += 1;
    }
  }
  return {
    role,
    text: text ? truncate(text) : undefined,
    images: images || undefined,
    parts: other || undefined,
  };
}

export function logAIRequest(opts: BaseFields & { messages: ModelMessage[] }) {
  const last = opts.messages[opts.messages.length - 1];
  emit({
    kind: "request",
    traceId: opts.traceId,
    source: opts.source,
    userId: opts.userId,
    model: opts.model,
    messageCount: opts.messages.length,
    lastMessage: last ? summarizeMessage(last) : undefined,
  });
}

export function logAIStep(
  opts: BaseFields & {
    stepNumber: number;
    text: string;
    toolCalls: ToolCallSummary[];
    toolResults: ToolResultSummary[];
    finishReason: string;
    usage: LanguageModelUsage;
  },
) {
  const cost = calculateCost(opts.model, opts.usage);
  emit({
    kind: "step",
    traceId: opts.traceId,
    source: opts.source,
    userId: opts.userId,
    model: opts.model,
    stepNumber: opts.stepNumber,
    finishReason: opts.finishReason,
    text: opts.text ? truncate(opts.text) : undefined,
    toolCalls: opts.toolCalls.length ? opts.toolCalls : undefined,
    toolResults: opts.toolResults.length ? opts.toolResults : undefined,
    tokens: {
      input: cost.inputTokens,
      cachedInput: cost.cachedInputTokens,
      output: cost.outputTokens,
      reasoning: cost.reasoningTokens || undefined,
      total: cost.totalTokens,
    },
    cost: {
      input: formatUSD(cost.inputUSD),
      cachedInput: formatUSD(cost.cachedInputUSD),
      output: formatUSD(cost.outputUSD),
      total: formatUSD(cost.totalUSD),
      pricingMissing: cost.pricing == null ? true : undefined,
    },
  });
  return cost;
}

export function logAIFinish(
  opts: BaseFields & {
    finishReason: string;
    text: string;
    totalUsage: LanguageModelUsage;
    /** Number of LLM steps performed. */
    steps: number;
    /** Wall-clock latency in ms. */
    latencyMs: number;
  },
) {
  const cost = calculateCost(opts.model, opts.totalUsage);
  emit({
    kind: "finish",
    traceId: opts.traceId,
    source: opts.source,
    userId: opts.userId,
    model: opts.model,
    finishReason: opts.finishReason,
    steps: opts.steps,
    latencyMs: opts.latencyMs,
    text: opts.text ? truncate(opts.text) : undefined,
    tokens: {
      input: cost.inputTokens,
      cachedInput: cost.cachedInputTokens,
      output: cost.outputTokens,
      reasoning: cost.reasoningTokens || undefined,
      total: cost.totalTokens,
    },
    cost: {
      input: formatUSD(cost.inputUSD),
      cachedInput: formatUSD(cost.cachedInputUSD),
      output: formatUSD(cost.outputUSD),
      total: formatUSD(cost.totalUSD),
      pricingMissing: cost.pricing == null ? true : undefined,
    },
  });
  return cost;
}

export function summarizeToolCalls(
  toolCalls: Array<{ toolName: string; input: unknown }>,
): ToolCallSummary[] {
  return toolCalls.map((c) => ({
    name: c.toolName,
    args: truncate(safeStringify(c.input)),
  }));
}

export function summarizeToolResults(
  toolResults: Array<{ toolName: string; output: unknown }>,
): ToolResultSummary[] {
  return toolResults.map((r) => ({
    name: r.toolName,
    result: truncate(safeStringify(r.output)),
  }));
}

export type { CostBreakdown };
