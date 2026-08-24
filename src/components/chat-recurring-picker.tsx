"use client";

import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";

import type { RecurringCandidatesSpec } from "@/lib/ai/recurring-candidates-spec";
import { useLocale, useTx } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

/**
 * Interactive checklist emitted by the `proposeRecurringTemplates` tool.
 * On confirm, creates `Expense` templates via `/api/expenses/bulk` — no
 * second agent turn, so large picks stay reliable.
 */
export function ChatRecurringPicker({
  spec,
}: {
  spec: RecurringCandidatesSpec;
}) {
  const tr = useTx();
  const locale = useLocale();
  const moneyLoc = intlLocale(locale);

  const initialSelected = useMemo(() => {
    const set = new Set<string>();
    for (const c of spec.candidates) {
      if (c.suggested !== false) set.add(c.id);
    }
    return set;
  }, [spec.candidates]);

  const [selected, setSelected] = useState<Set<string>>(initialSelected);
  const [submitting, setSubmitting] = useState(false);
  const [doneNames, setDoneNames] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    if (doneNames) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(on: boolean) {
    if (doneNames) return;
    setSelected(
      on ? new Set(spec.candidates.map((c) => c.id)) : new Set(),
    );
  }

  async function confirm() {
    if (submitting || doneNames) return;
    const picks = spec.candidates.filter((c) => selected.has(c.id));
    if (picks.length === 0) {
      setError(
        tr({
          es: "Marcá al menos uno.",
          en: "Pick at least one.",
        }),
      );
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/expenses/bulk", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templates: picks.map((c) => ({
            name: c.name,
            amount: c.amount,
            bankId: c.bankId,
            isRecurring: true,
            startMonth: c.startMonth,
            endMonth: c.endMonth ?? undefined,
            category: c.category ?? "OTROS",
          })),
        }),
      });
      const payload = (await res.json()) as {
        error?: string;
        expenses?: { name: string }[];
      };
      if (!res.ok) {
        setError(
          payload.error ??
            tr({
              es: "No pude crear las plantillas. Probá de nuevo.",
              en: "Couldn't create the templates. Try again.",
            }),
        );
        return;
      }
      setDoneNames((payload.expenses ?? picks).map((e) => e.name));
    } catch {
      setError(
        tr({
          es: "No pude crear las plantillas. Probá de nuevo.",
          en: "Couldn't create the templates. Try again.",
        }),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (doneNames) {
    return (
      <div className="bg-lime/15 ring-lime/30 w-full min-w-[16rem] max-w-md space-y-2 rounded-2xl px-3 py-3 ring-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          <Check className="text-lime size-4 shrink-0" aria-hidden />
          {tr({
            es: `Listo: ${doneNames.length} plantilla${doneNames.length === 1 ? "" : "s"} recurrente${doneNames.length === 1 ? "" : "s"}.`,
            en: `Done: ${doneNames.length} recurring template${doneNames.length === 1 ? "" : "s"}.`,
          })}
        </p>
        <ul className="text-muted-foreground list-inside list-disc text-xs">
          {doneNames.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    );
  }

  const allOn = selected.size === spec.candidates.length;

  return (
    <div className="bg-cream/60 ring-foreground/10 w-full min-w-[16rem] max-w-md space-y-3 rounded-2xl px-3 py-3 ring-1">
      <div>
        <p className="text-sm font-semibold">{spec.title}</p>
        {spec.subtitle ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{spec.subtitle}</p>
        ) : null}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => selectAll(!allOn)}
          className="text-lilac text-xs font-semibold underline-offset-2 hover:underline"
        >
          {allOn
            ? tr({ es: "Desmarcar todos", en: "Uncheck all" })
            : tr({ es: "Marcar todos", en: "Check all" })}
        </button>
        <span className="text-muted-foreground text-xs tabular-nums">
          {selected.size}/{spec.candidates.length}
        </span>
      </div>

      <ul className="max-h-72 space-y-1.5 overflow-y-auto">
        {spec.candidates.map((c) => {
          const checked = selected.has(c.id);
          const amountLabel = c.amount.toLocaleString(moneyLoc, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          return (
            <li key={c.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-2.5 rounded-xl px-2 py-2 transition-colors",
                  checked ? "bg-lilac/10" : "hover:bg-foreground/5",
                )}
              >
                <input
                  type="checkbox"
                  className="border-foreground/30 text-lilac mt-0.5 size-4 rounded"
                  checked={checked}
                  onChange={() => toggle(c.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-semibold">{c.name}</span>
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {amountLabel}
                      {c.bankName ? ` · ${c.bankName}` : ""}
                    </span>
                  </span>
                  {c.reason ? (
                    <span className="text-muted-foreground mt-0.5 block text-[11px]">
                      {c.reason}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {error ? <p className="text-bad text-xs">{error}</p> : null}

      <button
        type="button"
        onClick={() => void confirm()}
        disabled={submitting || selected.size === 0}
        className="gradient-lime text-ink inline-flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold shadow-sm disabled:opacity-50"
      >
        {submitting ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : null}
        {tr({
          es:
            selected.size === 1
              ? "Crear 1 plantilla recurrente"
              : `Crear ${selected.size} plantillas recurrentes`,
          en:
            selected.size === 1
              ? "Create 1 recurring template"
              : `Create ${selected.size} recurring templates`,
        })}
      </button>
    </div>
  );
}
