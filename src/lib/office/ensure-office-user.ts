import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

const FREE_DAILY_LIMIT = 30;

const userSelect = {
  id: true,
  email: true,
  idpSub: true,
  name: true,
} satisfies Prisma.UserSelect;

export type EnsuredOfficeUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export interface EnsureOfficeUserInput {
  sub: string;
  email: string;
  name?: string | null;
  /** Optional daily limit from IdP entitlements; defaults to free tier. */
  dailyAgentMessageLimit?: number;
}

export type EnsureOfficeUserResult =
  | { ok: true; created: boolean; user: EnsuredOfficeUser }
  | { ok: false; error: "missing_sub" | "missing_email" | "inactive_user" | "email_conflict" };

/**
 * Idempotent S2S provision of a Clara REGULAR user keyed by IdP `sub`.
 * Does not stamp acceptedTermsAt / onboardingCompletedAt — Clara’s own
 * consent and onboarding gates still run on first visit to /app.
 */
export async function ensureOfficeUser(
  input: EnsureOfficeUserInput,
): Promise<EnsureOfficeUserResult> {
  const sub = input.sub.trim();
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;
  const dailyLimit =
    typeof input.dailyAgentMessageLimit === "number" &&
    Number.isFinite(input.dailyAgentMessageLimit) &&
    input.dailyAgentMessageLimit > 0
      ? Math.floor(input.dailyAgentMessageLimit)
      : FREE_DAILY_LIMIT;

  if (!sub) return { ok: false, error: "missing_sub" };
  if (!email || !email.includes("@")) return { ok: false, error: "missing_email" };

  const bySub = await db.user.findFirst({
    where: { idpSub: sub },
    select: { ...userSelect, isActive: true, kind: true },
  });

  if (bySub) {
    if (!bySub.isActive || bySub.kind !== "REGULAR") {
      return { ok: false, error: "inactive_user" };
    }
    const updated = await db.user.update({
      where: { id: bySub.id },
      data: {
        email,
        ...(name ? { name } : {}),
        dailyAgentMessageLimit: dailyLimit,
      },
      select: userSelect,
    });
    return { ok: true, created: false, user: updated };
  }

  const byEmail = await db.user.findUnique({
    where: { email },
    select: { ...userSelect, isActive: true, kind: true, idpSub: true },
  });

  if (byEmail) {
    if (!byEmail.isActive || byEmail.kind !== "REGULAR") {
      return { ok: false, error: "inactive_user" };
    }
    if (byEmail.idpSub && byEmail.idpSub !== sub) {
      return { ok: false, error: "email_conflict" };
    }
    const updated = await db.user.update({
      where: { id: byEmail.id },
      data: {
        idpSub: sub,
        ...(name ? { name } : {}),
        dailyAgentMessageLimit: dailyLimit,
      },
      select: userSelect,
    });
    return { ok: true, created: false, user: updated };
  }

  const created = await db.user.create({
    data: {
      email,
      idpSub: sub,
      name,
      dailyAgentMessageLimit: dailyLimit,
      kind: "REGULAR",
      isActive: true,
    },
    select: userSelect,
  });

  return { ok: true, created: true, user: created };
}
