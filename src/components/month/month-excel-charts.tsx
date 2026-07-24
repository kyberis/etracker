"use client";

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatCurrency } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MonthLineKind } from "@/lib/month-page-types";

const CAT_COLORS: Record<string, string> = {
  VIVIENDA: "#7ec83a",
  SERVICIOS: "#5c8a3a",
  TRANSPORTE: "#3b82f6",
  ALIMENTACION: "#e0a03a",
  SALUD: "#e85a6b",
  EDUCACION: "#6366f1",
  ENTRETENIMIENTO: "#a855f7",
  SUSCRIPCIONES: "#c4a8f0",
  DEUDAS: "#ef4444",
  IMPUESTOS: "#78716c",
  AHORRO: "#14b8a6",
  REGALOS: "#f472b6",
  CRYPTO: "#8b5cf6",
  STOCK: "#0ea5e9",
  OTROS: "#5c5478",
};

type Props = {
  byCategory: Record<string, number>;
  byBank: Array<{ bankId: string; bankName: string; total: number; color?: string | null }>;
  byKind: { recurring: number; oneOff: number };
  top: Array<{ id: string; name: string; kind: MonthLineKind; effective: number }>;
  primaryCurrency: string;
  categoryLabel: (cat: string) => string;
};

export function MonthExcelCharts({
  byCategory,
  byBank,
  byKind,
  top,
  primaryCurrency,
  categoryLabel,
}: Props) {
  const t = useT();
  const locale = useLocale();
  const fmt = (n: number) => formatCurrency(n, primaryCurrency, locale);

  const catData = Object.entries(byCategory).map(([key, value]) => ({
    name: categoryLabel(key),
    value,
    fill: CAT_COLORS[key] ?? "#5c5478",
  }));

  const kindData = [
    { name: t.monthGrid.kindRecurring, value: byKind.recurring, fill: "#b8f06e" },
    { name: t.monthGrid.kindOneOff, value: byKind.oneOff, fill: "#ffc596" },
  ].filter((d) => d.value > 0);

  const empty = catData.length === 0 && byBank.length === 0;

  if (empty) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">{t.monthGrid.chartEmpty}</p>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ChartCard title={t.monthGrid.chartByCategory} hint={t.monthGrid.chartByCategoryHint}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={catData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>
              {catData.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => fmt(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t.monthGrid.chartByBank} hint={t.monthGrid.chartByBankHint}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={byBank.map((b) => ({ name: b.bankName, total: b.total, fill: b.color ?? "#7ec83a" }))}>
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Bar dataKey="total" radius={[8, 8, 0, 0]}>
              {byBank.map((b) => (
                <Cell key={b.bankId} fill={b.color ?? "#7ec83a"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t.monthGrid.chartByKind} hint={t.monthGrid.chartByKindHint}>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={kindData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>
              {kindData.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip formatter={(v) => fmt(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t.monthGrid.chartTop} hint={t.monthGrid.chartTopHint}>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            layout="vertical"
            data={top.map((l) => ({
              name: l.name.length > 18 ? `${l.name.slice(0, 16)}…` : l.name,
              total: l.effective,
              fill: l.kind === "RECURRING" ? "#7ec83a" : "#e0a03a",
            }))}
          >
            <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
            <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmt(Number(v))} />
            <Bar dataKey="total" radius={[0, 6, 6, 0]}>
              {top.map((l) => (
                <Cell key={l.id} fill={l.kind === "RECURRING" ? "#7ec83a" : "#e0a03a"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--border)] bg-white/80 p-4">
      <h3 className="font-display text-sm font-bold">{title}</h3>
      <p className="text-muted-foreground mb-2 text-xs">{hint}</p>
      {children}
    </div>
  );
}
