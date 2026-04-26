import { type UIMessage, convertToModelMessages } from "ai";

import { streamExpenseAgent } from "@/lib/ai/run-expense-agent";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return jsonError("Unauthorized.", 401);
  }

  if (!process.env.OPENAI_API_KEY) {
    return jsonError("OPENAI_API_KEY no está configurada en el servidor.", 500);
  }

  const body = (await request.json()) as { messages?: UIMessage[] };
  const uiMessages = body.messages ?? [];
  const modelMessages = await convertToModelMessages(uiMessages);

  const result = streamExpenseAgent({ userId, messages: modelMessages });
  return result.toUIMessageStreamResponse();
}
