import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { MonthPageDataWithRecord } from "@/lib/month-page-types";
import { cn } from "@/lib/utils";

type Props = {
  bankTotals: MonthPageDataWithRecord["bankTotals"];
  /** ISO 4217 currency for totals — always the user's primary. */
  primaryCurrency: string;
};

/**
 * Tarjetas resumen por banco: planeado vs gastado, con barra de progreso del
 * porcentaje pagado. Los datos vienen pre-calculados en `bankTotals` (todo en
 * la moneda principal vía `amountConverted`).
 *
 * Bancos sin gastos en el mes se filtran para no mostrar cards vacías.
 */
export function MonthBankTotals({ bankTotals, primaryCurrency }: Props) {
  const visible = bankTotals.filter((bank) => bank.planned > 0 || bank.paid > 0);
  if (visible.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-sm font-semibold">Totales por banco</h2>
        <span className="text-muted-foreground text-xs">planeado vs gastado</span>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {visible.map((bank) => {
          const pending = Math.max(0, bank.planned - bank.paid);
          const pct =
            bank.planned > 0 ? Math.min(100, Math.round((bank.paid / bank.planned) * 100)) : 0;
          const fullyPaid = pending === 0;
          return (
            <Card key={bank.bankId} className="gap-3" size="sm">
              <CardContent className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-heading truncate text-sm font-medium">{bank.bankName}</p>
                  {fullyPaid ? (
                    <span className="bg-good/15 text-good rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                      ✓ pagado
                    </span>
                  ) : (
                    <span className="bg-warn/15 text-warn rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide tabular-nums">
                      {formatCurrency(pending, primaryCurrency)} pend.
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.18em]">
                      Gastado
                    </p>
                    <p className="text-foreground text-base font-semibold tabular-nums">
                      {formatCurrency(bank.paid, primaryCurrency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.18em]">
                      Planeado
                    </p>
                    <p className="text-bad text-base font-semibold tabular-nums">
                      {formatCurrency(bank.planned, primaryCurrency)}
                    </p>
                  </div>
                </div>
                <div>
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-300",
                        fullyPaid ? "bg-good" : "bg-lime-deep",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p
                    className={cn(
                      "mt-1 text-[11px]",
                      fullyPaid ? "text-good" : "text-muted-foreground",
                    )}
                  >
                    {pct}% pagado
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
