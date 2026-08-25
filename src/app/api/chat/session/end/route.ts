import { jsonError, withApi } from "@/lib/http";
import { endWebChatSession } from "@/lib/chat/sessions";
import { requireUserId } from "@/lib/session";

export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    let sessionId: string | undefined;
    try {
      const body = (await request.json()) as { sessionId?: string };
      sessionId = body.sessionId;
    } catch {
      return jsonError("Invalid JSON body.", 400);
    }
    if (!sessionId) return jsonError("sessionId is required.", 400);
    await endWebChatSession(userId, sessionId);
    return { ok: true as const };
  });
}
