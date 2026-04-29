import { withApi } from "@/lib/http";
import {
  HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT,
  loadWebChatHistory,
} from "@/lib/chat/web-history";
import { requireUserId } from "@/lib/session";

/**
 * GET /api/chat/history?limit=50&before=<cuid>
 *
 * Returns the user's most recent chat messages (asc) for the in-app chat
 * (`/app`). The optional `before` cursor — the oldest message id currently
 * loaded by the client — fetches an older slice for the "Cargar mensajes
 * anteriores" button.
 */
export async function GET(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(HISTORY_MAX_LIMIT, Math.max(1, rawLimit))
      : HISTORY_DEFAULT_LIMIT;
    const before = url.searchParams.get("before") ?? undefined;

    const { messages, hasMore, oldestId } = await loadWebChatHistory({
      userId,
      limit,
      before,
    });

    return { messages, hasMore, oldestId };
  });
}
