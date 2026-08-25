import type { Prisma } from "@prisma/client";
import type { UIMessage } from "ai";

import { generateWebChatSessionSummary } from "@/lib/chat/session-summary";
import { WEB_CHAT_SESSION_IDLE_MS } from "@/lib/chat/session-constants";
import { db } from "@/lib/db";

export { WEB_CHAT_SESSION_IDLE_MS };
export const WEB_CHAT_SUMMARY_MIN_MESSAGES = 2;

export async function beginWebChatSession(
  userId: string,
): Promise<{ sessionId: string }> {
  const open = await db.webChatSession.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (open) {
    await endWebChatSession(userId, open.id, { awaitSummary: true });
  }

  const session = await db.webChatSession.create({
    data: { userId },
    select: { id: true },
  });
  return { sessionId: session.id };
}

export async function endWebChatSession(
  userId: string,
  sessionId: string,
  options?: { awaitSummary?: boolean },
): Promise<void> {
  const session = await db.webChatSession.findFirst({
    where: { id: sessionId, userId, endedAt: null },
    select: { id: true },
  });
  if (!session) return;

  await db.webChatSession.update({
    where: { id: sessionId },
    data: { endedAt: new Date() },
  });

  const messageCount = await db.webChatMessage.count({ where: { sessionId } });
  if (messageCount < WEB_CHAT_SUMMARY_MIN_MESSAGES) return;

  const work = generateWebChatSessionSummary({ sessionId, userId });
  if (options?.awaitSummary) await work;
  else void work.catch((error) => console.error("[etracker.chat.session]", error));
}

export async function touchWebChatSession(sessionId: string): Promise<void> {
  await db.webChatSession.updateMany({
    where: { id: sessionId, endedAt: null },
    data: { lastActivityAt: new Date() },
  });
}

export async function assertOpenWebChatSession(
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const found = await db.webChatSession.findFirst({
    where: { id: sessionId, userId, endedAt: null },
    select: { id: true },
  });
  return found !== null;
}

export async function loadLatestWebChatSessionSummary(
  userId: string,
): Promise<string | null> {
  const session = await db.webChatSession.findFirst({
    where: { userId, endedAt: { not: null }, summary: { not: null } },
    orderBy: { endedAt: "desc" },
    select: { summary: true },
  });
  return session?.summary?.trim() || null;
}

export type WebChatSessionListItem = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  summary: string | null;
  messageCount: number;
};

export async function listWebChatSessions(
  userId: string,
  limit = 20,
): Promise<WebChatSessionListItem[]> {
  const safeLimit = Math.min(50, Math.max(1, Math.floor(limit)));
  const rows = await db.webChatSession.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: safeLimit,
    select: {
      id: true,
      startedAt: true,
      endedAt: true,
      summary: true,
      _count: { select: { messages: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString() ?? null,
    summary: row.summary,
    messageCount: row._count.messages,
  }));
}

export async function loadWebChatSessionMessages({
  userId,
  sessionId,
  limit = 200,
}: {
  userId: string;
  sessionId: string;
  limit?: number;
}): Promise<UIMessage[]> {
  const session = await db.webChatSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true },
  });
  if (!session) return [];

  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));
  const rows = await db.webChatMessage.findMany({
    where: { sessionId, userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: safeLimit,
    select: { id: true, role: true, parts: true, createdAt: true },
  });

  return rows.map((row) => ({
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    parts: Array.isArray(row.parts) ? (row.parts as UIMessage["parts"]) : [],
    metadata: { createdAt: row.createdAt.toISOString() },
  })) as UIMessage[];
}
