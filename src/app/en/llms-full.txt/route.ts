import { NextResponse } from "next/server";

import { renderLlmsFull } from "@/lib/llms-content";

/**
 * `/en/llms-full.txt` — English variant of the full marketing dump. Mirrors
 * `/llms-full.txt` but always returns the English copy.
 */
export async function GET() {
  return new NextResponse(renderLlmsFull("en"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

export const dynamic = "force-static";
