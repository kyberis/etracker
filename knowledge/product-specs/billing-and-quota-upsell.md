# billing-and-quota-upsell

> Optional, hosted-only Stripe-backed monetization layer: when a user hits Clara's daily message limit, a modal offers a one-time donation or a €7.99/mo Supporter plan that raises the cap to 200/day.

## What it does

1. **Free tier (default).** Every user starts with `dailyAgentMessageLimit = 30`. The chat client and Telegram share that counter via [`src/lib/agent-quota.ts`](../../src/lib/agent-quota.ts).
2. **31st message of the day.** `POST /api/chat` returns a structured `429` JSON `{ kind: "quota_limit", limit, used, resetAtUtc, upsell: { donation, subscription } }`. The chat client peeks at the response (via a custom `fetch` on `DefaultChatTransport`) and opens `<QuotaLimitDialog>` instead of just rendering an inline error.
3. **Two CTAs in the modal:**
   - Donar (one-time, EUR, custom amount within `[MIN_DONATION_CENTS, MAX_DONATION_CENTS]`) → `POST /api/billing/checkout` with `mode: "donation"` → Stripe Checkout (`mode: payment`, `submit_type: donate`).
   - Subir a Supporter (recurring, €7.99/mo, 200/day) → `POST /api/billing/checkout` with `mode: "subscription"` → Stripe Checkout (`mode: subscription`, `STRIPE_PRICE_ID_SUPPORTER`).
4. **Webhook flips the cap.** `POST /api/webhooks/stripe` mirrors subscription state into `User.subscriptionStatus` + `User.subscriptionCurrentPeriodEnd` and toggles `dailyAgentMessageLimit` between `30` and `200`. Donations are persisted as `Donation` rows; no subscription side-effect.
5. **Settings → Suscripción.** Authenticated users see their current plan, period end, donations status, and a button into the Stripe Billing Portal.
6. **Public `/upgrade` page** mirrors the modal as a marketing surface (linked from in-chat fallback messages and external channels).

The whole thing is gated by **`isUpsellActive(userId)` = `isBillingEnabled() && isFeatureEnabled("quota_upsell", userId)`**:

- `isBillingEnabled()` requires `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID_SUPPORTER`.
- `isFeatureEnabled("quota_upsell")` reads the global `FeatureFlag` row, with optional per-user `FeatureFlagOverride` taking precedence. Default is **off** so we can deploy dark.

Self-hosters never see the modal CTAs (no Stripe envs → both `upsell.*` flags are false → the modal renders a plain "you hit the limit" message).

## Where the code lives

| Layer | Path |
|-------|------|
| Pricing constants | [`src/lib/billing/pricing.ts`](../../src/lib/billing/pricing.ts) |
| Stripe client + gates | [`src/lib/billing/stripe.ts`](../../src/lib/billing/stripe.ts) |
| Customer helpers | [`src/lib/billing/customer.ts`](../../src/lib/billing/customer.ts) |
| Subscription state apply / clear / donation persist | [`src/lib/billing/subscription.ts`](../../src/lib/billing/subscription.ts) |
| Feature flags (registry + DB + Runtime Cache) | [`src/lib/feature-flags.ts`](../../src/lib/feature-flags.ts) |
| Validators (Zod) | [`src/lib/validators.ts`](../../src/lib/validators.ts) (`billingCheckoutSchema`, `adminFeatureFlagPatchSchema`, `adminFeatureFlagOverrideSchema`) |
| Quota counter (unchanged) | [`src/lib/agent-quota.ts`](../../src/lib/agent-quota.ts) |
| API: Checkout | [`src/app/api/billing/checkout/route.ts`](../../src/app/api/billing/checkout/route.ts) |
| API: Billing Portal | [`src/app/api/billing/portal/route.ts`](../../src/app/api/billing/portal/route.ts) |
| API: Stripe webhook | [`src/app/api/webhooks/stripe/route.ts`](../../src/app/api/webhooks/stripe/route.ts) |
| API: Admin feature flags | [`src/app/api/admin/feature-flags/route.ts`](../../src/app/api/admin/feature-flags/route.ts) and [`src/app/api/admin/feature-flags/[key]/route.ts`](../../src/app/api/admin/feature-flags/[key]/route.ts) |
| API: Per-user overrides | [`src/app/api/admin/users/[id]/feature-flags/[key]/route.ts`](../../src/app/api/admin/users/[id]/feature-flags/[key]/route.ts) |
| Chat 429 payload | [`src/app/api/chat/route.ts`](../../src/app/api/chat/route.ts) |
| UI: Quota modal | [`src/components/quota-limit-dialog.tsx`](../../src/components/quota-limit-dialog.tsx) |
| UI: Settings card | [`src/components/subscription-card.tsx`](../../src/components/subscription-card.tsx) |
| UI: Admin flags table | [`src/components/admin-feature-flags-table.tsx`](../../src/components/admin-feature-flags-table.tsx) |
| UI: Marketing | [`src/app/(marketing)/[lang]/upgrade/page.tsx`](../../src/app/(marketing)/[lang]/upgrade/page.tsx) |
| Marketing copy | [`src/lib/marketing-content.ts`](../../src/lib/marketing-content.ts) (FAQ entry, CHANGELOG, privacy section) |
| DB / Prisma | [`prisma/schema.prisma`](../../prisma/schema.prisma) (`User`, `Donation`, `FeatureFlag`, `FeatureFlagOverride`, `StripeWebhookEvent`) |

