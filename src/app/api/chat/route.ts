import { type UIMessage, convertToModelMessages, generateId } from "ai";
import { NextResponse } from "next/server";

import {
  type ExpenseAgentResponseStyle,
  streamExpenseAgent,
} from "@/lib/ai/run-expense-agent";
import {
  buildCellAskSystemBlock,
  type CellAskContext,
} from "@/lib/ai/cell-ask-context";
import {
  consumeAgentQuota,
  quotaHeaders,
  recordAgentModelUsage,
  recordAgentTokens,
} from "@/lib/agent-quota";
import { isUpsellActive } from "@/lib/billing/stripe";
import { buildIdpUpgradeUrlForClara, shouldSendUsersToUnifiedIdp } from "@/lib/idp-base";
import { persistWebChatMessage } from "@/lib/chat/web-history";
import {
  assertOpenWebChatSession,
  touchWebChatSession,
} from "@/lib/chat/sessions";
import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { limitByUser } from "@/lib/rate-limit";
import { requireUserId } from "@/lib/session";

function isCellAskContext(value: unknown): value is CellAskContext {
  if (!value || typeof value !== "object") return false;
  const v = value as CellAskContext;
  return (
    typeof v.month === "string" &&
    typeof v.primaryCurrency === "string" &&
    typeof v.label === "string" &&
    !!v.focus &&
    typeof v.focus === "object" &&
    !!v.monthTotals
  );
}

