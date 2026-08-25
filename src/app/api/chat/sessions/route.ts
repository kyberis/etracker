import { jsonError, withApi } from "@/lib/http";
import {
  listWebChatSessions,
  loadWebChatSessionMessages,
} from "@/lib/chat/sessions";
import { requireUserId } from "@/lib/session";

export async function GET(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");

    if (sessionId) {
      const messages = await loadWebChatSessionMessages({ userId, sessionId });
      if (messages.length === 0) {
        const listed = await listWebChatSessions(userId, 50);
        if (!listed.some((s) => s.id === sessionId)) {
          return jsonError("Session not found.", 404);
        }
      }
      return { sessionId, messages };
    }

    const rawLimit = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
    const sessions = await listWebChatSessions(
      userId,
      Number.isFinite(rawLimit) ? rawLimit : 20,
    );
    return { sessions };
  });
}
