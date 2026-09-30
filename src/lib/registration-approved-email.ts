import { Resend } from "resend";

import { log } from "@/lib/log";
import type { Locale } from "@/lib/i18n/locale";
import { getPublicAppBaseUrl } from "@/lib/public-app-url";

function getFromAddress(): string {
  return process.env.RESEND_FROM_ADDRESS || "Clara <noreply@clara.trefolio.com>";
}

export async function sendRegistrationApprovedEmail(args: {
  email: string;
  locale?: Locale | string | null;
}): Promise<{ ok: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const base = (getPublicAppBaseUrl() || "http://localhost:3001").replace(/\/$/, "");
  const loginUrl = `${base}/login`;
  const es = (args.locale || "es").toLowerCase().startsWith("es");
  const subject = es ? "Tu cuenta ya está habilitada" : "Your Clara account is ready";
  const body = es
    ? "Un administrador habilitó tu cuenta. Ya podés entrar a Clara."
    : "An administrator enabled your account. You can sign in to Clara now.";
  const cta = es ? "Entrar a Clara" : "Open Clara";

  if (!apiKey) {
    log.info("registration_approved_email_skipped", {
      email: args.email,
      reason: "RESEND_API_KEY_unset",
      loginUrl,
    });
    return { ok: false };
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: getFromAddress(),
      to: args.email,
      subject,
      text: `${body}\n\n${cta}: ${loginUrl}`,
      html: `<p>${body}</p><p><a href="${loginUrl}">${cta}</a></p>`,
    });
    if (error) {
      log.warn("registration_approved_email_failed", { error: error.message });
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    log.warn("registration_approved_email_threw", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false };
  }
}
