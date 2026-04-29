"use client";

import { addMonths, format, parse } from "date-fns";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useTx } from "@/lib/i18n/client";
import { getCurrentMonthKey, isCurrentMonthKey } from "@/lib/months";

type MonthPickerProps = {
  month: string;
};

export function MonthPicker({ month }: MonthPickerProps) {
  const router = useRouter();
  const tx = useTx();
  const current = parse(month, "yyyy-MM", new Date());
  const isCurrent = isCurrentMonthKey(month);

  const goToMonth = (offset: number) => {
    const target = format(addMonths(current, offset), "yyyy-MM");
    router.push(`/m/${target}`);
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => goToMonth(-1)}
        aria-label={tx({ es: "Mes anterior", en: "Previous month" })}
        className="rounded-full"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push(`/m/${getCurrentMonthKey()}`)}
        disabled={isCurrent}
        className="rounded-full"
      >
        <CalendarCheck className="size-4" />
        <span className="ml-1.5">{tx({ es: "Hoy", en: "Today" })}</span>
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        onClick={() => goToMonth(1)}
        aria-label={tx({ es: "Mes siguiente", en: "Next month" })}
        className="rounded-full"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
