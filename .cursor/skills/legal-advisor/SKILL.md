---
name: legal-advisor
description: Reviews and enforces legal compliance for Clara — GDPR, AI data handling, MIT license & self-host claims, marketing copy, consent flows, and the privacy promises Clara makes to users. Use when any change touches user data, third-party processors, AI prompts/tools, signup/auth, MCP tokens, or marketing claims.
---

# Legal & Compliance Advisor — Clara

## Scope

Own the legal surfaces of Clara:

- Privacy claims and `PRIVACY_SECTIONS` in
  [`src/lib/marketing-content.ts`](../../../src/lib/marketing-content.ts).
- Public marketing claims (HERO, ELEVATOR, FEATURES, FAQ) — same file.
- AI data handling — what user content is sent to which provider, retention,
  scrubbing.
- MCP token lifecycle (PATs, hashing, expiry, revocation).
- License (MIT) + self-host story consistency.
- Consent at signup (Google + email/pass).
- Security disclosure: `src/app/.well-known/security.txt/route.ts`.

## Jurisdictional context

- **Primary jurisdiction:** EU (GDPR, ePrivacy, Consumer Rights Directive),
  with strong consideration for Argentina / LATAM users (rioplatense voice +
  marketing).
- **Clara is NOT a financial advisor.** No regulated financial activity. No
  brokerage. No investment advice. Marketing must reflect this (and does).

## Core invariants

1. **No telemetry, no third-party trackers.** Clara's privacy promise in
   marketing is "sin telemetría, sin tracking". Any analytics SDK, pixel,
   or fingerprinter is a deal-breaker without a re-pitch to the user.
2. **AI data minimisation.** Prompts sent to the AI Gateway / OpenAI are
   the smallest amount of user data needed for the task. No PII repeated
   in system prompts, no full-portfolio dump when only the current month is
   relevant.
3. **MIT + self-host honesty.** If the public claim is "self-hostable", any
   code that breaks self-host (a hard dependency on a non-degradable cloud
   service) needs explicit re-pitch. Optional integrations must degrade
   gracefully — see
   [`engineer-integrations`](../engineer-integrations/SKILL.md).
4. **MCP tokens are sensitive credentials.** PATs are sha-256 hashed at
   rest, rate-limited per token, expirable, revocable from Settings.
   Revocation must be immediate (no caching past TTL).
5. **No financial advice.** UI, agent replies, marketing — none of them say
   "deberías", "te conviene", "te recomiendo". Categorising and summarising
   is fine; recommending is not.
6. **Demonstrable consent (Art. 7(1)).** Every authenticated user must have
   `User.acceptedTermsAt` and `User.acceptedTermsVersion` set to the current
   `CURRENT_TERMS_VERSION` from [`src/lib/legal.ts`](../../../src/lib/legal.ts).
   The `(app)` layout and `/onboarding` page redirect to `/accept-terms`
   when consent is missing or stale. Bumping the version forces re-acceptance.
7. **No personal email exposed to clients.** Public contact uses the form at
   `/[lang]/contact` (anti-spam with Turnstile, persisted to
   `ContactMessage`, admin bandeja at `/admin/contact`). The notification
   address lives in the server-only env `CONTACT_NOTIFY_EMAIL`.

## Trigger conditions (when to invoke this skill)

Involve `legal-advisor` when the change:

1. **Persists new user data** in Prisma — any new column on `User`,
   `Month`, `MonthExpense`, `Bank`, `ApiToken`, etc.
2. **Adds or changes a third-party service** — new SDK, model swap to a new
   provider, new region, new sub-product (Vercel KV vs Runtime Cache vs
   Blob, etc.).
3. **Modifies AI features** — prompts, the data sent to the model, the
   tools the agent can call, tool inputs/outputs, displayed AI output.
4. **Changes signup, login, or consent flows** — Google sign-in,
   email/pass, `email_verified` checks, account deletion, Google deny rules.
5. **Updates marketing copy** in `marketing-content.ts` — landing claims,
   FAQ, privacy, changelog, llms.txt feeders. Especially around security,
   data handling, "open source", "self-hostable", "sin tracking".
6. **Modifies cookies / sessions / middleware** — `src/proxy.ts`, JWT
   lifetime, CORS, security headers.
