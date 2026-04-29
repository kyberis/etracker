import { format } from "date-fns";
import { notFound } from "next/navigation";

import { CreateMonthSection } from "@/components/create-month-section";
import { MonthDashboard } from "@/components/month-dashboard";
import { MonthPicker } from "@/components/month-picker";
import { PageContainer } from "@/components/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { YearNavigation } from "@/components/year-navigation";
import { YearTimeline } from "@/components/year-timeline";
import { pick } from "@/lib/i18n";
import { dateLocale } from "@/lib/i18n/format";
import { getLocale } from "@/lib/i18n/server";
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

  const [data, previousRecord, yearTimeline, locale] = await Promise.all([
    loadMonthPageData(userId, month),
    findPreviousMonthWithRecord(userId, monthStart),
    getYearTimelineData(userId, year),
    getLocale(),
  ]);
  const suggestedCopyFrom = previousRecord ? formatMonthKey(previousRecord.month) : null;
  const yearLinkedLabel = pick(locale, {
    es: "Año vinculado al mes",
    en: "Year linked to month",
  });
  const monthDescription = pick(locale, {
    es: "Marca qué gastos del mes pagaste. Los cambios solo aplican a este mes.",
    en: "Tick which expenses you paid this month. Changes apply only here.",
  });

  return (
    <PageContainer className="space-y-6">
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <YearNavigation monthKey={month} />
          <p className="text-muted-foreground text-center text-sm sm:text-left">
            {yearLinkedLabel}
          </p>
        </div>
        <YearTimeline
          year={year}
          activeMonth={month}
          months={yearTimeline.months}
          currency={data.primaryCurrency}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {format(monthStart, "MMMM yyyy", { locale: dateLocale(locale) })}
          </CardTitle>
          <MonthPicker month={month} />
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          {monthDescription}
        </CardContent>
      </Card>
      {data.hasRecord ? (
        <MonthDashboard data={data} />
      ) : (
        <CreateMonthSection month={month} suggestedCopyFrom={suggestedCopyFrom} />
      )}
    </PageContainer>
  );
}
