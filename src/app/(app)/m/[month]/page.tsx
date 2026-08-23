import { format } from "date-fns";
import { CalendarCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateMonthSection } from "@/components/create-month-section";
import { OpenBankingConnectCta } from "@/components/open-banking-connect-cta";
import { MonthDashboard } from "@/components/month-dashboard";
import { MonthPicker } from "@/components/month-picker";
import { PageContainer } from "@/components/page-container";
import { YearNavigation } from "@/components/year-navigation";
import { YearTimeline } from "@/components/year-timeline";
import { getOpenBankingCtaKind } from "@/lib/enable-banking/access";
import { pick } from "@/lib/i18n";
import { dateLocale } from "@/lib/i18n/format";
import { getLocale } from "@/lib/i18n/server";
import { findPreviousMonthWithRecord } from "@/lib/month-bucket";
import { loadMonthPageData } from "@/lib/month-page-data";
import {
  formatMonthKey,
  getCurrentMonthKey,
  isCurrentMonthKey,
  parseMonthKey,
} from "@/lib/months";
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

  const [data, previousRecord, yearTimeline, locale, openBankingCta] = await Promise.all([
    loadMonthPageData(userId, month),
    findPreviousMonthWithRecord(userId, monthStart),
    getYearTimelineData(userId, year),
    getLocale(),
    getOpenBankingCtaKind(userId),
  ]);
  const suggestedCopyFrom = previousRecord ? formatMonthKey(previousRecord.month) : null;
  const monthDescription = pick(locale, {
    es: "Marcá qué gastos del mes pagaste. Los cambios solo aplican a este mes.",
    en: "Tick which expenses you paid this month. Changes apply only here.",
  });
  const monthTitle = format(monthStart, "MMMM yyyy", { locale: dateLocale(locale) });
  const isCurrent = isCurrentMonthKey(month);
  const goToCurrentLabel = pick(locale, {
    es: "Ir al mes actual",
    en: "Go to current month",
  });
  const viewingNotCurrentText = pick(locale, {
    es: "Estás viendo otro mes.",
    en: "You're viewing a different month.",
  });

  return (
    <PageContainer className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-2xl font-semibold capitalize sm:text-3xl">
              {monthTitle}
            </h1>
            <p className="text-muted-foreground text-sm">{monthDescription}</p>
          </div>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <YearNavigation monthKey={month} />
            <MonthPicker month={month} />
          </div>
        </div>

        {!isCurrent ? (
          <Link
            href={`/m/${getCurrentMonthKey()}`}
            className="bg-muted/60 hover:bg-muted text-foreground/80 hover:text-foreground inline-flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed px-4 py-2.5 text-sm transition-colors sm:w-auto"
          >
            <span className="inline-flex items-center gap-2">
              <CalendarCheck className="text-primary size-4" />
              {viewingNotCurrentText}
            </span>
            <span className="text-primary font-semibold">{goToCurrentLabel} →</span>
          </Link>
        ) : null}

        <YearTimeline
          year={year}
          activeMonth={month}
          months={yearTimeline.months}
          currency={data.primaryCurrency}
        />
      </div>

      {openBankingCta ? <OpenBankingConnectCta kind={openBankingCta} /> : null}

      {data.hasRecord ? (
        <MonthDashboard data={data} />
      ) : (
        <CreateMonthSection month={month} suggestedCopyFrom={suggestedCopyFrom} />
      )}
    </PageContainer>
  );
}
