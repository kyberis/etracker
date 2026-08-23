import { cache } from "react";
import { BankConnectionStatus } from "@prisma/client";

import { listUserConnections } from "@/lib/db/bank-connections";
import type { OpenBankingCtaKind } from "@/lib/enable-banking/cta";
import { isEnableBankingEnabled } from "@/lib/enable-banking/config";
import { isFeatureEnabled } from "@/lib/feature-flags";

export type { OpenBankingCtaKind };

export async function assertOpenBankingAvailable(userId: string): Promise<void> {
  if (!isEnableBankingEnabled()) {
    throw new Error("ENABLE_BANKING_NOT_CONFIGURED");
  }
  const enabled = await isFeatureEnabled("open_banking", userId);
  if (!enabled) {
    throw new Error("OPEN_BANKING_DISABLED");
  }
}

export async function isOpenBankingAvailable(userId: string): Promise<boolean> {
  if (!isEnableBankingEnabled()) return false;
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
