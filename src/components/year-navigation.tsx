"use client";

import { addYears, format, parse } from "date-fns";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type YearNavigationProps = {
  monthKey: string;
  className?: string;
};

export function YearNavigation({ monthKey, className }: YearNavigationProps) {
  const current = parse(monthKey, "yyyy-MM", new Date());
  const year = Number(format(current, "yyyy"));
  const prev = format(addYears(current, -1), "yyyy-MM");
  const next = format(addYears(current, 1), "yyyy-MM");

  return (
    <div className={cn("flex items-center justify-center gap-1", className)}>
      <Link
        href={`/m/${prev}`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
        aria-label="Año anterior"
      >
        {year - 1}
      </Link>
      <span className="text-muted-foreground px-1 text-sm">{year}</span>
      <Link
        href={`/m/${next}`}
        className={buttonVariants({ variant: "ghost", size: "sm" })}
        aria-label="Año siguiente"
      >
        {year + 1}
      </Link>
    </div>
  );
}
