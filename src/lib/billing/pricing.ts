/**
 * Pricing and quota constants for the optional Supporter tier. Edited only
 * here so the modal, the checkout endpoint, the webhook and the marketing
 * pages all agree.
 */

/** Free tier: matches `User.dailyAgentMessageLimit` default. */
export const FREE_DAILY_LIMIT = 30;

/** Supporter tier: cap raised when subscription is active. */
export const SUPPORTER_DAILY_LIMIT = 200;

/** Subscription price in EUR cents (matches the Stripe Price object). */
export const SUPPORTER_PRICE_EUR_CENTS = 799;

/** Donation bounds. EUR cents. Stripe Checkout enforces these too. */
export const MIN_DONATION_CENTS = 200;
export const MAX_DONATION_CENTS = 50_000;

/** Default donation amount pre-filled in the modal. */
export const DEFAULT_DONATION_CENTS = 500;

/** ISO 4217 — single currency for v1. */
export const BILLING_CURRENCY = "eur" as const;
