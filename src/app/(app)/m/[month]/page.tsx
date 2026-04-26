import { format } from "date-fns";
import { notFound } from "next/navigation";

import { CreateMonthSection } from "@/components/create-month-section";
import { MonthDashboard } from "@/components/month-dashboard";
import { MonthPicker } from "@/components/month-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { YearNavigation } from "@/components/year-navigation";
import { YearTimeline } from "@/components/year-timeline";
import { findPreviousMonthWithRecord } from "@/lib/month-bucket";
import { loadMonthPageData } from "@/lib/month-page-data";
import { formatMonthKey, parseMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";
import { getYearTimelineData } from "@/lib/year-timeline-data";

type PageProps = {
  params: Promise<{ month: string }>;
};

export default async function MonthPage({ params }: PageProps) {
  const { month } = await params;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    notFound();
  }
  let monthStart: Date;
  try {
    monthStart = parseMonthKey(month);
  } catch {
    notFound();
    return null;
  }

  const userId = await requireUserId();
  const year = monthStart.getUTCFullYear();

  const [data, previousRecord, yearTimeline] = await Promise.all([
    loadMonthPageData(userId, month),
    findPreviousMonthWithRecord(userId, monthStart),
    getYearTimelineData(userId, year),
  ]);
  const suggestedCopyFrom = previousRecord ? formatMonthKey(previousRecord.month) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <YearNavigation monthKey={month} />
          <p className="text-muted-foreground text-center text-sm sm:text-left">Año vinculado al mes</p>
        </div>
        <YearTimeline year={year} activeMonth={month} months={yearTimeline.months} />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{format(monthStart, "MMMM yyyy")}</CardTitle>
          <MonthPicker month={month} />
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Marca qué gastos del mes pagaste. Los cambios solo aplican a este mes.
        </CardContent>
      </Card>
      {data.hasRecord ? (
        <MonthDashboard data={data} />
      ) : (
        <CreateMonthSection month={month} suggestedCopyFrom={suggestedCopyFrom} />
      )}
    </div>
  );
}
