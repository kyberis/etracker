import { gateway, generateText } from "ai";

import { db } from "@/lib/db";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { log } from "@/lib/log";

const SUMMARY_MODEL =
  process.env.AI_MODEL ?? process.env.OPENAI_MODEL ?? "openai/gpt-5.4";

const MAX_SUMMARY_CHARS = 2_400;

function extractTextFromParts(parts: unknown): string {
  if (!Array.isArray(parts)) return "";
  const chunks: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const p = part as { type?: string; text?: string };
    if (p.type === "text" && typeof p.text === "string" && p.text.trim()) {
      chunks.push(p.text.trim());
    } else if (
      typeof p.type === "string" &&
      p.type.startsWith("tool-") &&
      p.type !== "tool-renderChart" &&
      p.type !== "tool-proposeRecurringTemplates" &&
      p.type !== "tool-proposeRecurringFromMonth"
    ) {
      chunks.push(`[tool:${p.type.replace(/^tool-/, "")}]`);
    }
  }
  return chunks.join("\n");
}

function buildTranscript(
  rows: { role: string; parts: unknown }[],
  locale: Locale,
): string {
  const userLabel = locale === "en" ? "User" : "Usuario";
  return rows
    .map((row) => {
      const text = extractTextFromParts(row.parts);
      if (!text) return null;
      const label = row.role === "assistant" ? "Clara" : userLabel;
      return `${label}: ${text}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

const SUMMARY_SYSTEM_ES = `Sos Clara resumiendo una sesión de chat financiero que acaba de terminar.

Reglas:
- Español rioplatense, vos/decime. Tono conciso.
- Máximo 8 bullets o 120 palabras.
- Incluí: qué pidió el usuario, qué acciones concretas hiciste, preguntas pendientes y contexto útil para retomar mañana.
- NO inventes datos que no estén en la transcripción.`;

const SUMMARY_SYSTEM_EN = `You are Clara summarizing a financial chat session that just ended.

Rules:
- Concise neutral English. Max 8 bullets or 120 words.
- Include what the user asked, concrete actions you took, open questions and useful context to resume.
- Do NOT invent facts not in the transcript.`;

export async function generateWebChatSessionSummary({
  sessionId,
  userId,
}: {
  sessionId: string;
  userId: string;
}): Promise<void> {
  const [user, rows] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { locale: true },
    }),
    db.webChatMessage.findMany({
      where: { sessionId, userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { role: true, parts: true },
    }),
  ]);

  const locale: Locale = isLocale(user?.locale) ? user.locale : "es";
  const transcript = buildTranscript(rows, locale);
  if (!transcript.trim()) return;

  try {
    const result = await generateText({
      model: gateway(SUMMARY_MODEL),
      providerOptions: {
        gateway: {
          user: userId,
          tags: ["feature:chat-session-summary", `locale:${locale}`],
        },
      },
      system: locale === "en" ? SUMMARY_SYSTEM_EN : SUMMARY_SYSTEM_ES,
      prompt:
        locale === "en"
          ? `Summarize this session:\n\n${transcript}`
          : `Resumí esta sesión:\n\n${transcript}`,
    });
    const summary = result.text.trim().slice(0, MAX_SUMMARY_CHARS);
    if (!summary) return;

    await db.webChatSession.updateMany({
      where: { id: sessionId, userId },
      data: { summary },
    });
  } catch (error) {
    log.error("chat.session.summary_failed", {
      sessionId,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
