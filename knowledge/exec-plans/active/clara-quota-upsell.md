---
name: clara-quota-upsell
overview: Optional, hosted-only Stripe-backed monetization layer for Clara — donation + €7.99 Supporter tier surfaced via modal when the daily 30-message cap is hit. Gated by Stripe envs + admin-toggleable feature flag with per-user overrides. Self-hosters keep today's free-only behavior.
todos:
  - id: schema
    status: completed
    content: User Stripe fields + Donation + FeatureFlag + FeatureFlagOverride + StripeWebhookEvent (migration `20260429234700_billing_and_feature_flags`).
  - id: feature-flags
    status: completed
    content: src/lib/feature-flags.ts — registry, Runtime Cache (60s + tag invalidation), per-user overrides.
  - id: billing-lib
    status: completed
    content: src/lib/billing/{stripe,pricing,customer,subscription}.ts — isBillingEnabled / isUpsellActive gates, lazy customer creation, state mirror helpers.
  - id: api-routes
    status: completed
    content: /api/billing/checkout, /api/billing/portal, /api/webhooks/stripe (idempotent on event id), /api/admin/feature-flags + /[key], /api/admin/users/[id]/feature-flags/[key].
  - id: chat-429
    status: completed
    content: Structured 429 from /api/chat with upsell flags. Custom fetch on DefaultChatTransport peeks at the response and opens the modal.
  - id: ui
    status: completed
    content: QuotaLimitDialog (rioplatense, two CTAs), Supporter pill on QuotaBadge, Suscripción card on Settings, Feature flags table in /admin.
  - id: marketing
    status: completed
    content: marketing-content.ts — FAQ rewrite, CHANGELOG (ES+EN), privacy section for Stripe sub-processor. New /(marketing)/[lang]/upgrade page (gated, redirects when flag off).
  - id: tests
    status: completed
    content: Unit tests for feature-flags resolution + sets, billing gates (env + flag), subscription state transitions, donation persistence.
  - id: knowledge
    status: completed
    content: Spec billing-and-quota-upsell.md, design doc stripe-integration.md, index updates.
  - id: legal-pass
    status: pending
    content: Run the legal-advisor skill before merging — confirm refund policy / EU 14-day waiver wording and Stripe sub-processor disclosure.
  - id: vercel-envs
    status: pending
    content: Add STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_ID_SUPPORTER to Vercel (test in Preview, live in Production). Register webhook in Stripe Dashboard.
  - id: turn-on
    status: pending
    content: Flip `quota_upsell` ON for the maintainer's user via per-user override first (dogfood). Once happy, flip the global toggle.
---

# clara-quota-upsell

Most of the work is in the repo. The remaining items are environment + a legal-advisor pass; flip the flag only after both are done.

## Behaviour matrix (post-merge, before turn-on)

| Stripe envs | quota_upsell flag | Result |
|-------------|--------------------|--------|
| missing | OFF (default) | Self-host equivalent: text-only 429, no modal CTAs, no /upgrade. |
| present | OFF | Code shipped dark; nobody sees CTAs. |
| present | ON for admin only (per-user override) | Maintainer can dogfood the modal in production. |
| present | ON globally | Public launch. |

## Decisions captured

- Provider: **Stripe**, EUR-only.
- Pricing: **€7.99 / month** Supporter (200/day), donations from **€2** to **€500** (one-time, non-refundable).
- Payments: Stripe Checkout (redirect). No card data ever touches Clara.
- Cancellation: Stripe Billing Portal, linked from Settings.

## When to move to completed/

After the global flag has been ON in production for a stable period (a few weeks) and there are no follow-up changes pending, move this file to `knowledge/exec-plans/completed/`.
