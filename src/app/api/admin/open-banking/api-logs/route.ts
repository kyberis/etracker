import { listEnableBankingApiLogs } from "@/lib/db/enable-banking-logs";
import { withApi } from "@/lib/http";
import { requireAdminUserId } from "@/lib/session";

export async function GET(request: Request) {
  return withApi(async () => {
    await requireAdminUserId();
    const url = new URL(request.url);
    return listEnableBankingApiLogs({
      userId: url.searchParams.get("userId") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 50),
      offset: Number(url.searchParams.get("offset") ?? 0),
    });
  });
}
