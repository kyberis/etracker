import { NextResponse } from "next/server";

import { buildIdpUpgradeUrlForClara, shouldSendUsersToUnifiedIdp } from "@/lib/idp-base";
import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";

/**
 * Returns `{ url }` to the unified IdP checkout page (`user.trefolio.com/upgrade`).
 * Same Stripe subscription as Warren — no Clara-local Stripe session.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    const userId = await requireUserId();
    if (!shouldSendUsersToUnifiedIdp()) {
      return jsonError("Unified billing is not enabled.", 503);
    }

    let interval: "monthly" | "annual" = "monthly";
    try {
      const body = (await request.json()) as { interval?: string };
      if (body.interval === "annual") interval = "annual";
    } catch {
      /* default monthly */
    }

    const row = await db.user.findUnique({
      where: { id: userId },
      select: { idpSub: true },
    });

    const url = buildIdpUpgradeUrlForClara(row?.idpSub ?? null, { interval });
    return NextResponse.json({ url });
  });
}
