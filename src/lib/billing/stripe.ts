import Stripe from "stripe";

import { isFeatureEnabled } from "@/lib/feature-flags";

/**
 * Singleton Stripe client. Returns null when `STRIPE_SECRET_KEY` is not
 * set so self-hosters never accidentally hit Stripe. All callers must
 * tolerate the null path and degrade gracefully.
 */
let _stripe: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (_stripe !== undefined) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    _stripe = null;
    return null;
  }
  _stripe = new Stripe(key, {
    // Pinned to the SDK's bundled API version. Bumping the SDK rebumps
    // this constant — see Stripe API release notes before doing so.
    apiVersion: "2025-10-29.clover",
    appInfo: {
      name: "Clara (etracker)",
      url: "https://github.com/kyberis/etracker",
    },
  });
  return _stripe;
}

/**
 * `true` only when *all* billing envs are configured. Callers should
 * treat this as a hard precondition; the admin feature flag is a separate
 * gate on top.
 */
export function isBillingEnabled(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_WEBHOOK_SECRET &&
      process.env.STRIPE_PRICE_ID_SUPPORTER,
  );
}

/**
 * Combined gate consumed by every user-facing surface that shows the
 * upsell (chat 429 payload, modal CTAs, settings card, marketing
 * `/upgrade` page). Both must be true:
 *  - billing envs exist (hosted-only invariant)
 *  - the `quota_upsell` feature flag is on for this user (or globally)
 */
export async function isUpsellActive(userId?: string): Promise<boolean> {
  if (!isBillingEnabled()) return false;
  return isFeatureEnabled("quota_upsell", userId);
}
