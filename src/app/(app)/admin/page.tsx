import { notFound } from "next/navigation";

import { AdminUsersTable, type AdminUser } from "@/components/admin-users-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTodayUtcDate } from "@/lib/agent-quota";
import { getAuthSession } from "@/lib/auth";
import { db } from "@/lib/db";

/** Admin-only panel: list users, toggle isActive, edit dailyAgentMessageLimit. */
export default async function AdminPage() {
  const session = await getAuthSession();
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Administración</h1>
        <p className="text-muted-foreground text-sm">
          Gestioná usuarios, su estado y el límite diario de mensajes con el asistente. El día se
          reinicia a las 00:00 UTC.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuarios</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminUsersTable initialUsers={initialUsers} currentAdminId={session.user.id} />
        </CardContent>
      </Card>
    </div>
  );
}
