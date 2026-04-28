import { type UIMessage, convertToModelMessages } from "ai";

import {
  type ExpenseAgentResponseStyle,
  streamExpenseAgent,
} from "@/lib/ai/run-expense-agent";
import {
  consumeAgentQuota,
  quotaHeaders,
  recordAgentTokens,
} from "@/lib/agent-quota";
import { jsonError, withApi } from "@/lib/http";
import { limitByUser } from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";

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
  return withApi(async () => {
    const userId = await requireUserId();

    // 60 chat requests per user per hour — defense in depth on top of AI
    // Gateway's account-level limits.
    const limited = await limitByUser(
      "chat",
      userId,
      60,
      "1 h",
      "Demasiados mensajes seguidos al asistente. Probá en un minuto.",
    );
    if (!limited.ok) return limited.response;

    // 503 (Service Unavailable) when neither AI Gateway nor a direct provider
    // key is configured. The chat UI surfaces this as "AI not configured".
    if (
      !process.env.AI_GATEWAY_API_KEY &&
      !process.env.VERCEL_OIDC_TOKEN &&
      !process.env.OPENAI_API_KEY
    ) {
      return jsonError(
        "El asistente de IA no está configurado en el servidor. Configurá AI Gateway (`vercel link` + `vercel env pull`) o `OPENAI_API_KEY`.",
        503,
      );
    }

    // Per-user daily cap (shared with WhatsApp). Increments before the model
    // call so a failed/cancelled stream doesn't grant a free retry.
    const quota = await consumeAgentQuota(userId);
    if (!quota.ok) {
      if (quota.reason === "disabled") {
        return jsonError(
          "Tu cuenta está desactivada. Contactá al administrador.",
          403,
        );
      }
      const res = jsonError(
        `Llegaste al límite diario de ${quota.limit} mensajes con el asistente. Se reinicia a las 00:00 UTC.`,
        429,
      );
      const headers = quotaHeaders(quota);
      for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
      return res;
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
      onFinish: async ({ usage }) => {
        await recordAgentTokens(userId, usage);
      },
    });
    const response = result.toUIMessageStreamResponse();
    const headers = quotaHeaders(quota);
    for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
    return response;
  });
}
