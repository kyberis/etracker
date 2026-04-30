# Stripe integration

> Single decision record for how Clara handles paid surfaces (Supporter subscription + one-time donations). Pinned to one provider, EUR-only, hosted-only.

## Decisions

- **Provider:** Stripe Checkout + Billing Portal. No custom card forms; PCI scope stays Stripe's.
- **Currency:** EUR only for v1. `BILLING_CURRENCY = "eur"` ([`src/lib/billing/pricing.ts`](../../src/lib/billing/pricing.ts)).
- **Tiers:**
  - Free (default): `dailyAgentMessageLimit = 30`.
  - Supporter (recurring): `dailyAgentMessageLimit = 200` while subscription is `active` or `trialing`.
- **Pricing:** €7.99/mo (`SUPPORTER_PRICE_EUR_CENTS = 799`). Stripe Price object id is read from the `STRIPE_PRICE_ID_SUPPORTER` env var.
- **Donations:** one-time, custom amount (200–50 000 cents). Stripe Checkout in `payment` mode with `submit_type: "donate"` and inline `price_data`. Non-refundable.
- **Hosted-only:** all billing surfaces gated by `isBillingEnabled()` (envs present) AND `isFeatureEnabled("quota_upsell")` (admin toggle). Self-hosters and dark-launched deployments stay free-only.

## Environment variables

| Var | Required | Purpose |
|-----|----------|---------|
| `STRIPE_SECRET_KEY` | hosted | Stripe server-side client. |
| `STRIPE_WEBHOOK_SECRET` | hosted | Verifies `POST /api/webhooks/stripe`. |
| `STRIPE_PRICE_ID_SUPPORTER` | hosted | Recurring `price_…` for €7.99/mo. |
| `NEXT_PUBLIC_APP_URL` | optional | Used to build success/cancel URLs; falls back to the request origin. |

Add these in **Vercel → Project → Settings → Environment Variables**, scoped to Production + Preview. Use Stripe **test mode** keys for Preview.

## Webhook events

Registered endpoint: `POST {NEXT_PUBLIC_APP_URL}/api/webhooks/stripe`.

| Event | Effect |
|-------|--------|
| `checkout.session.completed` (mode = subscription) | Re-pull subscription, mirror state, set cap to 200 if active. |
| `checkout.session.completed` (mode = payment, metadata.kind = donation) | Insert `Donation` row. No cap change. |
| `customer.subscription.created` | Mirror state. |
| `customer.subscription.updated` | Mirror state (handles upgrades/cancel-at-period-end/past_due transitions). |
| `customer.subscription.deleted` | Force cap to free, status → `canceled`. |
| `invoice.paid` / `invoice.payment_failed` | Re-pull subscription via `parent.subscription_details.subscription`, mirror state. |

Idempotency: every event id is written to `StripeWebhookEvent` **before** side effects. Unique-PK collision = replay = no-op. Stripe will retry on non-2xx; we always return 200 once we've inserted the dedup row, even if the side effect throws (we log and rely on manual replay).

## Type-version pinning

Stripe SDK ^19 ships with API version **`2025-10-29.clover`**. The 2024-09-30 release moved `current_period_end` from `Subscription` onto each `SubscriptionItem`, and removed `Invoice.subscription` in favour of `Invoice.parent.subscription_details.subscription`. The webhook handler reads them via two small helpers: `readPeriodEnd(subscription)` and `readInvoiceSubscriptionId(invoice)`. When bumping the SDK, re-check both helpers against the new types.

## Self-host degradation matrix

| State | Modal | Settings card | `/upgrade` page | Webhook |
|-------|-------|----------------|------------------|---------|
| No Stripe envs | Plain text 429 | Hidden | Redirects to `/faq#supporter` | 503 |
| Envs set, flag OFF | Plain text 429 | Hidden (unless user already has a Stripe customer) | Redirects to `/faq#supporter` | Live |
| Envs set, flag ON | Modal with two CTAs | Visible | Renders | Live |

Per-user override: even with the flag globally OFF, an admin can flip it on for a specific user (`PUT /api/admin/users/[id]/feature-flags/quota_upsell`) to dogfood the modal in production without exposing it to everyone.

## Cache + invalidation

Feature flag reads are cached in Vercel Runtime Cache for 60s under tag `feature-flag:<key>`. Toggling a flag (admin API) calls `expireTag` so the change propagates within seconds without redeploying.

## Open questions

- Should we send our own thank-you email on first successful subscription / first donation? Today Stripe's default receipts cover the legal need.
- Annual plan / gift codes / multi-currency are explicitly out of scope for v1.
