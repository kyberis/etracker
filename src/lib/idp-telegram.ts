import { getIdpBaseUrl } from "@/lib/idp-base";
import { log } from "@/lib/log";

/**
 * Registers the Telegram user id ↔ IdP `sub` mapping on user.trefolio.com.
 * No-op when IdP service credentials are missing.
 */
export async function idpRegisterTelegramUser(
  tgUserId: bigint | number,
  idpSub: string,
): Promise<void> {
  const base = getIdpBaseUrl();
  const token = process.env.IDP_SERVICE_TOKEN?.trim();
  if (!base || !token || !idpSub) return;

  const res = await fetch(`${base}/api/v1/telegram/link`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tgUserId: String(tgUserId), sub: idpSub }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    log.warn("idp.telegram_link_failed", {
      status: res.status,
      bodyPreview: body.slice(0, 200),
    });
  }
}

/** Returns IdP `sub` for a Telegram user id, or null if not linked at the IdP. */
export async function idpResolveSubForTelegramUser(
  tgUserId: number,
): Promise<string | null> {
  const base = getIdpBaseUrl();
  const token = process.env.IDP_SERVICE_TOKEN?.trim();
  if (!base || !token) return null;
  try {
    const res = await fetch(`${base}/api/v1/telegram/by-id/${tgUserId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sub?: string };
    return typeof data.sub === "string" ? data.sub : null;
  } catch {
    return null;
  }
}
