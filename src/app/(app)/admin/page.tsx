import { notFound } from "next/navigation";

import { AdminUsersTable, type AdminUser } from "@/components/admin-users-table";
import { PageContainer } from "@/components/page-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTodayUtcDate } from "@/lib/agent-quota";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";

/** Admin-only panel: list users, toggle isActive, edit dailyAgentMessageLimit. */
export default async function AdminPage() {
  const [session, t] = await Promise.all([getAuthSession(), getT()]);
  if (!session?.user?.isAdmin) {
    notFound();
  }

  const today = getTodayUtcDate();
  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      isAdmin: true,
      isActive: true,
      dailyAgentMessageLimit: true,
      createdAt: true,
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
