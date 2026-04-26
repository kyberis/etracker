import crypto from "node:crypto";

import { db } from "@/lib/db";

export const LINK_CODE_TTL_MINUTES = 15;

export function generateLinkCode(): string {
  // 6-digit numeric code, easy to type on a phone keyboard.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * Normalize a phone number from the user or from a Twilio webhook payload to
 * a canonical E.164 string starting with `+`. Twilio sends numbers as
 * `whatsapp:+5491134567890`; the caller is expected to strip the channel
 * prefix before calling this function.
 */
export function normalizePhone(value: string): string | null {
  const trimmed = value.replace(/[\s\-()]/g, "");
  if (/^\+[1-9]\d{6,14}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^[1-9]\d{6,14}$/.test(trimmed)) {
    return `+${trimmed}`;
  }
  return null;
}

/**
 * Pick up to one user with an active link code that matches the value the user
 * sent over WhatsApp. We accept the bare 6-digit code as well as a
 * `LINK 123456` shorthand.
 */
export async function findUserByLinkCode(rawText: string) {
  const match = rawText.match(/(\d{6})/);
  if (!match) return null;
  const code = match[1];
  const user = await db.user.findFirst({
    where: {
      whatsappLinkCode: code,
      whatsappLinkCodeExpires: { gt: new Date() },
    },
  });
  return user ? { user, code } : null;
}
