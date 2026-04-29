"use client";

import { format, parse } from "date-fns";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useBalance } from "@/components/balance-provider";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { dateLocale } from "@/lib/i18n/format";
import { useLocale, useT, useTx } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

type MonthDrawerContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Optional override of the month shown in the drawer (defaults to the active balance month). */
  setMonth: (month: string) => void;
};

const Ctx = createContext<MonthDrawerContextValue | null>(null);

const MONTH_RE = /^\d{4}-\d{2}$/;

function shiftMonth(monthKey: string, delta: number): string {
  const d = parse(monthKey, "yyyy-MM", new Date());
  d.setUTCMonth(d.getUTCMonth() + delta);
  return format(d, "yyyy-MM");
}

export function MonthDrawerProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { setMonth: setBalanceMonth } = useBalance();

  const setMonth = useCallback(
    (month: string) => {
      if (!MONTH_RE.test(month)) return;
      setBalanceMonth(month);
    },
    [setBalanceMonth],
  );

  // Lock body scroll while open. We rely on a class instead of inline styles
  // so other consumers can still toggle their own scroll behavior.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const value = useMemo<MonthDrawerContextValue>(
    () => ({ open, setOpen, setMonth }),
    [open, setMonth],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <MonthDrawerSheet />
    </Ctx.Provider>
  );
}

export function useMonthDrawer(): MonthDrawerContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMonthDrawer must be used inside <MonthDrawerProvider>.");
  return ctx;
}

function MonthDrawerSheet() {
  const { open, setOpen } = useMonthDrawer();
  const balance = useBalance();
  const locale = useLocale();
  const t = useT();
  const tx = useTx();
  const monthKey = balance.month;
  const monthLabel = useMemo(
    () =>
      format(parse(monthKey, "yyyy-MM", new Date()), "MMMM yyyy", {
        locale: dateLocale(locale),
      }),
    [monthKey, locale],
  );

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label={t.common.close}
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Sheet: bottom on mobile, right on desktop */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t.month.monthFor(monthLabel)}
        className={cn(
          "bg-background text-foreground fixed z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-out",
          // Mobile: bottom sheet
          "inset-x-0 bottom-0 max-h-[88vh] rounded-t-[2rem]",
          open ? "translate-y-0" : "translate-y-full",
          // Desktop: right side panel
          "sm:inset-y-0 sm:right-0 sm:left-auto sm:bottom-auto sm:max-h-none sm:w-[440px] sm:rounded-l-[2rem] sm:rounded-tr-none",
          open ? "sm:translate-x-0" : "sm:translate-y-0 sm:translate-x-full",
        )}
      >
        <div className="bg-foreground/15 mx-auto mt-3 mb-1 h-1.5 w-12 shrink-0 rounded-full sm:hidden" />

        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-1.5">
            <span className="sticker sticker-lime self-start">
              {tx({ es: "tu mes", en: "your month" })}
            </span>
            <h2 className="display text-2xl capitalize">{monthLabel}</h2>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="bg-card rounded-full border-transparent shadow-sm hover:bg-card"
              aria-label={tx({ es: "Mes anterior", en: "Previous month" })}
              onClick={() => balance.setMonth(shiftMonth(monthKey, -1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="bg-card rounded-full border-transparent shadow-sm hover:bg-card"
              aria-label={tx({ es: "Mes siguiente", en: "Next month" })}
              onClick={() => balance.setMonth(shiftMonth(monthKey, 1))}
            >
              <ChevronRight />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              className="bg-card rounded-full border-transparent shadow-sm hover:bg-card"
              aria-label={t.common.close}
              onClick={() => setOpen(false)}
            >
              <X />
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-2 sm:px-6">
          <div className="ink-card ink-glow relative px-5 py-5">
            <p className="text-lime text-[10px] font-bold uppercase tracking-[0.22em]">
              {tx({ es: "Balance del mes", en: "Month balance" })}
            </p>
            <p
              className={cn(
                "num mt-2 text-4xl",
                balance.balance >= 0 ? "text-lime" : "text-hotpink",
              )}
            >
              {formatCurrency(balance.balance, balance.primaryCurrency, locale)}
            </p>
            <p className="mt-1 text-xs text-white/65">
              {tx({
                es: `Ingreso − planificado, en ${monthLabel}.`,
                en: `Income − planned, in ${monthLabel}.`,
              })}
            </p>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Stat
              label={t.month.summaryIncome}
              value={balance.income}
              tone="good"
              emoji="💰"
              currency={balance.primaryCurrency}
              locale={locale}
            />
            <Stat
              label={t.month.summaryPlanned}
              value={balance.planned}
              tone="bad"
              emoji="🧾"
              currency={balance.primaryCurrency}
              locale={locale}
            />
            <Stat
              label={t.month.summaryPaid}
              value={balance.paid}
              emoji="✅"
              currency={balance.primaryCurrency}
              locale={locale}
            />
            <Stat
              label={t.month.summaryRemaining}
              value={balance.remaining}
              tone="warn"
              emoji="⏳"
              currency={balance.primaryCurrency}
              locale={locale}
            />
          </div>

          <div className="bg-lilac/30 ring-lilac/30 mt-5 rounded-3xl px-4 py-4 text-xs leading-relaxed ring-1">
            <span className="sticker sticker-violet">{tx({ es: "la regla", en: "the rule" })}</span>
            <p className="text-foreground/80 mt-2">
              {tx({
                es: (
                  <>
                    Solo las plantillas{" "}
                    <strong className="text-foreground">recurrentes</strong> al materializar un mes
                    generan líneas pendientes. Lo que cargues vos o el asistente durante el mes nace{" "}
                    <strong className="text-foreground">pagado</strong>, salvo aclaración.
                  </>
                ),
                en: (
                  <>
                    Only <strong className="text-foreground">recurring</strong> templates create
                    pending lines when a month is materialized. What you or the assistant add during
                    the month starts as <strong className="text-foreground">paid</strong> unless you
                    say otherwise.
                  </>
                ),
              })}
            </p>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            <Link
              href={`/m/${monthKey}`}
              onClick={() => setOpen(false)}
              className="gradient-lime text-ink inline-flex h-12 items-center justify-center rounded-full px-5 text-sm font-bold transition-transform hover:-translate-y-0.5"
            >
              {tx({ es: "Abrir mes completo →", en: "Open full month →" })}
            </Link>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground inline-flex h-10 items-center justify-center rounded-full text-sm transition-colors"
            >
              {tx({ es: "Volver al chat con Clara", en: "Back to chat with Clara" })}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
  emoji,
  currency,
  locale,
}: {
  label: string;
  value: number;
  tone?: "good" | "bad" | "warn";
  emoji?: string;
  currency: string;
  locale: Locale;
}) {
  const toneClass =
    tone === "good"
      ? "text-good"
      : tone === "bad"
        ? "text-bad"
        : tone === "warn"
          ? "text-warn"
          : "text-foreground";
  return (
    <div className="bg-card flex flex-col gap-1 rounded-3xl px-4 py-3.5 ring-1 ring-foreground/5">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.18em]">
          {label}
        </p>
        {emoji ? <span aria-hidden>{emoji}</span> : null}
      </div>
      <p className={cn("num mt-0.5 text-xl", toneClass)}>{formatCurrency(value, currency, locale)}</p>
    </div>
  );
}
