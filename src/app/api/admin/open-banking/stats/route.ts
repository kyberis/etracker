import { getOpenBankingStats } from "@/lib/db/open-banking-admin";
import { withApi } from "@/lib/http";
import { requireAdminUserId } from "@/lib/session";

export async function GET() {
  return withApi(async () => {
    await requireAdminUserId();
    return getOpenBankingStats();
  });
}
