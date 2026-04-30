import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { requireUserId } from "@/lib/session";
import {
  TELEGRAM_LINK_TTL_MINUTES,
  buildTelegramDeepLink,
  generateTelegramLinkCode,
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
        telegramLinkCode: true,
        telegramLinkCodeExpires: true,
      },
    });
    if (!user) return jsonError("User not found.", 404);

    const pending =
      user.telegramLinkCode &&
      user.telegramLinkCodeExpires &&
      user.telegramLinkCodeExpires.getTime() > Date.now();

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
      pendingCode: pending ? user.telegramLinkCode : null,
      pendingExpiresAt: pending ? user.telegramLinkCodeExpires!.toISOString() : null,
    };
  });
}

/**
 * POST → mints a short random code (Telegram `?start=` max 64 chars), stores it
 * on the user row, and returns the `t.me/<bot>` URL to open in a new tab.
 */
export async function POST() {
  return withApi(async () => {
    const userId = await requireUserId();
    const expiresAt = new Date(
      Date.now() + TELEGRAM_LINK_TTL_MINUTES * 60 * 1000,
    );

    for (let attempt = 0; attempt < 16; attempt++) {
      const code = generateTelegramLinkCode();
      const owner = await db.user.findUnique({
        where: { telegramLinkCode: code },
        select: { id: true },
      });
      if (owner && owner.id !== userId) {
        continue;
      }

      await db.user.update({
        where: { id: userId },
        data: {
          telegramLinkCode: code,
          telegramLinkCodeExpires: expiresAt,
        },
      });

      const url = buildTelegramDeepLink(code);
      return {
        url,
        code,
        ttlMinutes: TELEGRAM_LINK_TTL_MINUTES,
        expiresAt: expiresAt.toISOString(),
      };
    }

    return jsonError("Could not mint a link code, try again.", 503);
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
        telegramLinkCode: null,
        telegramLinkCodeExpires: null,
      },
    });
    return { ok: true };
  });
}
