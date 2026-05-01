import type { ChartSpec } from "@/lib/ai/chart-spec";

/**
 * Renders ChartSpec as a PNG URL via QuickChart (Chart.js).
 *
 * Privacy: the chart JSON is sent as a query parameter to the configured host.
 * Self-host QuickChart or set CLARA_CHART_IMAGE_URL="" (empty) to disable URLs.
 * @see https://quickchart.io/documentation/
 */

const DEFAULT_BASE = "https://quickchart.io/chart";

const PALETTE = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#14b8a6",
  "#f97316",
];

function quickChartBase(): string {
  const raw = process.env.CLARA_QUICKCHART_BASE_URL?.trim();
  return raw && /^https:\/\//i.test(raw) ? raw.replace(/\/+$/, "") : DEFAULT_BASE;
}

export function isOutboundChartImageEnabled(): boolean {
  const v = process.env.CLARA_OUTBOUND_CHART_IMAGES?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off") return false;
  return true;
}

function buildChartJsConfig(spec: ChartSpec): Record<string, unknown> {
  const titleText =
    spec.currency ? `${spec.title} (${spec.currency})` : spec.title;

  const titlePlugin = {
    display: true,
    text: titleText.slice(0, 120),
    font: { size: 15 },
    padding: { bottom: 8 },
  };

  if (spec.kind === "pie") {
    const slices = spec.slices ?? [];
    return {
      type: "pie",
      data: {
        labels: slices.map((s) => s.name.slice(0, 48)),
        datasets: [
          {
            data: slices.map((s) => s.value),
            backgroundColor: slices.map(
              (s, i) => s.color ?? PALETTE[i % PALETTE.length],
            ),
          },
        ],
      },
      options: {
        plugins: {
          title: titlePlugin,
          legend: { position: "bottom", labels: { boxWidth: 12 } },
        },
      },
    };
  }

  const xValues = (spec.xValues ?? []).map((x) => x.slice(0, 32));
  const rawSeries = spec.series ?? [];
  const chartJsType = spec.kind === "area" ? "line" : spec.kind;

  const datasets = rawSeries.map((s, i) => {
    const color = s.color ?? PALETTE[i % PALETTE.length];
    if (spec.kind === "bar") {
      return {
        label: s.label.slice(0, 48),
        data: s.values,
        backgroundColor: `${color}e6`,
        borderColor: color,
        borderWidth: 1,
      };
    }
    return {
      label: s.label.slice(0, 48),
      data: s.values,
      borderColor: color,
      backgroundColor: spec.kind === "area" ? `${color}40` : undefined,
      fill: spec.kind === "area",
      tension: spec.kind === "line" || spec.kind === "area" ? 0.2 : 0,
      borderWidth: 2,
    };
  });

  const stacked = spec.stacked === true;

  return {
    type: chartJsType,
    data: { labels: xValues, datasets },
    options: {
      indexAxis: spec.horizontal ? "y" : "x",
      responsive: true,
      plugins: {
        title: titlePlugin,
        legend: { position: "bottom", labels: { boxWidth: 12 } },
      },
      scales: {
        x: {
          stacked,
          ...(spec.xLabel
            ? { title: { display: true, text: spec.xLabel.slice(0, 40) } }
            : {}),
        },
        y: {
          stacked,
          ...(spec.yLabel
            ? { title: { display: true, text: spec.yLabel.slice(0, 40) } }
            : {}),
        },
      },
    },
  };
}

/** Max GET length — QuickChart warns around 8k; stay conservative. */
const MAX_URL_CHARS = 6500;

/**
 * Returns HTTPS PNG URLs suitable for Telegram `photo`.
 */
export function chartSpecsToQuickChartUrls(specs: ChartSpec[]): string[] {
  if (!isOutboundChartImageEnabled() || specs.length === 0) return [];

  const base = quickChartBase();
  const urls: string[] = [];

  for (const spec of specs.slice(0, 5)) {
    try {
      const config = buildChartJsConfig(spec);
      const encoded = encodeURIComponent(JSON.stringify(config));
      let url = `${base}?c=${encoded}&w=640&h=420&f=png&devicePixelRatio=2`;

      if (url.length > MAX_URL_CHARS) {
        const smaller = {
          ...config,
          options: {
            ...(config.options as object),
            plugins: { title: { display: false }, legend: { display: false } },
          },
        };
        url = `${base}?c=${encodeURIComponent(JSON.stringify(smaller))}&w=520&h=320&f=png`;
      }
      if (url.length > MAX_URL_CHARS || !url.startsWith("https://")) continue;
      urls.push(url);
    } catch {
      // skip bad specs
    }
  }

  return urls;
}
