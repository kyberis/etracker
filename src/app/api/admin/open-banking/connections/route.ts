import { listAdminConnections } from "@/lib/db/open-banking-admin";
import { withApi } from "@/lib/http";
import { requireAdminUserId } from "@/lib/session";

export async function GET(request: Request) {
  return withApi(async () => {
    await requireAdminUserId();
    const url = new URL(request.url);
    return listAdminConnections({
      status: url.searchParams.get("status") ?? undefined,
      institutionName: url.searchParams.get("aspsp") ?? undefined,
      limit: Number(url.searchParams.get("limit") ?? 50),
      offset: Number(url.searchParams.get("offset") ?? 0),
    });
  });
}
