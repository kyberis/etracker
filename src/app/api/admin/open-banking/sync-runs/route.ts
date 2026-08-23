import { listBankSyncRuns } from "@/lib/db/bank-sync-runs";
import { withApi } from "@/lib/http";
import { requireAdminUserId } from "@/lib/session";

export async function GET(request: Request) {
  return withApi(async () => {
    await requireAdminUserId();
    const url = new URL(request.url);
    return listBankSyncRuns({
      userId: url.searchParams.get("userId") ?? undefined,
      connectionId: url.searchParams.get("connectionId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      trigger: url.searchParams.get("trigger") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 50),
      offset: Number(url.searchParams.get("offset") ?? 0),
    });
  });
}
