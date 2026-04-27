/**
 * Whether Google OAuth is configured (safe to expose: only reflects presence of client id + secret).
 */
export function isGoogleAuthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}
