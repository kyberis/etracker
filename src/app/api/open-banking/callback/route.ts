import { NextResponse } from "next/server";

import { encryptSecret } from "@/lib/crypto";
import { createActiveConnection } from "@/lib/db/bank-connections";
import { isOpenBankingAvailable } from "@/lib/enable-banking/access";
import { isEnableBankingEnabled } from "@/lib/enable-banking/config";
import { createSession } from "@/lib/enable-banking/client";
import { verifyOAuthState } from "@/lib/enable-banking/oauth-state";
import { log } from "@/lib/log";
import { linkSessionAccounts, syncConnection } from "@/lib/bank-sync/sync-connection";

function settingsRedirect(request: Request, params: Record<string, string>) {
  const url = new URL("/settings", request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  if (!isEnableBankingEnabled()) {
    return settingsRedirect(request, { openBanking: "unavailable" });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    log.warn("enable_banking.auth.failed", { error });
    return settingsRedirect(request, { openBanking: "denied" });
  }
  if (!code || !state) {
    return settingsRedirect(request, { openBanking: "invalid" });
  }

  let payload;
  try {
    payload = verifyOAuthState(state);
  } catch {
    return settingsRedirect(request, { openBanking: "invalid" });
  }

  if (!(await isOpenBankingAvailable(payload.userId))) {
    return settingsRedirect(request, { openBanking: "unavailable" });
  }

  try {
    const session = await createSession({ userId: payload.userId, code });
    if (!session.accounts.length) {
      log.warn("enable_banking.auth.failed", {
        userId: payload.userId,
        reason: "empty_accounts",
      });
      return settingsRedirect(request, { openBanking: "empty" });
    }

    const validUntil = session.access?.valid_until
      ? new Date(session.access.valid_until)
      : null;
    const connection = await createActiveConnection({
      userId: payload.userId,
      institutionName: payload.institutionName,
      institutionCountry: payload.institutionCountry,
      encryptedSessionId: encryptSecret(session.session_id),
      validUntil,
    });
    const linked = await linkSessionAccounts({
      userId: payload.userId,
      connectionId: connection.id,
      institutionName: payload.institutionName,
      accounts: session.accounts,
    });
    if (linked === 0) {
      return settingsRedirect(request, { openBanking: "empty" });
    }

    log.info("enable_banking.auth.complete", {
      userId: payload.userId,
      connectionId: connection.id,
      accounts: linked,
    });

    await syncConnection({
      connectionId: connection.id,
      trigger: "callback",
    });

    return settingsRedirect(request, { openBanking: "connected" });
  } catch (err) {
    log.warn("enable_banking.auth.failed", {
      userId: payload.userId,
      message: err instanceof Error ? err.message : String(err),
    });
    return settingsRedirect(request, { openBanking: "failed" });
  }
}
