/**
 * Best-effort admin notification when a new user signs up. Mirrors the
 * `notifyAdmin` helper in `src/app/api/contact/route.ts`:
 *
 *   - Resolves the destination via `getSignupNotifyEmail()` (env override
 *     `SIGNUP_NOTIFY_EMAIL`, defaults to `info@trefolio.com` on the
 *     trefolio-hosted instance).
 *   - Sends via Resend using `RESEND_API_KEY` + `RESEND_FROM_ADDRESS`.
 *   - Body is English-only — this path is operator-facing, not user-facing,
 *     so `no-spanish-in-api-errors` can keep treating `src/app/api/**`
 *     strings as safe for international EN users.
 *   - Any failure is logged and swallowed: a flaky Resend call must not
 *     break the signup flow.
 *
 * Wire up from both:
 *   - `POST /api/auth/register` (email + password path; user is created via
 *     `db.user.create` directly, bypassing the NextAuth adapter).
 *   - `authOptions.events.createUser` (Google OAuth path; the
 *     PrismaAdapter creates the row on first sign-in).
 */

import { Resend } from "resend";

import { getSignupNotifyEmail, legalController } from "@/lib/legal";
import { log } from "@/lib/log";
import { getPublicAppBaseUrl } from "@/lib/public-app-url";

export type SignupSource = "credentials" | "google" | "passkey" | "other";

export interface SignupNotifyArgs {
  userId: string;
  email: string;
  source: SignupSource;
}

export async function notifyAdminOfNewUser(
  args: SignupNotifyArgs,
): Promise<void> {
  const to = getSignupNotifyEmail();
  const apiKey = process.env.RESEND_API_KEY;
  if (!to || !apiKey) {
    log.info("signup_notify_skipped", {
      userId: args.userId,
      source: args.source,
      reason: !to ? "SIGNUP_NOTIFY_EMAIL_unset" : "RESEND_API_KEY_unset",
    });
    return;
  }

  const fromAddress =
    process.env.RESEND_FROM_ADDRESS || "Clara <noreply@clara.trefolio.com>";
  const baseUrl = getPublicAppBaseUrl();
  const adminLink = baseUrl ? `${baseUrl}/admin` : null;
  const controller = legalController();

  const subject = `[Clara] New signup: ${args.email}`;
  const text = [
    `New Clara signup`,
    `Controller: ${controller.name}`,
    "",
    `Email: ${args.email}`,
    `User ID: ${args.userId}`,
    `Source: ${args.source}`,
    `When: ${new Date().toISOString()}`,
    ...(adminLink ? ["", `Admin: ${adminLink}`] : []),
  ].join("\n");

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      text,
    });
    if (error) {
      log.warn("signup_notify_email_failed", {
        userId: args.userId,
        source: args.source,
        error: error.message,
      });
      return;
    }
    log.info("signup_notify_email_sent", {
      userId: args.userId,
      source: args.source,
    });
  } catch (err) {
    log.warn("signup_notify_email_threw", {
      userId: args.userId,
      source: args.source,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