function parseChatBody(raw: unknown): {
  messages: UIMessage[];
  responseStyle: ExpenseAgentResponseStyle;
  activeMonth: string | undefined;
  surface: "web" | "month-grid";
  cellAsk: CellAskContext | undefined;
  sessionId: string | undefined;
} {
  const body = raw as {
    messages?: UIMessage[];
    conversationMode?: boolean;
    responseStyle?: string;
    activeMonth?: string;
    surface?: string;
    cellAsk?: unknown;
    sessionId?: string;
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

  const surface = body.surface === "month-grid" ? "month-grid" : "web";
  const cellAsk =
    surface === "month-grid" && isCellAskContext(body.cellAsk)
      ? body.cellAsk
      : undefined;

  const sessionId =
    typeof body.sessionId === "string" && body.sessionId.length > 0
      ? body.sessionId
      : undefined;

  return { messages, responseStyle, activeMonth, surface, cellAsk, sessionId };
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
      "Too many assistant messages in a row. Try again in a minute.",
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
        "The AI assistant is not configured on the server. Set up AI Gateway (`vercel link` + `vercel env pull`) or `OPENAI_API_KEY`.",
        503,
      );
    }

    // Per-user daily cap (shared with Telegram). Increments before the model
    // call so a failed/cancelled stream doesn't grant a free retry.
    const quota = await consumeAgentQuota(userId);
    if (!quota.ok) {
      if (quota.reason === "disabled") {
        return jsonError(
          "Your account is disabled. Contact the administrator.",
          403,
        );
      }
      // Structured 429: the chat client opens a richer modal when
      // `upsell.subscription` or `upsell.donation` is true. Both are
      // gated by `isUpsellActive` (Stripe envs + admin feature flag),
      // so self-hosters / users without the flag still see the plain
      // text-only path the modal renders.
      const upsellOn = await isUpsellActive(userId);
      const idpRow = shouldSendUsersToUnifiedIdp()
        ? await db.user.findUnique({
            where: { id: userId },
            select: { idpSub: true },
          })
        : null;
      const idpUpgradeUrl =
        shouldSendUsersToUnifiedIdp() ?
          buildIdpUpgradeUrlForClara(idpRow?.idpSub ?? null)
        : undefined;
      const res = NextResponse.json(
        {
          error: `Daily assistant message limit reached (${quota.limit}). Resets at 00:00 UTC.`,
          kind: "quota_limit",
          limit: quota.limit,
          used: quota.used,
          remaining: 0,
          resetAtUtc: quota.resetAtUtc,
          upsell: {
            subscription: upsellOn && !shouldSendUsersToUnifiedIdp(),
            donation: upsellOn,
            ...(idpUpgradeUrl ? { idpUrl: idpUpgradeUrl } : {}),
          },
        },
        { status: 429 },
      );
      const headers = quotaHeaders(quota);
      for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
      return res;
    }

    const {
      messages: uiMessages,
      responseStyle,
      activeMonth,
      surface,
      cellAsk,
      sessionId: bodySessionId,
    } = parseChatBody(await request.json());
    const modelMessages = await convertToModelMessages(uiMessages);

    let sessionId = bodySessionId;
    if (surface !== "month-grid") {
      if (sessionId && (await assertOpenWebChatSession(userId, sessionId))) {
        // keep client session
      } else {
        const open = await db.webChatSession.findFirst({
          where: { userId, endedAt: null },
          orderBy: { startedAt: "desc" },
          select: { id: true },
        });
        sessionId =
          open?.id ??
          (
            await db.webChatSession.create({
              data: { userId },
              select: { id: true },
            })
          ).id;
      }
    }

    const lastUser = [...uiMessages].reverse().find((m) => m.role === "user");
    if (lastUser && surface !== "month-grid") {
      try {
        await persistWebChatMessage({
          userId,
          message: lastUser,
          sessionId,
        });
        if (sessionId) await touchWebChatSession(sessionId);
      } catch (error) {
        console.error("[etracker.chat] persist user message failed", error);
      }
    }

    const userRow = cellAsk
      ? await db.user.findUnique({
          where: { id: userId },
          select: { locale: true },
        })
      : null;
    const cellAskLocale = userRow?.locale === "en" ? "en" : "es";
    const cellAskBlock = cellAsk
      ? buildCellAskSystemBlock(cellAsk, cellAskLocale)
      : undefined;

    const result = await streamExpenseAgent({
      userId,
      messages: modelMessages,
      responseStyle,
      activeMonth,
      cellAskBlock,
      onFinish: async ({ usage, model }) => {
        await Promise.all([
          recordAgentTokens(userId, usage),
          recordAgentModelUsage(userId, model, usage),
        ]);
      },
    });
    // Drain the stream server-side so the model finishes generating and
    // `onFinish` runs (token accounting + assistant persistence) even when
    // the client disconnects mid-stream — closing the tab, navigating away
    // or a flaky network would otherwise leave orphan user messages in the
    // chat history. See AI SDK docs: "Handling client disconnects".
    result.consumeStream();
    // Stamp the assistant message with a wall-clock `createdAt` at the
    // start of the stream so the client can render messenger-style
    // timestamps (and day separators) without waiting for a refresh.
    // The same value gets persisted to the DB via `onFinish` below.
    const assistantStartedAt = new Date().toISOString();
    const response = result.toUIMessageStreamResponse({
      // `originalMessages` + `generateMessageId` enables persistence mode in
      // the AI SDK: the assistant message gets a stable, non-empty id (we
      // pass the AI SDK's own generator), and `onFinish` receives the full
      // `responseMessage` with every part (text, tool-*, file). Without
      // `generateMessageId` the SDK leaves the response message id as `""`,
      // which makes our DB upsert collapse every assistant turn onto a
      // single empty-id row — i.e. nothing gets persisted.
      originalMessages: uiMessages,
      generateMessageId: () => generateId(),
      messageMetadata: ({ part }) =>
        part.type === "start" ? { createdAt: assistantStartedAt } : undefined,
      onFinish: async ({ responseMessage }) => {
        if (surface === "month-grid") return;
        try {
          await persistWebChatMessage({
            userId,
            message: responseMessage,
            sessionId,
          });
          if (sessionId) await touchWebChatSession(sessionId);
        } catch (error) {
          console.error("[etracker.chat] persist assistant message failed", error);
        }
      },
    });
    const headers = quotaHeaders(quota);
    for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
    return response;
  });
}
