import { withApi } from "@/lib/http";
import { beginWebChatSession } from "@/lib/chat/sessions";
import { requireUserId } from "@/lib/session";

export async function POST() {
  return withApi(async () => {
    const userId = await requireUserId();
    const { sessionId } = await beginWebChatSession(userId);
    return { sessionId };
  });
}