## Data model

- `User`:
  - `stripeCustomerId String? @unique` — created lazily on first checkout.
  - `subscriptionStatus String?` — Stripe statuses (`active`, `trialing`, `past_due`, `canceled`, …).
  - `subscriptionCurrentPeriodEnd DateTime?` — surfaced in the settings UI.
  - `dailyAgentMessageLimit Int @default(30)` — toggled to `200` by the webhook on active subscription, back to `30` otherwise.
- `Donation` — one row per successful one-time donation, unique on `stripeSessionId`.
- `FeatureFlag` — global flags (`key` is PK). Default state lives in code (`FEATURE_FLAGS` registry); rows are created lazily on first toggle.
- `FeatureFlagOverride` — per-user override; takes precedence over the global value.
- `StripeWebhookEvent` — idempotency log; insert-before-process so replays are no-ops.

## Contracts

- `POST /api/billing/checkout` body: `{ mode: "subscription" } | { mode: "donation", amountCents: number }`. Auth required. Returns `{ url }` to a Stripe Checkout session. Errors: 503 (envs missing), 403 (flag off), 400 (Zod).
- `GET /api/billing/checkout` returns `{ active, currency, supporterPriceCents }` so clients stay in sync with the pricing constants.
- `POST /api/billing/portal` returns `{ url }` to a Billing Portal session. Auth required + a Stripe customer must exist.
- `POST /api/webhooks/stripe` handles:
  - `checkout.session.completed` (subscription mode → flip cap; payment mode + `metadata.kind === "donation"` → insert `Donation`).
  - `customer.subscription.created | .updated | .deleted` → mirror state.
  - `invoice.paid | invoice.payment_failed` → re-pull subscription, mirror.
- `GET /api/admin/feature-flags` lists registry entries with current state.
- `PATCH /api/admin/feature-flags/[key]` body `{ enabled: boolean }` — admin-only global toggle.
- `PUT /api/admin/users/[id]/feature-flags/[key]` body `{ enabled: boolean | null }` — admin-only per-user override; `null` removes the override.

## Invariants

- **Self-host invariant:** when `isBillingEnabled()` is false, `/api/billing/*` returns 503 and `isUpsellActive()` returns false unconditionally. The chat 429 still shows the plain text-only message, never CTAs.
- **Flag-off invariant:** when `quota_upsell` is off (default), no checkout call is allowed, no modal CTA is rendered, and `/upgrade` redirects to `/[locale]/faq#supporter`.
- **Webhook idempotency:** `StripeWebhookEvent.id` is the dedup key. Duplicate events return 200 without re-running side effects.
- **Donations don't affect the cap.** Only an active subscription does.
- **Card data never reaches Clara.** Stripe Checkout handles PCI; we only store the `stripeCustomerId` and donation metadata (amount, date, currency).

## Known gaps / TODOs

- The Telegram limit-reached message currently sends a static text + URL hint to `/[lang]/upgrade`. A future iteration could render a more conversational nudge.
- `Invoice.payment_failed` only re-syncs status; no email is sent yet (Stripe sends its own dunning emails by default — verify the Dashboard configuration before launch).
- No annual plan, no gift codes, no proration UX beyond the Billing Portal default.

## Related

- Design doc: [`knowledge/design-docs/stripe-integration.md`](../design-docs/stripe-integration.md).
- Exec plan: [`knowledge/exec-plans/active/clara-quota-upsell.md`](../exec-plans/active/clara-quota-upsell.md) (move to `completed/` once shipped).
- Rule: [`.cursor/rules/legal-compliance.mdc`](../../.cursor/rules/legal-compliance.mdc) — payments + sub-processor changes trigger a `legal-advisor` pass before merge.
