import { describe, expect, it } from "vitest";

import type { ChartSpec } from "@/lib/ai/chart-spec";

import { extractRenderChartSpecsFromSteps } from "./extract-render-chart-specs";

describe("extractRenderChartSpecsFromSteps", () => {
  it("collects renderChart specs across steps", () => {
    const pie: ChartSpec = {
      kind: "pie",
      title: "Test",
      slices: [
        { name: "A", value: 1 },
        { name: "B", value: 2 },
      ],
    };

    const steps = [
      {
        toolResults: [
          { toolName: "other", result: {} },
          { toolName: "renderChart", result: { ok: true, spec: pie } },
        ],
      },
      {
        toolResults: [
          { toolName: "renderChart", output: { ok: true, spec: pie } },
        ],
      },
    ];

    const got = extractRenderChartSpecsFromSteps(steps);
    expect(got).toHaveLength(2);
    expect(got[0].kind).toBe("pie");
  });

  it("returns empty for missing steps", () => {
    expect(extractRenderChartSpecsFromSteps(undefined)).toEqual([]);
  });
});
