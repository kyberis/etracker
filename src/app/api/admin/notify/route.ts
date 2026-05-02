import { z } from "zod";
import { Resend } from "resend";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { log } from "@/lib/log";
import { requireAdminUserId } from "@/lib/session";
import { sendTelegramMessage } from "@/lib/telegram/client";

/**
 * Admin-only: send an out-of-band message to a user. Used for operator-driven
 * incident comms (e.g. "Clara was down, you can talk to her again now") that
 * don't fit the AI agent loop.
 *
 * Channel selection:
 *   - If the user has linked Telegram, send via the bot (instant, in-context).
 *   - Otherwise fall back to a plain-text Resend email.
 *   - If neither is configured, return `channel: "none"` and let the admin
 *     UI surface the reason.
 *
 * Why not reuse the agent? This is intentionally a *human-authored* message —
 * we don't want the LLM rewriting incident notices.
 */

const FROM_ADDRESS_DEFAULT = "Clara <noreply@clara.trefolio.com>";
const SUBJECT_DEFAULT = "Mensaje de Clara";

const notifySchema = z.object({
  email: z.string().email("Invalid email."),
  message: z.string().min(1, "Message cannot be empty.").max(4000),
  subject: z.string().min(1).max(120).optional(),
});

export async function POST(request: Request) {
  return withApi(async () => {
    await requireAdminUserId();
    const body = await request.json();
    const { email, message, subject } = notifySchema.parse(body);

    const target = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        telegramChatId: true,
        telegramVerifiedAt: true,
      },
    });

    if (!target) {
      return jsonError("No user found with that email.", 404);
    }

    if (target.telegramChatId && target.telegramVerifiedAt) {
      try {
        await sendTelegramMessage(target.telegramChatId, message);
        log.info("admin.notify_sent", {
          channel: "telegram",
          userId: target.id,
        });
        return { channel: "telegram", sent: true };
      } catch (error) {
        log.error("admin.notify_telegram_failed", {
          userId: target.id,
          error: error instanceof Error ? error.message : String(error),
        });
        // Fall through to email so a single broken Telegram delivery doesn't
        // strand the message — the user still gets an alternate channel.
      }
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      log.warn("admin.notify_email_not_configured", { userId: target.id });
      return {
        channel: "none",
        sent: false,
        reason: "no_telegram_no_email",
      };
    }

    try {
      const resend = new Resend(apiKey);
      const { error } = await resend.emails.send({
        from: process.env.RESEND_FROM_ADDRESS || FROM_ADDRESS_DEFAULT,
        to: target.email,
        subject: subject || SUBJECT_DEFAULT,
        text: message,
      });
      if (error) {
        log.error("admin.notify_email_failed", {
          userId: target.id,
          error: error.message,
        });
        return { channel: "email", sent: false, reason: "send_failed" };
      }
      log.info("admin.notify_sent", { channel: "email", userId: target.id });
      return { channel: "email", sent: true };
    } catch (err) {
      log.error("admin.notify_email_threw", {
        userId: target.id,
        error: err instanceof Error ? err.message : String(err),
      });
      return { channel: "email", sent: false, reason: "send_failed" };
    }
  });
}
