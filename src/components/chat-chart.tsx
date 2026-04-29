"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ChartSpec } from "@/lib/ai/chart-spec";
import { intlLocale } from "@/lib/i18n/format";
import { useLocale } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";

/**
 * Render an in-chat chart from the `renderChart` tool spec.
 *
 * The component is opinionated: it picks reasonable defaults so the
 * agent can stay focused on the data shape (xValues/series/slices)
 * without micro-managing styling.
 */

const PALETTE = [
  "#0f766e", // brand teal
  "#f59e0b", // amber
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
];

function paletteColor(index: number): string {
  return PALETTE[index % PALETTE.length];
}

function formatChartCurrency(value: number, currency: string | undefined, locale: Locale): string {
  const loc = intlLocale(locale);
  if (!currency) {
    return value.toLocaleString(loc, {
      maximumFractionDigits: 2,
    });
  }
  try {
    return value.toLocaleString(loc, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    });
  } catch {
    return `${currency} ${value.toLocaleString(loc, {
      maximumFractionDigits: 2,
    })}`;
  }
}

function buildXYRows(spec: ChartSpec) {
  const xValues = spec.xValues ?? [];
  const series = spec.series ?? [];
  return xValues.map((label, i) => {
    const row: Record<string, string | number> = { __x: label };
    for (const s of series) {
      row[s.label] = s.values[i] ?? 0;
    }
    return row;
  });
}

export function ChatChart({ spec }: { spec: ChartSpec }) {
  const locale = useLocale();
  return (
    <figure className="bg-background text-foreground my-1 w-full max-w-[420px] rounded-xl border p-3 shadow-sm">
      <figcaption className="mb-2 space-y-0.5">
        <div className="text-sm font-semibold leading-tight">{spec.title}</div>
        {spec.description ? (
          <div className="text-muted-foreground text-xs leading-tight">
            {spec.description}
          </div>
        ) : null}
      </figcaption>
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {renderChart(spec, locale)}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

function renderChart(spec: ChartSpec, locale: Locale) {
  switch (spec.kind) {
    case "pie":
      return renderPie(spec, locale);
    case "line":
      return renderLine(spec, locale);
    case "area":
      return renderArea(spec, locale);
    case "bar":
    default:
      return renderBar(spec, locale);
  }
}

function tooltipFormatter(currency: string | undefined, locale: Locale) {
  return (value: unknown) => {
    if (typeof value === "number") return formatChartCurrency(value, currency, locale);
    if (typeof value === "string") return value;
    return "";
  };
}

function renderBar(spec: ChartSpec, locale: Locale) {
  const data = buildXYRows(spec);
  const series = spec.series ?? [];
  const horizontal = spec.horizontal ?? false;
  const stackId = spec.stacked ? "stack" : undefined;
  const tickFormatter = (v: number) => formatChartCurrency(v, spec.currency, locale);

  return (
    <BarChart
      data={data}
      layout={horizontal ? "vertical" : "horizontal"}
      margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
    >
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
      {horizontal ? (
        <>
          <XAxis
            type="number"
            tickFormatter={tickFormatter}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            type="category"
            dataKey="__x"
            tick={{ fontSize: 11 }}
            width={90}
          />
        </>
      ) : (
        <>
          <XAxis
            dataKey="__x"
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
          />
          <YAxis tickFormatter={tickFormatter} tick={{ fontSize: 11 }} />
        </>
      )}
      <Tooltip
        formatter={tooltipFormatter(spec.currency, locale)}
        contentStyle={{ fontSize: 12 }}
      />
      {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
      {series.map((s, i) => (
        <Bar
          key={s.label}
          dataKey={s.label}
          fill={s.color ?? paletteColor(i)}
          stackId={stackId}
          radius={[4, 4, 0, 0]}
        />
      ))}
    </BarChart>
  );
}

function renderLine(spec: ChartSpec, locale: Locale) {
  const data = buildXYRows(spec);
  const series = spec.series ?? [];
  const tickFormatter = (v: number) => formatChartCurrency(v, spec.currency, locale);

  return (
    <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
      <XAxis
        dataKey="__x"
        tick={{ fontSize: 11 }}
        interval="preserveStartEnd"
      />
      <YAxis tickFormatter={tickFormatter} tick={{ fontSize: 11 }} />
      <Tooltip
        formatter={tooltipFormatter(spec.currency, locale)}
        contentStyle={{ fontSize: 12 }}
      />
      {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
      {series.map((s, i) => (
        <Line
          key={s.label}
          type="monotone"
          dataKey={s.label}
          stroke={s.color ?? paletteColor(i)}
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 4 }}
        />
      ))}
    </LineChart>
  );
}

function renderArea(spec: ChartSpec, locale: Locale) {
  const data = buildXYRows(spec);
  const series = spec.series ?? [];
  const stackId = spec.stacked ? "stack" : undefined;
  const tickFormatter = (v: number) => formatChartCurrency(v, spec.currency, locale);

  return (
    <AreaChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
      <XAxis
        dataKey="__x"
        tick={{ fontSize: 11 }}
        interval="preserveStartEnd"
      />
      <YAxis tickFormatter={tickFormatter} tick={{ fontSize: 11 }} />
      <Tooltip
        formatter={tooltipFormatter(spec.currency, locale)}
        contentStyle={{ fontSize: 12 }}
      />
      {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
      {series.map((s, i) => {
        const color = s.color ?? paletteColor(i);
        return (
          <Area
            key={s.label}
            type="monotone"
            dataKey={s.label}
            stroke={color}
            fill={color}
            fillOpacity={0.25}
            strokeWidth={2}
            stackId={stackId}
          />
        );
      })}
    </AreaChart>
  );
}

function renderPie(spec: ChartSpec, locale: Locale) {
  const slices = spec.slices ?? [];
  return (
    <PieChart margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
      <Pie
        data={slices}
        dataKey="value"
        nameKey="name"
        cx="50%"
        cy="50%"
        outerRadius="80%"
        innerRadius="45%"
        paddingAngle={2}
        label={(entry: { name?: string }) => entry.name ?? ""}
        labelLine={false}
      >
        {slices.map((slice, i) => (
          <Cell
            key={`${slice.name}-${i}`}
            fill={slice.color ?? paletteColor(i)}
          />
        ))}
      </Pie>
      <Tooltip
        formatter={tooltipFormatter(spec.currency, locale)}
        contentStyle={{ fontSize: 12 }}
      />
      <Legend wrapperStyle={{ fontSize: 12 }} />
    </PieChart>
  );
}
