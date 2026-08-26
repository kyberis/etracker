import { cache } from "react";
import { BankConnectionStatus } from "@prisma/client";

import { listUserConnections } from "@/lib/db/bank-connections";
import { db } from "@/lib/db";
import type { OpenBankingCtaKind } from "@/lib/enable-banking/cta";
import { isEnableBankingEnabled } from "@/lib/enable-banking/config";
import { isFeatureEnabled } from "@/lib/feature-flags";

export type { OpenBankingCtaKind };

/** Phase 1: Open Banking is operator-only (admin accounts). */
async function isOpenBankingAdmin(userId: string): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true, isActive: true },
  });
  return Boolean(user?.isActive && user.isAdmin);
}

export async function assertOpenBankingAvailable(userId: string): Promise<void> {
  if (!isEnableBankingEnabled()) {
    throw new Error("ENABLE_BANKING_NOT_CONFIGURED");
  }
  if (!(await isOpenBankingAdmin(userId))) {
    throw new Error("OPEN_BANKING_DISABLED");
  }
  const enabled = await isFeatureEnabled("open_banking", userId);
  if (!enabled) {
    throw new Error("OPEN_BANKING_DISABLED");
  }
}

export async function isOpenBankingAvailable(userId: string): Promise<boolean> {
  if (!isEnableBankingEnabled()) return false;
  if (!(await isOpenBankingAdmin(userId))) return false;
  return isFeatureEnabled("open_banking", userId);
}

/**
 * Whether the web CTA should invite the user to connect or reconnect.
 * Deduped per request so layout + chat/banks pages share one lookup.
 */
export const getOpenBankingCtaKind = cache(
  async (userId: string): Promise<OpenBankingCtaKind | null> => {
    if (!(await isOpenBankingAvailable(userId))) return null;
    const connections = await listUserConnections(userId);
    if (connections.some((c) => c.status === BankConnectionStatus.NEEDS_REAUTH)) {
      return "reauth";
    }
    if (connections.some((c) => c.status === BankConnectionStatus.ACTIVE)) {
      return null;
    }
    return "connect";
  },
);
