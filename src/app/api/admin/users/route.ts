import { getTodayUtcDate } from "@/lib/agent-quota";
import { db } from "@/lib/db";
import { withApi } from "@/lib/http";
import { requireAdminUserId } from "@/lib/session";

/**
 * Admin-only: list all users with today's usage snapshot. The page
 * `/admin` consumes this; we keep it small (no pagination) — eTracker is
 * a low-volume product. Add cursor pagination if user count grows.
 */
export async function GET() {
  return withApi(async () => {
    await requireAdminUserId();

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

    return {
      users: users.map((u) => {
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
      }),
    };
  });
}
