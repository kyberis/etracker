import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";

import { formatCurrency } from "@/lib/format";
import type { YearMonthSlot } from "@/lib/year-timeline-data";
import { cn } from "@/lib/utils";

type YearTimelineProps = {
  year: number;
  activeMonth: string;
  months: YearMonthSlot[];
};

function cellClass(slot: YearMonthSlot) {
  if (slot.variant === "empty") {
    return "border-border bg-muted/50 text-muted-foreground";
  }
  if (slot.variant === "future") {
    return "border-border bg-muted/40 text-foreground";
  }
  if (slot.balance !== null && slot.balance >= 0) {
    return "border-emerald-500/50 bg-emerald-500/10 text-foreground";
  }
  return "border-red-500/50 bg-red-500/10 text-foreground";
}

export function YearTimeline({ year, activeMonth, months }: YearTimelineProps) {
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        Ingreso y gasto (planificados) por mes. Verde = saldo ≥ 0, rojo = negativo, gris = sin mes o mes
        futuro con proyección.
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12">
        {months.map((slot) => {
          const isActive = slot.key === activeMonth;
          return (
            <Link
              key={slot.key}
              href={`/m/${slot.key}`}
              className={cn(
                "block rounded-md border p-1.5 text-center text-xs transition hover:opacity-90",
                cellClass(slot),
                isActive && "ring-primary ring-2",
                slot.isCurrent && "ring-foreground/20 ring-1",
              )}
            >
              <div className="font-medium">
                {format(new Date(Date.UTC(year, slot.month - 1, 1)), "MMM", { locale: es })}
              </div>
              {slot.hasBucket ? (
                <>
                  <div className="text-[10px] leading-tight tabular-nums">
                    in {formatCurrency(slot.income)}
                  </div>
                  <div className="text-[10px] leading-tight tabular-nums">
                    out {formatCurrency(slot.totalExpense)}
                  </div>
                </>
              ) : (
                <div className="text-muted-foreground text-[10px]">—</div>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
