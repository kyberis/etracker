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
const DEV_STACK_IDP_BASE_URL = "https://user.trefolio-dev.com";

/** True only on a real Vercel production deployment — not `next dev` with stray `VERCEL=*` from `vercel env pull`. */
function isVercelProduction(): boolean {
  return (
    process.env.VERCEL === "1" &&
    process.env.VERCEL_ENV === "production" &&
    process.env.NODE_ENV === "production"
  );
}

/** True when the app is configured for the Caddy `*.trefolio-dev.com` stack. */
function isTrefolioDevStackAppUrl(): boolean {
  const a = process.env.NEXTAUTH_URL?.trim() || "";
  const b = process.env.VERCEL_URL?.trim() || "";
  return /\btrefolio-dev\.com\b/i.test(a) || /\btrefolio-dev\.com\b/i.test(b);
}

export function getIdpBaseUrl(): string {
  const v = process.env.IDP_BASE_URL?.trim();
  if (v) {
    const cleaned = v.replace(/\/+$/, "");
    // Caddy dev: never send the browser to production IdP when this app runs on *.trefolio-dev.com
    if (
      isTrefolioDevStackAppUrl() &&
      /^https?:\/\/(www\.)?user\.trefolio\.com\b/i.test(cleaned) &&
      process.env.IDP_ALLOW_PRODUCTION_IDP_BASE !== "true"
    ) {
      console.warn(
        `[idp] IDP_BASE_URL points at production ${PROD_IDP_BASE_URL} while NEXTAUTH_URL/VERCEL_URL is *.trefolio-dev.com; using ${DEV_STACK_IDP_BASE_URL}`,
      );
      return DEV_STACK_IDP_BASE_URL;
    }
    // Vercel prod only: never send real users to a loopback IdP (mis-set env).
    if (
      isVercelProduction() &&
      /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(cleaned)
    ) {
      console.warn(
        "[idp] IDP_BASE_URL points at loopback on Vercel production; using %s",
        PROD_IDP_BASE_URL,
      );
      return PROD_IDP_BASE_URL;
    }
    return cleaned;
  }
  if (process.env.NODE_ENV === "production") return PROD_IDP_BASE_URL;
  return "";
}

/**
 * Whether Clara is configured for unified IdP OAuth (`trefolio-id` only).
 */
export function isClaraIdpOAuthConfigured(): boolean {
  return (
    Boolean(getIdpBaseUrl()) &&
    Boolean(process.env.IDP_CLIENT_ID?.trim()) &&
    Boolean(process.env.IDP_CLIENT_SECRET?.trim())
  );
}

/**
 * @deprecated Use {@link isClaraIdpOAuthConfigured}.
 */
export function shouldSendUsersToUnifiedIdp(): boolean {
  return isClaraIdpOAuthConfigured();
}

/**
 * Browser-facing IdP origin for links (upgrade, portal). Prefer `IDP_ISSUER`
 * when set so production never advertises `http://localhost:3300`.
 */
export function getIdpBrowserOrigin(): string {
  const iss = process.env.IDP_ISSUER?.trim().replace(/\/+$/g, "");
  if (iss) return iss;
  return getIdpBaseUrl();
}

/**
 * Public upgrade URL on the IdP (Trefolio Pro). `sub` is optional but
 * recommended so the IdP can pre-select the account.
 */
export function buildIdpUpgradeUrlForClara(
  idpSub: string | null | undefined,
  opts?: { interval?: "monthly" | "annual" },
): string {
  const base = getIdpBrowserOrigin() || getIdpBaseUrl();
  const u = new URL(`${base}/upgrade`);
  u.searchParams.set("from", "clara");
  if (idpSub) u.searchParams.set("sub", idpSub);
  if (opts?.interval) u.searchParams.set("interval", opts.interval);
  return u.toString();
}

/**
 * Stripe Customer Portal on the IdP (GET, session cookie on user host).
 * Only when unified IdP auth is active for this deployment.
 */
export function buildIdpBillingPortalUrlForClara(): string | null {
  if (!isClaraIdpOAuthConfigured()) return null;
  const origin = getIdpBrowserOrigin();
  if (!origin) return null;
  return `${origin.replace(/\/+$/, "")}/api/billing/portal?from=clara`;
}

/** Unified account hub on user.trefolio.com (profile, passkeys, password). */
export function buildIdpAccountUrlForClara(): string | null {
  if (!isClaraIdpOAuthConfigured()) return null;
  const origin = getIdpBrowserOrigin();
  if (!origin) return null;
  const u = new URL(`${origin.replace(/\/+$/, "")}/account`);
  u.searchParams.set("from", "clara");
  return u.toString();
}
