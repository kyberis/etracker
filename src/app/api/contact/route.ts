import { Resend } from "resend";

import { db } from "@/lib/db";
import { jsonError, withApi } from "@/lib/http";
import { getAuthSession } from "@/lib/auth";
import { getContactNotifyEmail, legalController } from "@/lib/legal";
import { log } from "@/lib/log";
import { getPublicAppBaseUrl } from "@/lib/public-app-url";
import { limitByIp } from "@/lib/rate-limit";
import { getClientIp, verifyTurnstileToken } from "@/lib/turnstile";
import { contactMessageSchema } from "@/lib/validators";

/**
 * Public contact endpoint. The companion form lives at `/[lang]/contact`.
 * Flow:
 *  1. Rate-limit by IP (5 / hour) — defends against drive-by spam.
 *  2. Verify Turnstile (skipped on localhost / when not configured).
 *  3. Persist a `ContactMessage` row with `userId` set when there's a
 *     session, plus truncated IP and UA for the 90-day anti-abuse window.
 *  4. Best-effort Resend notification to `CONTACT_NOTIFY_EMAIL` so the
 *     admin sees inbound traffic even before opening `/admin/contact`.
 *     Resend failure does NOT block the success response — the message is
 *     already persisted and visible in the bandeja.
 */
export async function POST(request: Request) {
  return withApi(async () => {
    const limited = await limitByIp(
      request,
      "contact-form",
      5,
      "1 h",
      "Too many submissions. Try again in an hour.",
    );
    if (!limited.ok) return limited.response;

    const body = await request.json().catch(() => ({}));
    const payload = contactMessageSchema.parse(body);

    const ip = getClientIp(request.headers);
    const captchaOk = await verifyTurnstileToken(
      payload.turnstileToken,
      ip,
      request.headers.get("host"),
    );
    if (!captchaOk) {
      return jsonError(
        "We couldn't validate the captcha. Reload the page and try again.",
        403,
      );
    }

    const session = await getAuthSession();
    const userId = session?.user?.id ?? null;
    const userAgent = request.headers.get("user-agent")?.slice(0, 500) ?? null;

    const message = await db.contactMessage.create({
      data: {
        kind: payload.kind,
        name: payload.name,
        email: payload.email,
        body: payload.body,
        userId,
        ip: ip || null,
        userAgent,
      },
      select: { id: true },
    });

    void notifyAdmin({
      messageId: message.id,
      kind: payload.kind,
      name: payload.name,
      email: payload.email,
      body: payload.body,
      userId,
      requestUrl: request.url,
    });

    return new Response(
      JSON.stringify({ ok: true, id: message.id }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  });
}

interface NotifyArgs {
  messageId: string;
  kind: "PRIVACY" | "ABUSE" | "BUG" | "GENERAL";
  name: string;
  email: string;
  body: string;
  userId: string | null;
  requestUrl: string;
}

/**
 * Best-effort transactional ping to the controller. Returns nothing useful;
 * any error is logged and swallowed.
 *
 * Email body is English-only: this path is not user-facing, but we keep
 * operator mail neutral so `no-spanish-in-api-errors` can treat all
 * `src/app/api/**` strings as safe for international EN users.
 */
async function notifyAdmin(args: NotifyArgs): Promise<void> {
  const to = getContactNotifyEmail();
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !apiKey) {
    log.info("contact_message_persisted", {
      messageId: args.messageId,
      kind: args.kind,
      notified: false,
      reason: !to ? "CONTACT_NOTIFY_EMAIL_unset" : "RESEND_API_KEY_unset",
    });
    return;
  }

  const baseUrl =
    getPublicAppBaseUrl() ?? new URL(args.requestUrl).origin;
  const adminLink = `${baseUrl}/admin/contact/${args.messageId}`;
  const controller = legalController();
  const fromAddress =
    process.env.RESEND_FROM_ADDRESS || "Clara <noreply@clara.trefolio.com>";

  const subject = `[${args.kind}] ${args.name} via /contact`;
  const text = [
    `New /contact message`,
    `Controller: ${controller.name}`,
    "",
    `Kind: ${args.kind}`,
    `Name: ${args.name}`,
    `Email: ${args.email}`,
    args.userId ? `Signed-in user: ${args.userId}` : "Signed-in user: (anonymous)",
    "",
    "Message:",
    args.body,
    "",
    `Inbox: ${adminLink}`,
  ].join("\n");

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: fromAddress,
      to,
      replyTo: args.email,
      subject,
      text,
    });
    if (error) {
      log.warn("contact_message_email_failed", {
        messageId: args.messageId,
        error: error.message,
      });
      return;
    }
    log.info("contact_message_email_sent", {
      messageId: args.messageId,
      kind: args.kind,
    });
  } catch (err) {
    log.warn("contact_message_email_threw", {
      messageId: args.messageId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
