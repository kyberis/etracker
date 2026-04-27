import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Twilio GETs this URL when sending WhatsApp media; must be public HTTPS.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const row = await db.ttsAudioCache.findUnique({
    where: { id },
    select: { data: true, mimeType: true, expiresAt: true },
  });

  if (!row || row.expiresAt.getTime() <= Date.now()) {
    if (row) {
      await db.ttsAudioCache.delete({ where: { id } }).catch(() => {});
    }
    return new NextResponse("Not found", { status: 404 });
  }

  const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": row.mimeType || "audio/mpeg",
      "Cache-Control": "private, no-store",
    },
  });
}
