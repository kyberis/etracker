import Link from "next/link";
import { notFound } from "next/navigation";
import { Inbox, LineChart } from "lucide-react";

import {
  AdminFeatureFlagsTable,
  type AdminFeatureFlag,
} from "@/components/admin-feature-flags-table";
import { AdminNotifyPanel } from "@/components/admin-notify-panel";
import { AdminUsersTable, type AdminUser } from "@/components/admin-users-table";
import { PageContainer } from "@/components/page-container";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getTodayUtcDate } from "@/lib/agent-quota";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { listFeatureFlags } from "@/lib/feature-flags";
import { getT } from "@/lib/i18n/server";

/** Admin-only panel: list users, toggle isActive, edit dailyAgentMessageLimit. */
export default async function AdminPage() {
  const [session, t] = await Promise.all([getAuthSession(), getT()]);
  if (!session?.user?.isAdmin) {
    notFound();
  }

  const today = getTodayUtcDate();
  const featureFlags = await listFeatureFlags();
  const initialFlags: AdminFeatureFlag[] = featureFlags.map((f) => ({
    key: f.key,
    description: f.description,
    enabled: f.enabled,
    defaultEnabled: f.defaultEnabled,
    updatedAt: f.updatedAt,
    updatedBy: f.updatedBy,
  }));
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      isAdmin: true,
      isActive: true,
      dailyAgentMessageLimit: true,
      createdAt: true,
      telegramUserId: true,
      telegramUsername: true,
      telegramVerifiedAt: true,
      agentUsage: {
        where: { day: today },
        select: { count: true, inputTokens: true, outputTokens: true },
        take: 1,
      },
    },
  });

  const initialUsers: AdminUser[] = users.map((u) => {
    const usage = u.agentUsage[0];
    return {
      id: u.id,
      email: u.email,
      isAdmin: u.isAdmin,
      isActive: u.isActive,
      dailyAgentMessageLimit: u.dailyAgentMessageLimit,
      createdAt: u.createdAt.toISOString(),
      telegram: {
        linked: u.telegramUserId !== null,
        username: u.telegramUsername,
        verifiedAt: u.telegramVerifiedAt?.toISOString() ?? null,
      },
      todayUsage: {
        count: usage?.count ?? 0,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
      },
    };
  });

  return (
    <PageContainer className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">{t.admin.pageTitle}</h1>
        <p className="text-muted-foreground text-sm">{t.admin.pageDescription}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/admin/analytics"
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
        >
          <Card className="hover:bg-muted/40 transition-colors">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <div className="bg-foreground/5 flex size-10 items-center justify-center rounded-lg">
                <LineChart className="size-5" aria-hidden />
              </div>
              <div className="flex-1">
                <CardTitle>{t.admin.analyticsLink}</CardTitle>
                <CardDescription>{t.admin.analyticsLinkDesc}</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>

        <Link
          href="/admin/contact"
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl"
        >
          <Card className="hover:bg-muted/40 transition-colors">
            <CardHeader className="flex flex-row items-center gap-3 space-y-0">
              <div className="bg-foreground/5 flex size-10 items-center justify-center rounded-lg">
                <Inbox className="size-5" aria-hidden />
              </div>
              <div className="flex-1">
                <CardTitle>Bandeja de contacto</CardTitle>
                <CardDescription>
                  Messages from the public /contact form (privacy, abuse, bugs).
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.notifyTitle}</CardTitle>
          <CardDescription>{t.admin.notifyDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminNotifyPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.featureFlagsTitle}</CardTitle>
          <CardDescription>{t.admin.featureFlagsDescription}</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminFeatureFlagsTable initialFlags={initialFlags} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.admin.pageTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminUsersTable initialUsers={initialUsers} currentAdminId={session.user.id} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
