/**
 * Single source of truth for the legal-public-facing data Clara renders on
 * `/privacy`, `/terms`, the consent checkbox at signup, and the "Acceptance"
 * step of the onboarding wizard.
 *
 * Three invariants:
 * 1. **Versioning is the demonstrable-consent anchor.** When this file's
 *    `CURRENT_TERMS_VERSION` (or `CURRENT_PRIVACY_VERSION`) is bumped,
 *    every user whose `User.acceptedTermsVersion` no longer matches is
 *    forced through `/accept-terms` before they can use the app. Bumps
 *    happen alongside the matching update to `marketing-content.ts`.
 * 2. **No personal email is exposed to the client.** Public contact goes
 *    through `/contact` (form + Turnstile). The internal notification
 *    address lives in `CONTACT_NOTIFY_EMAIL` (server-only env, never sent
 *    to the browser).
 * 3. **Self-hosters can pin their own controller.** Setting
 *    `LEGAL_CONTROLLER_NAME` and friends overrides the defaults we ship
 *    for the trefolio.com hosted instance. When unset on a non-trefolio
 *    deploy, `legalController()` returns a `selfHosted: true` shape so
 *    the privacy / terms pages can render a "configure your controller"
 *    banner instead of falsely claiming this maintainer is responsible.
 */

/**
 * Bumped when terms or privacy change in a way that affects user rights or
 * the data we collect. Patch-level wording fixes (typos, link updates) do
 * NOT require a bump — they would force every user to re-accept for nothing.
 */
export const CURRENT_TERMS_VERSION = "1.0";
export const CURRENT_PRIVACY_VERSION = "1.0";
export const TERMS_LAST_UPDATED = "2026-05-01";
export const PRIVACY_LAST_UPDATED = "2026-05-01";

export interface LegalController {
  /** Display name shown on /privacy and /terms. */
  name: string;
  /** Free-text country/jurisdiction. Drives "ley aplicable" copy on /terms. */
  jurisdiction: string;
  /** True when running on the maintainer-hosted instance (trefolio). */
  trefolioHosted: boolean;
  /** True when env vars are missing AND we don't recognise the host as
   *  trefolio's. The privacy/terms pages render a configuration banner. */
  selfHosted: boolean;
}

/**
 * `true` when the running instance is the canonical trefolio-hosted Clara.
 * We intentionally avoid sniffing `Host` / referer (would race with edge
 * caching). The env contract is explicit: set `CLARA_TREFOLIO_HOSTED=1`
 * on the production deploy in Vercel, leave unset elsewhere.
 */
function isTrefolioHosted(): boolean {
  return process.env.CLARA_TREFOLIO_HOSTED === "1";
}

/**
 * Resolve the controller for the current deployment. Order:
 * 1. Explicit env overrides (`LEGAL_CONTROLLER_NAME` + `LEGAL_JURISDICTION`).
 *    Both must be present; a partial override is treated as "self-host
 *    pending configuration" so the operator notices the hole.
 * 2. Trefolio-hosted defaults when `CLARA_TREFOLIO_HOSTED=1`.
 * 3. Self-host pending: render the banner, no false claim of authorship.
 */
export function legalController(): LegalController {
  const envName = process.env.LEGAL_CONTROLLER_NAME?.trim();
  const envJurisdiction = process.env.LEGAL_JURISDICTION?.trim();
  if (envName && envJurisdiction) {
    return {
      name: envName,
      jurisdiction: envJurisdiction,
      trefolioHosted: false,
      selfHosted: false,
    };
  }
  if (isTrefolioHosted()) {
    return {
      name: "Marcos Suarez (Clara, proyecto open source MIT)",
      jurisdiction: "España (UE)",
      trefolioHosted: true,
      selfHosted: false,
    };
  }
  return {
    name: "[Operador self-hosted pendiente de configurar]",
    jurisdiction: "[Pendiente de configurar]",
    trefolioHosted: false,
    selfHosted: true,
  };
}

/**
 * Server-only address used by `/api/contact` to ping the admin when a new
 * contact message arrives. Returns `null` when not configured (best-effort:
 * the message still persists; just no email goes out). Never call this from
 * client components.
 */
export function getContactNotifyEmail(): string | null {
  const value = process.env.CONTACT_NOTIFY_EMAIL?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * Server-only address used by `src/lib/signup-notify.ts` to ping the admin
 * when a new user signs up. Reads `SIGNUP_NOTIFY_EMAIL` and returns `null`
 * when unset (best-effort: signup still succeeds; just no notification goes
 * out — fine for self-hosters and local dev). Never hardcode a default
 * here; the trefolio-hosted destination lives in Vercel project env vars.
 *
 * Never call this from client components.
 */
export function getSignupNotifyEmail(): string | null {
  const value = process.env.SIGNUP_NOTIFY_EMAIL?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * `true` when the running user has accepted the current pair of legal
 * documents. Use to gate the `(app)` layout and the chat agent.
 */
export function hasCurrentConsent(
  acceptedAt: Date | null,
  acceptedVersion: string | null,
): boolean {
  if (!acceptedAt) return false;
  if (!acceptedVersion) return false;
  return acceptedVersion === CURRENT_TERMS_VERSION;
}
