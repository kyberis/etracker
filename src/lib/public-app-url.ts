/**
 * Base URL reachable by external services (Twilio fetching TTS audio, webhooks).
 */
export function getPublicAppBaseUrl(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel}`;
  return null;
}
