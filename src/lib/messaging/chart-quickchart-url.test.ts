import { afterEach, describe, expect, it } from "vitest";

import type { ChartSpec } from "@/lib/ai/chart-spec";

import { chartSpecsToQuickChartUrls, isOutboundChartImageEnabled } from "./chart-quickchart-url";

describe("chartSpecsToQuickChartUrls", () => {
  const prevImg = process.env.CLARA_OUTBOUND_CHART_IMAGES;
  const prevBase = process.env.CLARA_QUICKCHART_BASE_URL;

  afterEach(() => {
    if (prevImg === undefined) delete process.env.CLARA_OUTBOUND_CHART_IMAGES;
    else process.env.CLARA_OUTBOUND_CHART_IMAGES = prevImg;
    if (prevBase === undefined) delete process.env.CLARA_QUICKCHART_BASE_URL;
    else process.env.CLARA_QUICKCHART_BASE_URL = prevBase;
  });

  it("returns [] when disabled via env", () => {
    process.env.CLARA_OUTBOUND_CHART_IMAGES = "0";
    const spec: ChartSpec = {
      kind: "pie",
      title: "X",
      slices: [{ name: "A", value: 1 }],
    };
    expect(chartSpecsToQuickChartUrls([spec])).toEqual([]);
    expect(isOutboundChartImageEnabled()).toBe(false);
  });

  it("returns https quickchart URLs for pie specs", () => {
    delete process.env.CLARA_OUTBOUND_CHART_IMAGES;
    const spec: ChartSpec = {
      kind: "pie",
      title: "By category",
      currency: "EUR",
      slices: [
        { name: "Rent", value: 800 },
        { name: "Food", value: 200 },
      ],
    };
    const urls = chartSpecsToQuickChartUrls([spec]);
    expect(urls.length).toBe(1);
    expect(urls[0]).toMatch(/^https:\/\/quickchart\.io\/chart\?c=/);
  });
});
