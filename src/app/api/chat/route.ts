import { type UIMessage, convertToModelMessages } from "ai";

import {
  type ExpenseAgentResponseStyle,
  streamExpenseAgent,
} from "@/lib/ai/run-expense-agent";
import { jsonError } from "@/lib/http";
import { requireUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseChatBody(raw: unknown): {
  messages: UIMessage[];
  responseStyle: ExpenseAgentResponseStyle;
  activeMonth: string | undefined;
} {
  const body = raw as {
    messages?: UIMessage[];
    conversationMode?: boolean;
    responseStyle?: string;
    activeMonth?: string;
  };

  const messages = body.messages ?? [];

  let responseStyle: ExpenseAgentResponseStyle = "concise";
  if (body.responseStyle === "conversational" || body.responseStyle === "concise") {
    responseStyle = body.responseStyle;
  } else if (body.conversationMode === true) {
    responseStyle = "conversational";
  }

  let activeMonth: string | undefined;
  if (typeof body.activeMonth === "string" && /^\d{4}-\d{2}$/.test(body.activeMonth)) {
    activeMonth = body.activeMonth;
  }

  return { messages, responseStyle, activeMonth };
}

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

  const { messages: uiMessages, responseStyle, activeMonth } = parseChatBody(
    await request.json(),
  );
  const modelMessages = await convertToModelMessages(uiMessages);

  const result = await streamExpenseAgent({
    userId,
    messages: modelMessages,
    responseStyle,
    activeMonth,
  });
  return result.toUIMessageStreamResponse();
}
