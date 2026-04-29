---
name: legal-advisor
description: Reviews and enforces legal compliance for Clara — GDPR, Open Banking (PSD2 / GoCardless scopes), AI data handling, MIT license & self-host claims, marketing copy, consent flows, and the privacy promises Clara makes to users. Use when any change touches user data, third-party processors, AI prompts/tools, banking, signup/auth, MCP tokens, or marketing claims.
---

# Legal & Compliance Advisor — Clara

## Scope

Own the legal surfaces of Clara:

- Privacy claims and `PRIVACY_SECTIONS` in
  [`src/lib/marketing-content.ts`](../../../src/lib/marketing-content.ts).
- Public marketing claims (HERO, ELEVATOR, FEATURES, FAQ) — same file.
- Open Banking scopes and read-only invariant.
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
- **Open Banking framework:** PSD2 (EU). GoCardless Bank Account Data is the
  AISP (Account Information Service Provider) — Clara is **not** a regulated
  entity itself; it consumes GoCardless's AISP authorisation as a customer.
  Clara **never** holds payment-initiation scopes (PISP).
- **Clara is NOT a financial advisor.** No regulated financial activity. No
  brokerage. No investment advice. Marketing must reflect this (and does).

## Core invariants

1. **Open Banking is read-only.** Any change to GoCardless code must
   preserve this. Reject any scope or endpoint that even *looks* like
   payment initiation.
2. **No telemetry, no third-party trackers.** Clara's privacy promise in
   marketing is "sin telemetría, sin tracking". Any analytics SDK, pixel,
   or fingerprinter is a deal-breaker without a re-pitch to the user.
3. **AI data minimisation.** Prompts sent to the AI Gateway / OpenAI are
   the smallest amount of user data needed for the task. No PII repeated
   in system prompts, no full-portfolio dump when only the current month is
   relevant.
4. **MIT + self-host honesty.** If the public claim is "self-hostable", any
   code that breaks self-host (a hard dependency on a non-degradable cloud
   service) needs explicit re-pitch. Optional integrations must degrade
   gracefully — see
   [`engineer-integrations`](../engineer-integrations/SKILL.md).
5. **MCP tokens are sensitive credentials.** PATs are sha-256 hashed at
   rest, rate-limited per token, expirable, revocable from Settings.
   Revocation must be immediate (no caching past TTL).
6. **No financial advice.** UI, agent replies, marketing — none of them say
   "deberías", "te conviene", "te recomiendo". Categorising and summarising
   is fine; recommending is not.

## Trigger conditions (when to invoke this skill)

Involve `legal-advisor` when the change:

1. **Persists new user data** in Prisma — any new column on `User`,
   `Month`, `MonthExpense`, `Bank`, `RevolutAccount`, `ApiToken`, etc.
2. **Adds or changes a third-party service** — new SDK, model swap to a new
   provider, new region, new sub-product (Vercel KV vs Runtime Cache vs
   Blob, etc.).
3. **Modifies AI features** — prompts, the data sent to the model, the
   tools the agent can call, tool inputs/outputs, displayed AI output.
4. **Touches Open Banking** — GoCardless scopes, requisition lifecycle,
   webhook signatures, transaction storage / retention.
5. **Changes signup, login, or consent flows** — Google sign-in,
   email/pass, `email_verified` checks, account deletion, Google deny rules.
6. **Updates marketing copy** in `marketing-content.ts` — landing claims,
   FAQ, privacy, changelog, llms.txt feeders. Especially around security,
   data handling, "open source", "self-hostable", "sin tracking".
7. **Modifies cookies / sessions / middleware** — `src/proxy.ts`, JWT
   lifetime, CORS, security headers.
8. **Changes data export or deletion** — full data dump, account delete
   cascade, retention rules.
9. **Adds a new MCP tool to `/api/mcp/user`** — every tool expands what an
   external AI client can read or do with user data.

## Data inventory (keep current)

When auditing or adding to PRIVACY_SECTIONS, the data Clara processes today
includes:

| Category | Examples | Where stored | Retention |
|----------|----------|--------------|-----------|
| Account | email, name, hashed password, Google linkage | Postgres | account lifetime |
| Financial templates | recurring expenses, categories, banks | Postgres | account lifetime |
| Monthly expense lines | amounts, descriptions, paid/unpaid, dates | Postgres | account lifetime |
| Bank metadata (OB) | bank name, account ref, requisition tokens | Postgres + GoCardless | account lifetime, OB scope-bound |
| WhatsApp pairing | phone (hashed/linked), link codes (TTL) | Postgres | until unlinked |
| Audio (voice notes / TTS) | transcoded audio | Vercel Blob | TTL bucket |
| AI logs | last N agent turns (if any) | Postgres / log stream | bounded |
| MCP PATs | sha-256 hashed token, expiry, last-used | Postgres | until revoked |

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
- **"Open Banking de solo lectura"** — verify no PISP scope creep.
- **"Tu data es tuya"** — verify export/delete still work.

## Review checklist

```
Legal compliance checklist
- [ ] Privacy section in marketing-content.ts reflects new data fields.
- [ ] No new third-party processor without entry in privacy section.
- [ ] Open Banking remains read-only; no PISP scopes.
- [ ] AI prompts use minimum necessary data.
- [ ] AI-generated content is clearly Clara-spoken (no human impersonation).
- [ ] No financial advice language anywhere.
- [ ] Self-host story still works (graceful degradation).
- [ ] MCP tokens hashed, expirable, revocable; new tools rate-limited.
- [ ] Cookies remain essential-only; no consent banner needed.
- [ ] Account deletion cascades cover the new data.
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
