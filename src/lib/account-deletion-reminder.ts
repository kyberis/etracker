/**
 * Soft-delete reminder emails (T-7 and T-1) sent by the daily
 * `/api/cron/account-purge` cron.
 *
 * Why: GDPR Art. 17 + recital 65 give us a grace window for self-service
 * erasure with the right to revoke. A 30-day silent timer is technically
 * compliant but UX-hostile — most users who soft-delete forget about it
 * and discover the data loss only when it's too late. Two reminders give
 * one strong nudge a week out and one final "last chance" one day out
 * without spamming the inbox.
 *
 * Send path mirrors `src/lib/verification-email.ts`: Resend via REST,
 * graceful degradation when `RESEND_API_KEY` is missing (logged URL,
 * `ok: false`, and we still mark the bit as sent to avoid infinite retry
 * — operators should fix Resend rather than have the cron flap).
 */

import { Resend } from "resend";

import {
  ACCOUNT_DELETION_GRACE_DAYS,
  type AccountDeletionReminderLabel,
} from "@/lib/account-deletion";
import type { Locale } from "@/lib/i18n/locale";
import { log } from "@/lib/log";

function getBaseUrl(): string {
  const candidate =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "http://localhost:3000";
  return candidate.replace(/\/$/, "");
}

function getFromAddress(): string {
  return (
    process.env.RESEND_FROM_ADDRESS || "Clara <noreply@clara.trefolio.com>"
  );
}

function asLocale(input: string | null | undefined): Locale {
  return input === "en" ? "en" : "es";
}

interface ReminderCopy {
  subject: string;
  heading: string;
  body: string;
  bullet: string;
  ctaLabel: string;
  ignore: string;
}

function copyFor(
  label: AccountDeletionReminderLabel,
  locale: Locale,
  daysRemaining: number,
  scheduledFor: string,
): ReminderCopy {
  if (label === "t_minus_7") {
    if (locale === "es") {
      return {
        subject: "Tu cuenta de Clara se borrará en una semana",
        heading: "Tu cuenta sigue en cola para borrarse",
        body: `Hace unos días pediste borrar tu cuenta de Clara. Si no hacés nada, la borramos definitivamente el ${scheduledFor} (en ${daysRemaining} días). Hasta entonces tus bancos, plantillas, gastos y ahorros siguen intactos.`,
        bullet: `Te quedan ${daysRemaining} días para recuperarla con un click. Si querés que la cuenta se borre como pediste, ignorá este email.`,
        ctaLabel: "Recuperar mi cuenta",
        ignore: "Si querés que se borre, no hace falta hacer nada: el cron hará el resto.",
      };
    }
    return {
      subject: "Your Clara account will be deleted in a week",
      heading: "Your account is still in the deletion queue",
      body: `A few days ago you asked us to delete your Clara account. If you do nothing we'll permanently erase it on ${scheduledFor} (in ${daysRemaining} days). Until then your banks, templates, expenses and savings are all still intact.`,
      bullet: `You have ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} left to restore it with one click. If you do want it gone, just ignore this email.`,
      ctaLabel: "Restore my account",
      ignore: "If you do want the deletion to go through, there's nothing to do — the cron will handle it.",
    };
  }
  // t_minus_1
  if (locale === "es") {
    return {
      subject: "Última oportunidad: tu cuenta de Clara se borra mañana",
      heading: "Mañana borramos todo de forma permanente",
      body: `Mañana (${scheduledFor}) borramos tu cuenta de Clara y todo lo asociado. Después no podemos recuperarla.`,
      bullet:
        "Si te arrepentiste, todavía estás a tiempo: tocá el botón y la cuenta vuelve a estar activa al instante.",
      ctaLabel: "Recuperar mi cuenta",
      ignore: "Si era lo que querías, no hace falta hacer nada.",
    };
  }
  return {
    subject: "Last chance: your Clara account will be deleted tomorrow",
    heading: "Tomorrow we erase everything permanently",
    body: `Tomorrow (${scheduledFor}) we'll permanently delete your Clara account and everything tied to it. After that we can't bring it back.`,
    bullet:
      "If you've changed your mind, you still have time: tap the button and the account is active again instantly.",
    ctaLabel: "Restore my account",
    ignore: "If this was the goal, you don't need to do anything.",
  };
}

function renderHtml(
  copy: ReminderCopy,
  restoreUrl: string,
  locale: Locale,
): string {
  return `<!DOCTYPE html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
        <tr><td style="padding:36px 32px 16px;">
          <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#0f172a;text-align:center;">${copy.heading}</h1>
          <p style="margin:0 0 16px;font-size:15px;color:#475569;text-align:left;line-height:1.6;">${copy.body}</p>
          <p style="margin:0 0 28px;font-size:14px;color:#475569;text-align:left;line-height:1.6;">${copy.bullet}</p>
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
            <tr><td align="center">
              <a href="${restoreUrl}" target="_blank" style="display:inline-block;padding:14px 36px;background-color:#0f172a;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;border-radius:10px;letter-spacing:0.2px;">${copy.ctaLabel}</a>
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 32px;"><div style="border-top:1px solid #e2e8f0;margin:24px 0;"></div></td></tr>
        <tr><td style="padding:0 32px 32px;">
          <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.5;">${copy.ignore}</p>
        </td></tr>
      </table>
      <p style="margin:24px 0 0;font-size:11px;color:#94a3b8;text-align:center;">&copy; ${new Date().getFullYear()} Clara · ${ACCOUNT_DELETION_GRACE_DAYS}-day grace</p>
    </td></tr>
  </table>
</body>
</html>`;
}

export interface ReminderSendResult {
  ok: boolean;
  reason?: "not_configured" | "send_failed";
}

interface SendArgs {
  email: string;
  locale: string | null | undefined;
  label: AccountDeletionReminderLabel;
  daysRemaining: number;
  scheduledFor: Date;
}

export async function sendAccountDeletionReminderEmail(
  args: SendArgs,
): Promise<ReminderSendResult> {
  const locale = asLocale(args.locale);
  const fmtScheduled = new Intl.DateTimeFormat(
    locale === "es" ? "es-AR" : "en-US",
    { day: "numeric", month: "long", year: "numeric" },
  ).format(args.scheduledFor);
  const copy = copyFor(args.label, locale, args.daysRemaining, fmtScheduled);
  const restoreUrl = `${getBaseUrl()}/account/restore?utm_source=email&utm_medium=reminder&utm_campaign=${args.label}`;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    log.warn("account_deletion_reminder.not_configured", {
      email: args.email,
      label: args.label,
      restoreUrl,
    });
    return { ok: false, reason: "not_configured" };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: args.email,
      subject: copy.subject,
      html: renderHtml(copy, restoreUrl, locale),
    });
    if (error) {
      log.error("account_deletion_reminder.send_failed", {
        email: args.email,
        label: args.label,
        error: error.message,
      });
      return { ok: false, reason: "send_failed" };
    }
    log.info("account_deletion_reminder.sent", {
      email: args.email,
      label: args.label,
      daysRemaining: args.daysRemaining,
    });
    return { ok: true };
  } catch (err) {
    log.error("account_deletion_reminder.send_threw", {
      email: args.email,
      label: args.label,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "send_failed" };
  }
}
