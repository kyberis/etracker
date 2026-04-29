import { notFound } from "next/navigation";

import {
  ActiveUsersChart,
  ByModelChart,
  CostChart,
  MessagesChart,
  TokensChart,
} from "@/components/admin/analytics-charts";
import { AnalyticsRangeSelector } from "@/components/admin/analytics-range-selector";
import { PageContainer } from "@/components/page-container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAnalyticsBundle } from "@/lib/analytics";
import { getAuthSession } from "@/lib/auth";
import { getLocale, getT } from "@/lib/i18n/server";
import { intlLocale } from "@/lib/i18n/format";

const ALLOWED_RANGES = [30, 90, 180] as const;
type AllowedRange = (typeof ALLOWED_RANGES)[number];

function parseRange(raw: string | string[] | undefined): AllowedRange {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number.parseInt(value ?? "", 10);
  if ((ALLOWED_RANGES as readonly number[]).includes(n)) {
    return n as AllowedRange;
  }
  return 90;
}

/**
 * Internal admin analytics. Gated to `isAdmin` users — non-admins get a 404
 * (no enumeration). All data is server-rendered; charts are small client
 * components that render the JSON we pass down as props.
 */
export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string | string[] }>;
}) {
  const [session, t, locale, params] = await Promise.all([
    getAuthSession(),
    getT(),
    getLocale(),
    searchParams,
  ]);
  if (!session?.user?.isAdmin) {
    notFound();
  }

  const range = parseRange(params.days);
  const data = await getAnalyticsBundle(range);

  const loc = intlLocale(locale);
  const fmtNum = (n: number) =>
    n.toLocaleString(loc, { maximumFractionDigits: 0 });
  const fmtUsd = (n: number) =>
    `$${n.toLocaleString(loc, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })}`;

  const today = data.ai.length > 0 ? data.ai[data.ai.length - 1] : null;
  const todayMessages = today?.messages ?? 0;
  const todayInput = today?.inputTokens ?? 0;
  const todayOutput = today?.outputTokens ?? 0;
  const todayCost = today?.costUSD ?? 0;

  const exportHref = (dataset: string) =>
    `/api/admin/analytics/export?dataset=${dataset}&days=${range}`;

  return (
    <PageContainer className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold">
            {t.analytics.pageTitle}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t.analytics.pageDescription}
          </p>
          <p className="text-muted-foreground text-xs">
            {t.analytics.rangeFormat(data.range.from, data.range.to)}
          </p>
        </div>
        <AnalyticsRangeSelector
          current={range}
          label={t.analytics.rangeLabel}
          optionLabels={{
            30: t.analytics.range30,
            90: t.analytics.range90,
            180: t.analytics.range180,
          }}
        />
      </div>

      <section
        aria-label="KPIs"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        <KpiCard label={t.analytics.kpiDau} value={fmtNum(data.rolling.dau)} />
        <KpiCard label={t.analytics.kpiWau} value={fmtNum(data.rolling.wau)} />
        <KpiCard label={t.analytics.kpiMau} value={fmtNum(data.rolling.mau)} />
        <KpiCard
          label={t.analytics.kpiMessages}
          value={fmtNum(todayMessages)}
        />
        <KpiCard
          label={t.analytics.kpiTokens}
          value={fmtNum(todayInput + todayOutput)}
          hint={t.analytics.kpiTokensInOut(
            fmtNum(todayInput),
            fmtNum(todayOutput),
          )}
        />
        <KpiCard label={t.analytics.kpiCost} value={fmtUsd(todayCost)} />
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>{t.analytics.activeChartTitle}</CardTitle>
            <CardDescription>
              {t.analytics.rangeFormat(data.range.from, data.range.to)}
            </CardDescription>
          </div>
          <ExportLink
            href={exportHref("dau")}
            label={`${t.analytics.exportCsv} · ${t.analytics.exportDau}`}
          />
        </CardHeader>
        <CardContent>
          {data.active.some((p) => p.dau > 0) ? (
            <ActiveUsersChart data={data.active} label={t.analytics.seriesDau} />
          ) : (
            <EmptyState text={t.analytics.empty} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>{t.analytics.aiMessagesChartTitle}</CardTitle>
            <ExportLink
              href={exportHref("ai")}
              label={`${t.analytics.exportCsv} · ${t.analytics.exportAi}`}
            />
          </CardHeader>
          <CardContent>
            {data.totals.messages > 0 ? (
              <MessagesChart
                data={data.ai}
                label={t.analytics.seriesMessages}
              />
            ) : (
              <EmptyState text={t.analytics.empty} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.analytics.aiTokensChartTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.totals.inputTokens + data.totals.outputTokens > 0 ? (
              <TokensChart
                data={data.ai}
                inputLabel={t.analytics.seriesInputTokens}
                outputLabel={t.analytics.seriesOutputTokens}
              />
            ) : (
              <EmptyState text={t.analytics.empty} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t.analytics.aiCostChartTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            {data.totals.costUSD > 0 ? (
              <CostChart data={data.ai} label={t.analytics.seriesCost} />
            ) : (
              <EmptyState text={t.analytics.empty} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>{t.analytics.byModelTitle}</CardTitle>
            <ExportLink
              href={exportHref("by-model")}
              label={`${t.analytics.exportCsv} · ${t.analytics.exportByModel}`}
            />
          </CardHeader>
          <CardContent className="space-y-4">
            {data.byModel.length > 0 ? (
              <>
                <ByModelChart data={data.byModel} />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.analytics.columnsModel}</TableHead>
                      <TableHead className="text-right">
                        {t.analytics.columnsMessages}
                      </TableHead>
                      <TableHead className="text-right">
                        {t.analytics.columnsInput}
                      </TableHead>
                      <TableHead className="text-right">
                        {t.analytics.columnsOutput}
                      </TableHead>
                      <TableHead className="text-right">
                        {t.analytics.columnsCost}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.byModel.map((row) => (
                      <TableRow key={row.model}>
                        <TableCell className="font-mono text-xs">
                          {row.model}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.messages)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.inputTokens)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtNum(row.outputTokens)}
                        </TableCell>
                        <TableCell className="text-right">
                          {fmtUsd(row.costUSD)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            ) : (
              <EmptyState text={t.analytics.empty} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>{t.analytics.topUsersTitle}</CardTitle>
          <ExportLink
            href={exportHref("top-users")}
            label={`${t.analytics.exportCsv} · ${t.analytics.exportTopUsers}`}
          />
        </CardHeader>
        <CardContent>
          {data.topUsers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.analytics.columnsUser}</TableHead>
                  <TableHead className="text-right">
                    {t.analytics.columnsMessages}
                  </TableHead>
                  <TableHead className="text-right">
                    {t.analytics.columnsInput}
                  </TableHead>
                  <TableHead className="text-right">
                    {t.analytics.columnsOutput}
                  </TableHead>
                  <TableHead className="text-right">
                    {t.analytics.columnsTotalTokens}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.topUsers.map((u) => (
                  <TableRow key={u.userId}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm">{u.email}</span>
                        {u.name ? (
                          <span className="text-muted-foreground text-xs">
                            {u.name}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtNum(u.messages)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtNum(u.inputTokens)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtNum(u.outputTokens)}
                    </TableCell>
                    <TableCell className="text-right">
                      {fmtNum(u.inputTokens + u.outputTokens)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState text={t.analytics.empty} />
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1 px-3 pb-3 pt-0">
        <div className="text-muted-foreground text-xs uppercase tracking-wide">
          {label}
        </div>
        <div className="font-display text-2xl font-semibold tabular-nums">
          {value}
        </div>
        {hint ? (
          <div className="text-muted-foreground text-xs">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ExportLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
    >
      {label}
    </a>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-muted-foreground py-8 text-center text-sm">
      {text}
    </div>
  );
}
