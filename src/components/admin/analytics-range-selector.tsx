"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { cn } from "@/lib/utils";

const OPTIONS = [30, 90, 180] as const;

export function AnalyticsRangeSelector({
  current,
  label,
  optionLabels,
}: {
  current: number;
  label: string;
  optionLabels: Record<(typeof OPTIONS)[number], string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  function setRange(days: number) {
    const next = new URLSearchParams(params.toString());
    next.set("days", String(days));
    startTransition(() => {
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div
        role="tablist"
        aria-label={label}
        className="inline-flex overflow-hidden rounded-md ring-1 ring-foreground/10"
      >
        {OPTIONS.map((opt) => {
          const active = opt === current;
          return (
            <button
              key={opt}
              role="tab"
              aria-selected={active}
              type="button"
              disabled={pending}
              onClick={() => !active && setRange(opt)}
              className={cn(
                "px-3 py-1.5 text-xs transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "hover:bg-muted/60",
                pending && "opacity-60",
              )}
            >
              {optionLabels[opt]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
