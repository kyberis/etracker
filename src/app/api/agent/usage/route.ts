import { getAgentQuotaSnapshot } from "@/lib/agent-quota";
import { withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

/** Returns today's agent quota snapshot for the authenticated user. */
export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    const snapshot = await getAgentQuotaSnapshot(userId);
    return snapshot;
  });
}
