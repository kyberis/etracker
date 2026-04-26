"use client";

import { addMonths, format, parse } from "date-fns";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

type MonthPickerProps = {
  month: string;
};

export function MonthPicker({ month }: MonthPickerProps) {
  const router = useRouter();
  const current = parse(month, "yyyy-MM", new Date());

  const goToMonth = (offset: number) => {
    const target = format(addMonths(current, offset), "yyyy-MM");
    router.push(`/m/${target}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => goToMonth(-1)}>
        Prev
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => router.push(`/m/${format(new Date(), "yyyy-MM")}`)}
      >
        Today
      </Button>
      <Button variant="outline" size="sm" onClick={() => goToMonth(1)}>
        Next
      </Button>
    </div>
  );
}
