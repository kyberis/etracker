import { NextResponse } from "next/server";

import { renderLlmsIndex } from "@/lib/llms-content";

/**
 * `/en/llms.txt` — English variant of the llms.txt index. Mirrors `/llms.txt`
 * but always returns the English copy and links to `/en/...` marketing routes.
 */
export async function GET() {
  return new NextResponse(renderLlmsIndex("en"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

export const dynamic = "force-static";
