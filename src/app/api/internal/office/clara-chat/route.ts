export const dynamic = "force-dynamic";
export const maxDuration = 120;

import type { ModelMessage } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { generateExpenseAgentReply } from "@/lib/ai/run-expense-agent";
import { normalizeLocale } from "@/lib/i18n/locale";
import { readOfficeUserLookup, requireIdpServiceToken } from "@/lib/office/idp-service-auth";
import { resolveOfficeUser } from "@/lib/office/resolve-office-user";
import { getSiteUrl } from "@/lib/seo";

const textMessageSchema = z
  .object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(12_000),
  })
  .strict();

const requestSchema = z
  .object({
    billingSource: z.literal("trefolio"),
    sub: z.string().max(200).optional().default(""),
    email: z.string().max(320).optional().default(""),
    trefolioUserId: z.string().max(200).optional().default(""),
    message: z.string().min(1).max(4_000),
    language: z.string().max(16).optional(),
    messages: z.array(textMessageSchema).max(20).optional(),
  })
  .strict();

function claraLoginUrl(): string {
  return `${getSiteUrl()}/login`;
}

/**
 * Trefolio (Clover / Warren) → Clara: full expense-agent turn for a linked Clara user.
 * Auth: Bearer IDP_SERVICE_TOKEN.
 * Quota: does NOT consume Clara daily cap — trefolio already billed `ai_consult`.
 * Anti-loop: omits `consultWarren`.
 */
export async function POST(req: NextRequest) {
  const fail = requireIdpServiceToken(req);
  if (fail) return fail;

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const lookup = readOfficeUserLookup(req, {
    sub: body.sub,
    email: body.email,
    trefolioUserId: body.trefolioUserId,
  });
  const user = await resolveOfficeUser(lookup);
  if (!user) {
    return NextResponse.json(
      {
        available: false,
        hasAccount: false,
        loginUrl: claraLoginUrl(),
        note: "No Clara account linked to this identity",
      },
      { status: 404 },
    );
  }

  const history = (body.messages ?? []).map(
    (m): ModelMessage =>
      m.role === "assistant"
        ? { role: "assistant", content: m.content }
        : { role: "user", content: m.content },
  );
  const messages: ModelMessage[] =
    history.length > 0
      ? [...history, { role: "user", content: body.message }]
      : [{ role: "user", content: body.message }];

  const languageLine = body.language
    ? `\nPrefer the user's language (hint: ${normalizeLocale(body.language)}). Infer from their question if mixed.`
    : "";

  try {
    const result = await generateExpenseAgentReply({
      userId: user.id,
      messages,
      source: "trefolio",
      responseStyle: "concise",
      omitConsultWarren: true,
      systemAppendix: `
You are answering through Clover or Warren on trefolio. Do not tell the user to open Clara. Do not call consultWarren.${languageLine}`,
    });

    return NextResponse.json({
      available: true,
      text: result.text,
      note: "Clara reply billed against trefolio ai_consult, not Clara daily quota.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Clara unreachable";
    return NextResponse.json({ available: false, note: message }, { status: 502 });
  }
}
