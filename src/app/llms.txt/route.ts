import { NextResponse } from "next/server";

import { renderLlmsIndex } from "@/lib/llms-content";
import { isLocale, type Locale } from "@/lib/i18n/locale";

/**
 * `/llms.txt` — short, structured pointer index per https://llmstxt.org so
 * LLMs and AI agents can discover Clara's documentation surface in one fetch.
 * Defaults to Spanish; pass `?lang=en` for English. There is also a parallel
 * `/en/llms.txt` route that returns the English version unconditionally.
 *
 * A more verbose, single-file dump of the marketing copy lives at
 * `/llms-full.txt`.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const lang = url.searchParams.get("lang");
  const locale: Locale = isLocale(lang) ? lang : "es";

  return new NextResponse(renderLlmsIndex(locale), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

export const dynamic = "force-static";
