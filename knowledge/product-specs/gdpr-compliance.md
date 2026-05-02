# GDPR Compliance

> Source-of-truth spec for how Clara satisfies its GDPR obligations. If you
> change anything in this area, also touch `legal-advisor` SKILL.md, the
> CHANGELOG entry in `marketing-content.ts`, and (when material) bump
> `CURRENT_TERMS_VERSION` in `src/lib/legal.ts`.

## Scope

Clara is a public-facing AI financial assistant deployed at
`clara.trefolio.com` and self-hostable under MIT. This spec covers the
hosted instance; self-hosters become controllers of their own deployments
and inherit these patterns by default.

## Single source of truth

- Versioning, controller identity, jurisdiction:
  [`src/lib/legal.ts`](../../src/lib/legal.ts)
- Public privacy + terms copy (ES + EN):
  [`src/lib/marketing-content.ts`](../../src/lib/marketing-content.ts)
  (`PRIVACY_SECTIONS`, `TERMS_SECTIONS`, `CONTACT_COPY`).
- Page chrome / metadata helpers:
  [`src/lib/marketing-pages.ts`](../../src/lib/marketing-pages.ts).

## Data subject rights

| Right (Art.) | Where it lives | How a user exercises it |
|--------------|----------------|--------------------------|
| Access (15) + Portability (20) | `GET /api/account/export` | Settings → Tu información → "Descargar JSON" |
| Erasure (17) | `DELETE /api/account` (soft) + `/api/cron/account-purge` (hard, T+30d). See [`account-soft-delete.md`](account-soft-delete.md) | Settings → Tu información → "Borrar mi cuenta" |
| Rectification (16) | Existing settings forms (email, name, country, etc.) | Settings |
| Restriction (18), Objection (21), Withdrawal (7(3)) | `/contact` form, kind `PRIVACY` | Public form at `/[lang]/contact` |

The public contact form is the only published channel; no personal email
is rendered to the client. The admin sees the bandeja at `/admin/contact`.

## Demonstrable consent (Art. 7(1))

- `User.acceptedTermsAt` (DateTime?) and `User.acceptedTermsVersion`
  (String?) — added in migration `20260501230000_gdpr_compliance`.
- `CURRENT_TERMS_VERSION` lives in `src/lib/legal.ts`. Bump when terms or
  privacy change in a material way.
- Email/password signup: checkbox in
  `[register-form.tsx](../../src/app/(auth)/register/register-form.tsx)`
  submits the live constant; the route persists `acceptedTermsAt = now()`.
- Google sign-in / legacy users / version bumps: redirect to
  `/accept-terms` (under `(onboarding)` layout) which calls
  `PATCH /api/onboarding` with `acceptedTermsVersion` set.
- Guard lives in `src/app/(app)/layout.tsx` and
  `src/app/(onboarding)/onboarding/page.tsx` via `hasCurrentConsent()`.

## Sub-processors registry

Listed in §4 of `PRIVACY_SECTIONS`. When you add a new third-party SDK or
managed service, add an entry there AND to the data inventory table in
`legal-advisor/SKILL.md`.

Current set:

- Vercel (US) — hosting, Postgres, Blob, Runtime Cache, AI Gateway.
- OpenAI (US) — Whisper, TTS, GPT (ZDR).
- Anthropic (US), Google (US) — alternative providers via AI Gateway.
- Cloudflare (US) — Turnstile.
- Resend (US) — transactional emails.
- Stripe (US/IE) — payments.
- Upstash (US) — Redis rate-limit.
- Telegram (AE) — Bot API (opt-in via linking).
- Google (US) — OAuth (opt-in via Google sign-in).
- Sentry (DE) — opt-in via `SENTRY_DSN`.

## Retention

Numerical and listed in §6 of `PRIVACY_SECTIONS`. Highlights:

- Account: account lifetime + 30-day soft-delete grace window. See
  [`account-soft-delete.md`](account-soft-delete.md).
- TTS audio: 7 days.
- Logs: 30 days.
- Stripe webhook idempotency: 18 months.
- Donation/subscription receipts: 7 years.
- Contact form bodies: 24 months; IP/UA metadata 90 days.

## Self-host posture

`legalController()` in `src/lib/legal.ts` resolves the controller using
`LEGAL_CONTROLLER_NAME`, `LEGAL_JURISDICTION` and the
`CLARA_TREFOLIO_HOSTED=1` flag. When neither env is set on a non-trefolio
deploy, `/privacy` and `/terms` render a configuration banner so a
self-hoster cannot accidentally publish "Marcos Suarez is responsible for
this data" without being trefolio.

## Change-management checklist

Bump `CURRENT_TERMS_VERSION` (and/or `CURRENT_PRIVACY_VERSION`) when:

- A new field is added to `User` or to a related model whose data appears
  in the export.
- A new sub-processor is introduced.
- Retention windows shorten or lengthen materially.
- Pricing model changes.
- The legal basis for a processing operation changes.

Don't bump for typo fixes, link rot, dead-link cleanup, or wording
clarifications that don't change rights or obligations.

## Related code

- Endpoints: `src/app/api/account/export/route.ts`, `src/app/api/account/route.ts`,
  `src/app/api/account/restore/route.ts`, `src/app/api/cron/account-purge/route.ts`,
  `src/app/api/onboarding/route.ts`, `src/app/api/contact/route.ts`,
  `src/app/api/admin/contact/[id]/route.ts`.
- Pages: `src/app/(marketing)/[lang]/{privacy,terms,contact,account-deleted}/page.tsx`,
  `src/app/(onboarding)/accept-terms/page.tsx`,
  `src/app/account/restore/page.tsx`,
  `src/app/(app)/admin/contact/...`.
- Schema: `prisma/schema.prisma` (User consent fields, `User.deletedAt`, ContactMessage model).
