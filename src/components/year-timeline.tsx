"use client";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { formatCurrencyCompact } from "@/lib/format";
import type { YearMonthSlot } from "@/lib/year-timeline-data";
import { cn } from "@/lib/utils";

type YearTimelineProps = {
  year: number;
  activeMonth: string;
  months: YearMonthSlot[];
};

function yearScaleMax(months: YearMonthSlot[]) {
  let m = 0;
  for (const s of months) {
    if (!s.hasBucket) continue;
    m = Math.max(m, s.income, s.totalExpense);
  }
  return Math.max(m, 1e-9);
}

export function YearTimeline({ year, activeMonth, months }: YearTimelineProps) {
  const scaleMax = yearScaleMax(months);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const activeId = `yt-${activeMonth}`;

  useEffect(() => {
    const el = document.getElementById(activeId);
    const sc = scrollerRef.current;
    if (!el || !sc) return;
    const r = sc.getBoundingClientRect();
    const re = el.getBoundingClientRect();
    if (re.left < r.left + 32 || re.right > r.right - 32) {
      el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }
  }, [activeId, year]);

  return (
    <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-sm">
      <div className="p-4 sm:p-5">
        {/* Header */}
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h2 className="text-foreground text-lg font-semibold tracking-tight">Flujo anual</h2>
            <p className="text-muted-foreground mt-0.5 text-sm">Ingreso vs gasto mensual</p>
          </div>
          <p className="text-muted-foreground text-sm font-medium tabular-nums">{year}</p>
        </div>

        {/* Legend */}
        <div className="text-muted-foreground mb-4 flex items-center gap-5 text-xs">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-emerald-600 dark:bg-emerald-500" />
            Ingreso
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-amber-500 dark:bg-amber-400" />
            Gasto
          </span>
        </div>

        {/* Chart */}
        <div
          ref={scrollerRef}
          className="max-w-full overflow-x-auto overflow-y-visible pb-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
        >
          <div className="min-w-[40rem]">
            {/* Y axis + plot area */}
            <div className="flex items-stretch">
              {/* Y axis labels */}
              <div
                className="text-muted-foreground flex w-12 shrink-0 flex-col items-end justify-between pr-3 pb-1 text-[11px] tabular-nums"
                aria-hidden
              >
                <span>{formatCurrencyCompact(scaleMax)}</span>
                <span>{formatCurrencyCompact(scaleMax * 0.5)}</span>
                <span>0</span>
              </div>

              {/* Plot */}
              <div className="relative min-h-0 flex-1">
                {/* Grid lines */}
                <div className="pointer-events-none absolute inset-0" aria-hidden>
                  <div className="border-border/30 absolute right-0 left-0 h-px border-t" style={{ top: "0%" }} />
                  <div className="border-border/30 absolute right-0 left-0 h-px border-t" style={{ top: "50%" }} />
                </div>

                {/* Bars */}
                <div className="relative z-[1] flex h-56 w-full items-end gap-0 sm:h-64">
                  {months.map((slot) => {
                    const hasD = slot.hasBucket && slot.balance !== null;
                    const inH = hasD ? (slot.income / scaleMax) * 100 : 0;
                    const outH = hasD ? (slot.totalExpense / scaleMax) * 100 : 0;
                    return (
                      <div
                        key={`bar-${slot.key}`}
                        className="flex h-full min-w-0 flex-1 items-end justify-center gap-1 px-1 sm:gap-1.5 sm:px-2"
                      >
                        <div className="flex h-full w-full max-w-5 flex-col justify-end sm:max-w-7">
                          {hasD ? (
                            <div
                              className="w-full rounded-t-sm bg-emerald-600 dark:bg-emerald-500"
                              style={{ height: `${Math.max(inH, 0.5)}%` }}
                            />
                          ) : (
                            <div className="bg-muted/50 h-px w-full rounded-full" />
                          )}
                        </div>
                        <div className="flex h-full w-full max-w-5 flex-col justify-end sm:max-w-7">
                          {hasD ? (
                            <div
                              className="w-full rounded-t-sm bg-amber-500 dark:bg-amber-400"
                              style={{ height: `${Math.max(outH, 0.5)}%` }}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* X axis line */}
                <div className="border-foreground/25 h-0 border-t-2" aria-hidden />
              </div>
            </div>

            {/* X axis labels */}
            <div className="flex items-start">
              <div className="w-12 shrink-0" />
              <div className="flex min-w-0 flex-1">
                {months.map((slot) => {
                  const hasBucket = slot.hasBucket;
                  const bal = slot.balance;
                  const hasData = hasBucket && bal !== null;
                  const isActive = slot.key === activeMonth;
                  const monthLabel = format(
                    new Date(Date.UTC(year, slot.month - 1, 1)),
                    "MMM",
                    { locale: es },
                  );
                  return (
                    <div
                      key={slot.key}
                      id={isActive ? activeId : undefined}
                      className="relative min-w-0 flex-1 snap-center"
                    >
                      <Link
                        href={`/m/${slot.key}`}
                        scroll={false}
                        className={cn(
                          "hover:bg-muted/50 block rounded-b-md px-0.5 pt-2.5 pb-1.5 text-center transition-colors",
                          isActive && "bg-primary/[0.07]",
                        )}
                        aria-label={
                          hasData
                            ? `${monthLabel} ${year}, ingreso ${formatCurrencyCompact(
                                slot.income,
                              )}, gasto ${formatCurrencyCompact(
                                slot.totalExpense,
                              )}, saldo ${formatCurrencyCompact(bal!)}. Ir al mes.`
                            : `${monthLabel} ${year}, sin planificación. Ir al mes.`
                        }
                      >
                        {slot.isCurrent && (
                          <span
                            className="bg-primary mx-auto mb-1 block h-1.5 w-1.5 rounded-full"
                            aria-hidden
                          />
                        )}
                        <p
                          className={cn(
                            "text-foreground/80 text-xs font-medium tracking-wide",
                            isActive && "text-foreground font-semibold",
                          )}
                        >
                          {monthLabel}
                        </p>
                        {hasData ? (
                          <p
                            className={cn(
                              "mt-1 text-[10px] font-medium tabular-nums",
                              bal! >= 0
                                ? "text-emerald-600 dark:text-emerald-400"
                                : "text-rose-600 dark:text-rose-400",
                            )}
                          >
                            {bal! > 0 ? "+" : ""}
                            {formatCurrencyCompact(bal!)}
                          </p>
                        ) : (
                          <p className="text-muted-foreground/40 mt-1 text-[10px]">—</p>
                        )}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
