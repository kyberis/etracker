import { assertOpenBankingAvailable } from "@/lib/enable-banking/access";
import {
  listUserConnections,
  serializePublicConnection,
} from "@/lib/db/bank-connections";
import { withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    await assertOpenBankingAvailable(userId);
    const connections = await listUserConnections(userId);
    return {
      connections: connections.map((connection) =>
        serializePublicConnection(connection),
      ),
    };
  });
}
