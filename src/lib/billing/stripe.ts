import Stripe from "stripe";

import { isFeatureEnabled } from "@/lib/feature-flags";
import { shouldSendUsersToUnifiedIdp } from "@/lib/idp-base";

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
/** Donations + webhook only (no recurring price id required). */
export function isDonationBillingEnabled(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

/**
 * `true` when legacy Supporter subscription Stripe envs exist (unused when
 * unified IdP billing is on).
 */
export function isBillingEnabled(): boolean {
  return Boolean(
    isDonationBillingEnabled() && process.env.STRIPE_PRICE_ID_SUPPORTER,
  );
}

/**
 * Combined gate for upsell surfaces. With unified IdP, subscription CTAs use
 * user.trefolio.com but **donations** can still use local Stripe when keys exist.
 */
export async function isUpsellActive(userId?: string): Promise<boolean> {
  if (shouldSendUsersToUnifiedIdp()) {
    if (!isDonationBillingEnabled()) return false;
    return isFeatureEnabled("quota_upsell", userId);
  }
  if (!isBillingEnabled()) return false;
  return isFeatureEnabled("quota_upsell", userId);
}
