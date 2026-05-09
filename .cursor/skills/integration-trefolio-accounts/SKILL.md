---
name: integration-trefolio-accounts
description: >-
  Explains how Clara (etracker) integrates with user.trefolio.com via NextAuth OAuth
  provider trefolio-id, IdP bridge on /login, entitlements sync, and env vars.
  Use when editing src/lib/auth.ts, IDP_* env, /register, or quota claims from the IdP.
---

# Clara ↔ trefolio-accounts (IdP)

Clara is an **OIDC relying party** implemented as a NextAuth **`trefolio-id`** OAuth provider pointing at `user.trefolio.com` discovery (`/.well-known/openid-configuration`).

## Knowledge base (monorepo checkout)

Specs are authored in the **parent trefolio monorepo** (this repo is usually `stocktracker/external/etracker`):

| Path from monorepo root | Purpose |
|-------------------------|---------|
| `knowledge/design-docs/unified-accounts-and-billing.md` | Shared identity + billing model |
| `knowledge/design-docs/clara-idp-integration.md` | Clara-specific IdP migration checklist |
| `knowledge/design-docs/etracker-clara-integration.md` | How trefolio calls Clara APIs |
| `knowledge/runbooks/unified-accounts-cutover.md` | Operations |

From this skill file directory, approximate path to those docs: `../../../../../knowledge/design-docs/...` (ascend to `stocktracker/`).

## Code map (this repo)

| Area | Role |
|------|------|
| [`src/lib/auth.ts`](../../../src/lib/auth.ts) | NextAuth providers: `trefolio-id` with `app_hint: clara`; `events.signIn` applies `entitlements.clara_daily_limit`, persists `User.idpSub` from OIDC `sub` |
| [`src/lib/idp-base.ts`](../../../src/lib/idp-base.ts) | `isClaraIdpOAuthConfigured()`, `buildIdpUpgradeUrlForClara()`, `buildIdpBillingPortalUrlForClara()`, deprecated `shouldSendUsersToUnifiedIdp()` alias |
| [`src/lib/idp-telegram.ts`](../../../src/lib/idp-telegram.ts) | `POST`/`GET` IdP `/api/v1/telegram/*` for cross-app Telegram map |
| [`src/app/(auth)/login/page.tsx`](../../../src/app/(auth)/login/page.tsx) | `IdpUnifiedBridge` when IdP configured; `LoginForm` when not |
| [`src/app/(auth)/login/idp-unified-bridge.tsx`](../../../src/app/(auth)/login/idp-unified-bridge.tsx) | Countdown + `signIn('trefolio-id')` |
| [`src/app/(auth)/register/page.tsx`](../../../src/app/(auth)/register/page.tsx) | `IdpSignupRedirect` or `RegisterForm` per IdP configuration |
| [`src/app/(auth)/register/idp-signup-redirect.tsx`](../../../src/app/(auth)/register/idp-signup-redirect.tsx) | Client-side OAuth signup hint |
| [`src/app/api/auth/idp-signout/route.ts`](../../../src/app/api/auth/idp-signout/route.ts) | RP-initiated logout coordination |
| [`src/app/api/webhooks/telegram/route.ts`](../../../src/app/api/webhooks/telegram/route.ts) | After link: `idpRegisterTelegramUser`; lookup: `idpResolveSubForTelegramUser` + `User.idpSub` |
| [`src/lib/billing/stripe.ts`](../../../src/lib/billing/stripe.ts) | `isUpsellActive` is false when unified IdP is on (Stripe Supporter upsell retired for that mode) |

## Environment

- `IDP_BASE_URL` — Override in dev; prod defaults to `https://user.trefolio.com` when unset in production builds (see `idp-base.ts`). With Caddy, often `http://localhost:3300` while **`NEXTAUTH_URL`** stays `https://clara.trefolio-dev.com`.
- `IDP_CLIENT_ID` — Typically `clara`.
- `IDP_CLIENT_SECRET` — Same secret value as **`IDP_CLIENT_SECRET_CLARA`** on the IdP Vercel project (`external/accounts`).
- `IDP_SERVICE_TOKEN` — Same bearer string as **`IDP_SERVICE_TOKEN`** on the IdP (admin import, Telegram link, `by-id` lookup, service probes).
- **`isClaraIdpOAuthConfigured()`** — when `IDP_BASE_URL`, `IDP_CLIENT_ID`, and `IDP_CLIENT_SECRET` are set, `/login` uses **`IdpUnifiedBridge`** into the unified IdP; NextAuth exposes **`trefolio-id`** only in that mode. Omit `IDP_CLIENT_SECRET` locally if you still need the legacy `LoginForm`.

NextAuth reads **`authorization_endpoint`** from IdP discovery; ensure **`external/accounts`** sets **`IDP_ISSUER`** (and usually **`IDP_SERVER_ORIGIN`**) per [`dev/README.md`](../../../../../dev/README.md) so the browser is not sent to `localhost`.

## Local dev

See parent monorepo [`dev/README.md`](../../../../../dev/README.md): ports **3001** (Clara), **3300** (accounts), Caddy hosts `*.trefolio-dev.com`.

## Standalone clone (no monorepo)

Use **`~/.cursor/skills/integration-trefolio-accounts/SKILL.md`** when this repo is opened without stocktracker; pull `knowledge/design-docs/clara-idp-integration.md` from a monorepo checkout or your team’s source of truth.

## Related skills

- IdP implementation: `external/accounts/.cursor/skills/integration-trefolio-accounts/SKILL.md`
- Trefolio client: monorepo `.cursor/skills/integration-trefolio-accounts/SKILL.md`
