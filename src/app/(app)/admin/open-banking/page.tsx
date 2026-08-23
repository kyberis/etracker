import Link from "next/link";
import { notFound } from "next/navigation";

import { OpenBankingApiLogsTable } from "@/components/admin/open-banking-api-logs-table";
import { OpenBankingConnectionsTable } from "@/components/admin/open-banking-connections-table";
import { OpenBankingStats } from "@/components/admin/open-banking-stats";
import { OpenBankingSyncRunsTable } from "@/components/admin/open-banking-sync-runs-table";
import { PageContainer } from "@/components/page-container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAuthSession } from "@/lib/auth";
import { listBankSyncRuns } from "@/lib/db/bank-sync-runs";
import { listEnableBankingApiLogs } from "@/lib/db/enable-banking-logs";
import { getOpenBankingStats, listAdminConnections } from "@/lib/db/open-banking-admin";
import { getT } from "@/lib/i18n/server";

export default async function AdminOpenBankingPage() {
  const [session, t] = await Promise.all([getAuthSession(), getT()]);
  if (!session?.user?.isAdmin) {
    notFound();
  }

  const [stats, connections, runs, logs] = await Promise.all([
    getOpenBankingStats(),
    listAdminConnections({ limit: 50 }),
    listBankSyncRuns({ limit: 30 }),
    listEnableBankingApiLogs({ limit: 30 }),
  ]);

  const copy = t.admin.openBanking;

  return (
    <PageContainer className="space-y-6">
      <div className="space-y-1">
        <p className="text-muted-foreground text-sm">
          <Link href="/admin" className="underline">
            {t.admin.pageTitle}
          </Link>
        </p>
        <h1 className="font-display text-2xl font-semibold">{copy.pageTitle}</h1>
        <p className="text-muted-foreground text-sm">{copy.pageDescription}</p>
      </div>

      <OpenBankingStats stats={stats} t={copy} />

      <Card>
        <CardHeader>
          <CardTitle>{copy.connectionsTitle}</CardTitle>
          <CardDescription>{copy.connectionsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <OpenBankingConnectionsTable rows={connections.connections} t={copy} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.runsTitle}</CardTitle>
          <CardDescription>{copy.runsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <OpenBankingSyncRunsTable
            rows={runs.runs.map((run) => ({
              id: run.id,
              trigger: run.trigger,
              status: run.status,
              transactionsFound: run.transactionsFound,
              transactionsImported: run.transactionsImported,
              transactionsSkipped: run.transactionsSkipped,
              errorCode: run.errorCode,
              errorMessage: run.errorMessage,
              durationMs: run.durationMs,
              startedAt: run.startedAt.toISOString(),
              connection: run.connection,
            }))}
            t={copy}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.logsTitle}</CardTitle>
          <CardDescription>{copy.logsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <OpenBankingApiLogsTable
            rows={logs.logs.map((row) => ({
              ...row,
              createdAt: row.createdAt.toISOString(),
            }))}
            t={copy}
          />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