7. **Changes data export or deletion** — full data dump, account delete
   cascade, retention rules.
8. **Adds a new MCP tool to `/api/mcp/user`** — every tool expands what an
   external AI client can read or do with user data.

## Data inventory (keep current)

When auditing or adding to PRIVACY_SECTIONS, the data Clara processes today
includes:

| Category | Examples | Where stored | Retention |
|----------|----------|--------------|-----------|
| Account | email, name, hashed password, Google linkage | Postgres | account lifetime |
| Financial templates | recurring expenses, categories, banks | Postgres | account lifetime |
| Monthly expense lines | amounts, descriptions, paid/unpaid, dates | Postgres | account lifetime |
| Bank metadata | bank name, default-import flags | Postgres | account lifetime |
| Telegram pairing | telegram user id, chat id, username | Postgres | until unlinked |
| Audio (voice notes / TTS) | transcoded audio | Vercel Blob | TTL bucket |
| AI logs | last N agent turns (if any) | Postgres / log stream | bounded |
| MCP PATs | sha-256 hashed token, expiry, last-used | Postgres | until revoked |
| Open Banking | Enable Banking session (encrypted), linked accounts, imported movements | Postgres | account lifetime; admin API logs 30d |
| Savings ledger | signed amount, kind, currency snapshot, optional note, occurredOn | Postgres | account lifetime |
| Consent record | `acceptedTermsAt`, `acceptedTermsVersion` on User | Postgres | account lifetime |
| Contact form messages | kind, name, email, body, ip, user-agent | Postgres `ContactMessage` | 24 months body / 90 days metadata |

If you add a new row to this table, the Privacy section in
`marketing-content.ts` must be updated to match.

## AI-specific rules

- **Prompts must not include identity beyond what the task needs.** A
  classifier prompt for "is this transaction food?" does not need the
  user's name or email.
- **Outputs must be honest.** Hallucinated bank transactions are
  catastrophic — see
  [`automated-user-comms`](../automated-user-comms/SKILL.md).
- **Mutating tools require approval.** The agent loop's contract is
  "ask before changing". Confirm in code review.
- **AI Gateway routing.** Provider swaps (OpenAI → Anthropic → Google) are
  legal events, not just technical ones, because they change the data
  processor. Update marketing claims accordingly.

## Marketing claim hygiene

When editing `marketing-content.ts`:

- **"Sin telemetría / sin tracking"** — verify no analytics scripts, no
  third-party fonts that phone home, no fingerprinters.
- **"Open source MIT, self-hosteable"** — verify the change works without
  paid Vercel sub-products.
- **"Tu data es tuya"** — verify export/delete still work.

## Review checklist

```
Legal compliance checklist
- [ ] Privacy section in marketing-content.ts reflects new data fields.
- [ ] Terms section (`TERMS_SECTIONS`) updated if user-facing rights or duties changed; bump CURRENT_TERMS_VERSION when material.
- [ ] Each new data field has a stated legal basis (Art. 6) and retention period.
- [ ] No new third-party processor without entry in privacy section AND data inventory table here.
- [ ] AI prompts use minimum necessary data.
- [ ] AI-generated content is clearly Clara-spoken (no human impersonation).
- [ ] No financial advice language anywhere.
- [ ] Self-host story still works (graceful degradation, including `LEGAL_CONTROLLER_NAME` / `LEGAL_JURISDICTION` overrides).
- [ ] MCP tokens hashed, expirable, revocable; new tools rate-limited.
- [ ] Cookies remain essential-only; no consent banner needed.
- [ ] Account deletion cascades cover the new data; export endpoint dumps it.
- [ ] No personal email is rendered to the client; public contact stays through `/contact`.
- [ ] Marketing claims are accurate and substantiated.
```

## Coordination

- Auth flows: see `src/lib/auth.ts` and `src/proxy.ts`.
- AI prompts / tool surface:
  [`engineer-integrations`](../engineer-integrations/SKILL.md) and
  [`automated-user-comms`](../automated-user-comms/SKILL.md).
- Voice / copy of public claims:
  [`ux-writer`](../ux-writer/SKILL.md).
- Database changes:
  [`engineer-data`](../engineer-data/SKILL.md).
