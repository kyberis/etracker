import { NextResponse } from "next/server";

import { renderLlmsFull } from "@/lib/llms-content";
import { isLocale, type Locale } from "@/lib/i18n/locale";

/**
 * `/llms-full.txt` — complete plain-text dump of every public marketing page,
 * concatenated in markdown. Lets LLM crawlers index Clara's full documentation
 * with a single request and avoids the need to render JS on every page.
 *
 * Defaults to Spanish; pass `?lang=en` for English. The parallel
 * `/en/llms-full.txt` route returns the English version unconditionally.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang");
  const locale: Locale = isLocale(lang) ? lang : "es";

  return new NextResponse(renderLlmsFull(locale), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

export const dynamic = "force-static";
