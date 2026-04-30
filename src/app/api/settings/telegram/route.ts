import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import {
  TELEGRAM_LINK_TTL_MINUTES,
  buildTelegramDeepLink,
  signLinkToken,
} from "@/lib/telegram/link";

/**
 * GET → status of the Telegram link for the current user. The web settings
 * UI uses this to decide whether to render "Conectar Telegram" or
 * "Desvincular".
 */
export async function GET() {
  return withApi(async () => {
    const userId = await requireUserId();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        telegramUserId: true,
        telegramUsername: true,
        telegramVerifiedAt: true,
      },
    });
    if (!user) return jsonError("User not found.", 404);

    return {
      linked: Boolean(user.telegramVerifiedAt),
      username: user.telegramVerifiedAt ? user.telegramUsername : null,
      // We expose the numeric id as a string so JSON consumers don't lose
      // precision on a 64-bit Telegram user id.
      telegramUserId:
        user.telegramVerifiedAt && user.telegramUserId !== null
          ? user.telegramUserId.toString()
          : null,
      verifiedAt: user.telegramVerifiedAt,
    };
  });
}

/**
 * POST → mints a fresh signed deep-link token and returns the `t.me/<bot>`
 * URL the browser should open in a new tab. The token is stateless, so we
 * don't persist anything on the user row at this point: the webhook
 * verifies the HMAC and writes the link only once Telegram echoes back.
 */
export async function POST() {
  return withApi(async () => {
    const userId = await requireUserId();
    const token = signLinkToken(userId);
    const url = buildTelegramDeepLink(token);
    return {
      url,
      token,
      ttlMinutes: TELEGRAM_LINK_TTL_MINUTES,
      expiresAt: new Date(
        Date.now() + TELEGRAM_LINK_TTL_MINUTES * 60 * 1000,
      ).toISOString(),
    };
  });
}

/**
 * DELETE → unlinks the user from Telegram. We clear the four columns at once
 * so a future re-link starts from a clean slate. Any existing
 * `TelegramMessage` rows stay (cascade only fires on user delete).
 */
export async function DELETE() {
  return withApi(async () => {
    const userId = await requireUserId();
    await db.user.update({
      where: { id: userId },
      data: {
        telegramUserId: null,
        telegramUsername: null,
        telegramChatId: null,
        telegramVerifiedAt: null,
      },
    });
    return { ok: true };
  });
}
