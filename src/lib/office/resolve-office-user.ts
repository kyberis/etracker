import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

import type { OfficeUserLookup } from "./idp-service-auth";

const userSelect = {
  id: true,
  email: true,
  idpSub: true,
  savings: true,
  monthlyIncome: true,
  primaryCurrency: true,
  isActive: true,
  kind: true,
} satisfies Prisma.UserSelect;

export type ResolvedOfficeUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

/**
 * Resolve the Clara user Warren is coordinating for. Prefer IdP `sub`,
 * fall back to email for legacy rows, optionally backfill `idpSub`.
 */
export async function resolveOfficeUser(lookup: OfficeUserLookup): Promise<ResolvedOfficeUser | null> {
  const sub = lookup.sub?.trim();
  const email = lookup.email?.trim().toLowerCase();

  let user: ResolvedOfficeUser | null = null;

  if (sub) {
    user = await db.user.findFirst({
      where: { idpSub: sub, isActive: true, kind: "REGULAR" },
      select: userSelect,
    });
  }

  if (!user && email) {
    user = await db.user.findUnique({
      where: { email },
      select: userSelect,
    });
    if (user && (!user.isActive || user.kind !== "REGULAR")) {
      user = null;
    }
  }

  if (user && sub && !user.idpSub) {
    await db.user.update({
      where: { id: user.id },
      data: { idpSub: sub },
    });
    user = { ...user, idpSub: sub };
  }

  return user;
}
