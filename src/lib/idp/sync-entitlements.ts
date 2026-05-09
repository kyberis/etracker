import { db } from "@/lib/db";
import { shouldSendUsersToUnifiedIdp } from "@/lib/idp-base";

const IDP_FETCH_TIMEOUT_MS = 12_000;

/**
 * Pull `clara_daily_limit` from user.trefolio.com and update the local cache.
 * Called from the JWT callback (throttled) so quota drops shortly after a
 * Stripe cancellation without requiring a new OAuth login.
 */
export async function syncEntitlementsFromIdpForUser(userId: string): Promise<void> {
  if (!shouldSendUsersToUnifiedIdp()) return;

  const base = process.env.IDP_BASE_URL?.trim().replace(/\/+$/, "");
  const svc = process.env.IDP_SERVICE_TOKEN?.trim();
  if (!base || !svc) return;

  const row = await db.user.findUnique({
    where: { id: userId },
    select: { idpSub: true },
  });
  if (!row?.idpSub) return;

  const res = await fetch(`${base}/v1/entitlements/${encodeURIComponent(row.idpSub)}`, {
    headers: { Authorization: `Bearer ${svc}` },
    signal: AbortSignal.timeout(IDP_FETCH_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) return;

  const data = (await res.json()) as {
    entitlements?: { clara_daily_limit?: number };
    profile?: { name?: string; picture?: string | null };
  };
  const limit = Number(data.entitlements?.clara_daily_limit) || 30;

  const update: {
    dailyAgentMessageLimit: number;
    name?: string;
    image?: string | null;
  } = { dailyAgentMessageLimit: limit };

  if (data.profile?.name !== undefined) {
    update.name = data.profile.name;
  }
  if (data.profile?.picture !== undefined) {
    update.image = data.profile.picture;
  }

  await db.user.update({
    where: { id: userId },
    data: update,
  });
}
