import type { Prisma } from "@prisma/client";
import type { UIMessage } from "ai";

import { db } from "@/lib/db";

/**
 * Default cap for `GET /api/chat/history` and the initial hydration on the
 * client. Matches the user-facing "load older" flow: hidratamos la última
 * tanda y exponemos un botón para cargar más viejas.
 */
export const HISTORY_DEFAULT_LIMIT = 50;
export const HISTORY_MAX_LIMIT = 200;

type DbRow = {
  id: string;
  role: string;
  parts: Prisma.JsonValue;
  createdAt: Date;
};

/** Returns the latest `limit` messages (ascending) older than `before` (id). */
export async function loadWebChatHistory({
  userId,
  limit,
  before,
}: {
  userId: string;
  limit: number;
  before?: string;
}): Promise<{ messages: UIMessage[]; hasMore: boolean; oldestId: string | null }> {
  const safeLimit = Math.min(
    HISTORY_MAX_LIMIT,
    Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : HISTORY_DEFAULT_LIMIT),
  );

  // Resolve the cursor to a `createdAt` so we can paginate stably even when
  // multiple rows share a timestamp (we tie-break by id).
  let cursor: { createdAt: Date; id: string } | null = null;
  if (before) {
    const found = await db.webChatMessage.findUnique({
      where: { id: before },
      select: { id: true, userId: true, createdAt: true },
    });
    if (found && found.userId === userId) {
      cursor = { createdAt: found.createdAt, id: found.id };
    }
  }

  // Fetch one extra row so we can tell whether there's more older history.
  const rows: DbRow[] = await db.webChatMessage.findMany({
    where: {
      userId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [
      { createdAt: "desc" },
      { id: "desc" },
    ],
    take: safeLimit + 1,
    select: { id: true, role: true, parts: true, createdAt: true },
  });

  const hasMore = rows.length > safeLimit;
  const sliced = hasMore ? rows.slice(0, safeLimit) : rows;
  // The query returns newest → oldest; the chat UI expects oldest → newest.
  const ascending = sliced.slice().reverse();

  const messages = ascending.map((row) => rowToUIMessage(row));
  const oldestId = ascending[0]?.id ?? null;

  return { messages, hasMore, oldestId };
}

/**
 * Persist a single message (user or assistant) for the web chat. We store the
 * full `UIMessage.parts` array as JSON so tool calls, charts and image
 * attachments re-render identically when the conversation is rehydrated.
 *
 * Idempotent on `id`: the AI SDK can retry POST /api/chat with the same user
 * message id, and we don't want a duplicate row each time.
 */
export async function persistWebChatMessage({
  userId,
  message,
}: {
  userId: string;
  message: UIMessage;
}): Promise<void> {
  if (message.role !== "user" && message.role !== "assistant") return;
  if (!Array.isArray(message.parts) || message.parts.length === 0) return;

  // `upsert` rather than `create` makes this safe under retries and React
  // strict-mode double-renders on the client.
  await db.webChatMessage.upsert({
    where: { id: message.id },
    create: {
      id: message.id,
      userId,
      role: message.role,
      parts: message.parts as unknown as Prisma.InputJsonValue,
    },
    update: {
      // Only the assistant message grows during streaming; refresh `parts`
      // when the same id is written again so the persisted copy matches the
      // final on-screen message.
      parts: message.parts as unknown as Prisma.InputJsonValue,
    },
  });
}

function rowToUIMessage(row: DbRow): UIMessage {
  const parts = Array.isArray(row.parts) ? (row.parts as UIMessage["parts"]) : [];
  return {
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    parts,
  } as UIMessage;
}
