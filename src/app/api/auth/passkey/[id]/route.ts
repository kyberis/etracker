import { NextRequest, NextResponse } from "next/server";

import { db } from "@/lib/db";
import { getAuthSession } from "@/lib/auth";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** Rename a passkey (e.g. "MacBook" -> "MacBook Touch ID"). */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { name?: string } | null;
  const name = body?.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "Name too long" }, { status: 400 });
  }

  const result = await db.passkey.updateMany({
    where: { id: decodeURIComponent(id), userId: session.user.id },
    data: { name },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Passkey not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}

/** Delete a passkey owned by the signed-in user. */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const result = await db.passkey.deleteMany({
    where: { id: decodeURIComponent(id), userId: session.user.id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Passkey not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
