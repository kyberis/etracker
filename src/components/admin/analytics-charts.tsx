"use client";

import {
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

import { useLocale } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/i18n/format";
import type {
  AiSeriesPoint,
  DauPoint,
  ModelUsage,
} from "@/lib/analytics";

/**
 * Client-side recharts wrappers for the admin analytics dashboard. Kept in
 * one file so the only "use client" boundary lives next to the charts and
 * the page component stays a Server Component (data is passed as props).
 */

const PALETTE = [
  "#0f766e",
  "#f59e0b",
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

function color(i: number): string {
  return PALETTE[i % PALETTE.length];
}

function formatDayTick(day: string): string {
  // Shorten ISO `YYYY-MM-DD` to `MM-DD` for axis density.
  return day.slice(5);
}

function useFormatters() {
  const locale = useLocale();
  const loc = intlLocale(locale);
  const num = (v: number) =>
    Number(v).toLocaleString(loc, { maximumFractionDigits: 0 });
  const usd = (v: number) =>
    `$${Number(v).toLocaleString(loc, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })}`;
  return { num, usd };
}

export function ActiveUsersChart({
  data,
  label,
}: {
  data: DauPoint[];
  label: string;
}) {
  const { num } = useFormatters();
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis
            dataKey="day"
            tickFormatter={formatDayTick}
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis tickFormatter={num} tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            formatter={(v: unknown) => (typeof v === "number" ? num(v) : "")}
            contentStyle={{ fontSize: 12 }}
          />
          <Line
            name={label}
            type="monotone"
            dataKey="dau"
            stroke={color(0)}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MessagesChart({
  data,
  label,
}: {
  data: AiSeriesPoint[];
  label: string;
}) {
  const { num } = useFormatters();
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis
            dataKey="day"
            tickFormatter={formatDayTick}
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis tickFormatter={num} tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            formatter={(v: unknown) => (typeof v === "number" ? num(v) : "")}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar
            name={label}
            dataKey="messages"
            fill={color(0)}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TokensChart({
  data,
  inputLabel,
  outputLabel,
}: {
  data: AiSeriesPoint[];
  inputLabel: string;
  outputLabel: string;
}) {
  const { num } = useFormatters();
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis
            dataKey="day"
            tickFormatter={formatDayTick}
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis tickFormatter={num} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(v: unknown) => (typeof v === "number" ? num(v) : "")}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            name={inputLabel}
            dataKey="inputTokens"
            stackId="t"
            fill={color(2)}
          />
          <Bar
            name={outputLabel}
            dataKey="outputTokens"
            stackId="t"
            fill={color(1)}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CostChart({
  data,
  label,
}: {
  data: AiSeriesPoint[];
  label: string;
}) {
  const { usd } = useFormatters();
  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.08)" />
          <XAxis
            dataKey="day"
            tickFormatter={formatDayTick}
            tick={{ fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis tickFormatter={usd} tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(v: unknown) => (typeof v === "number" ? usd(v) : "")}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar
            name={label}
            dataKey="costUSD"
            fill={color(3)}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ByModelChart({ data }: { data: ModelUsage[] }) {
  const { num } = useFormatters();
  if (data.length === 0) return null;
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
          <Pie
            data={data}
            dataKey="messages"
            nameKey="model"
            cx="50%"
            cy="50%"
            outerRadius="80%"
            innerRadius="45%"
            paddingAngle={2}
          >
            {data.map((slice, i) => (
              <Cell key={`${slice.model}-${i}`} fill={color(i)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: unknown) => (typeof v === "number" ? num(v) : "")}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
