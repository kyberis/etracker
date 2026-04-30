import { chartSpecSchema, type ChartSpec } from "@/lib/ai/chart-spec";

type ToolResultLike = {
  toolName?: string;
  result?: unknown;
  output?: unknown;
};

function payloadFromToolResult(tr: unknown): unknown {
  if (!tr || typeof tr !== "object") return undefined;
  const o = tr as ToolResultLike;
  if ("result" in o && o.result !== undefined) return o.result;
  if ("output" in o && o.output !== undefined) return o.output;
  return undefined;
}

function parseChartPayload(payload: unknown): ChartSpec | null {
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Record<string, unknown>;
  if (rec.ok !== true || rec.spec === undefined) return null;
  const parsed = chartSpecSchema.safeParse(rec.spec);
  return parsed.success ? parsed.data : null;
}

/**
 * Collect every `renderChart` tool result across AI SDK `generateText` steps.
 */
export function extractRenderChartSpecsFromSteps(
  steps: unknown[] | undefined,
): ChartSpec[] {
  if (!steps?.length) return [];
  const out: ChartSpec[] = [];
  for (const step of steps) {
    if (!step || typeof step !== "object") continue;
    const toolResults = (step as { toolResults?: unknown[] }).toolResults;
    if (!Array.isArray(toolResults)) continue;
    for (const tr of toolResults) {
      const name =
        tr && typeof tr === "object"
          ? String((tr as { toolName?: string }).toolName ?? "")
          : "";
      if (name !== "renderChart") continue;
      const spec = parseChartPayload(payloadFromToolResult(tr));
      if (spec) out.push(spec);
    }
  }
  return out;
}
