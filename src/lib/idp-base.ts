/**
 * Resolve the trefolio IdP base URL with sensible per-environment
 * defaults so that:
 *
 *   - Local dev      → `http://localhost:3300` (set via `.env.local`)
 *   - Production     → `https://user.trefolio.com` (built-in fallback,
 *                       overridable through Vercel env vars)
 *
 * Returning an empty string in dev when no env var is set keeps the
 * trefolio-id NextAuth provider from registering at all (its config is
 * gated on `IDP_BASE_URL` being truthy in `lib/auth.ts`).
 */
const PROD_IDP_BASE_URL = "https://user.trefolio.com";

export function getIdpBaseUrl(): string {
  const v = process.env.IDP_BASE_URL?.trim();
  if (v) return v.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") return PROD_IDP_BASE_URL;
  return "";
}
