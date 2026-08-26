# open-banking

> Connect a European bank via Enable Banking (PSD2). Clara imports accounts,
> balances and movements into month lines automatically.

## What it does

From Settings → Integraciones the user picks a country and a bank, is
redirected to the ASPSP, comes back with a `code`, and Clara creates a
`BankConnection`. Connecting is the consent to auto-import: every sync
writes `MonthExpenseLine` / `MonthIncomeLine` with `occurredOnSource =
ARTIFACT` and `paid`/`received` true.

Consent lasts up to the ASPSP `maximum_consent_validity` (typically 180
days). There is no refresh token — expiry or `EXPIRED_SESSION` marks the
connection `NEEDS_REAUTH`.

Phase 1: sandbox + restricted production (operator's own accounts).

## Where the code lives

| Layer | Path |
|-------|------|
| Config / JWT / client | [`src/lib/enable-banking/`](../../src/lib/enable-banking) |
| Sync | [`src/lib/bank-sync/`](../../src/lib/bank-sync) |
| DB accessors | [`src/lib/db/bank-connections.ts`](../../src/lib/db/bank-connections.ts) |
| Prisma | [`prisma/schema.prisma`](../../prisma/schema.prisma) — `BankConnection*` |
| User API | [`src/app/api/open-banking/`](../../src/app/api/open-banking) |
| Cron | [`src/app/api/cron/bank-sync/`](../../src/app/api/cron/bank-sync) |
| Admin | [`src/app/(app)/admin/open-banking/`](../../src/app/(app)/admin/open-banking) |
| Settings UI | [`src/components/open-banking-card.tsx`](../../src/components/open-banking-card.tsx) |
| Connect CTA | [`src/components/open-banking-connect-cta.tsx`](../../src/components/open-banking-connect-cta.tsx) — chat home, menu, `/banks`, month page when the user has no active connection |

## Data model

- `BankConnection` — encrypted Enable Banking `session_id`, status, `validUntil`.
- `BankLinkedAccount` — external uid + masked IBAN + optional `Bank`.
- `BankImportedTransaction` — provider tx id for idempotency.
- `BankSyncRun` / `EnableBankingApiLog` — admin observability (logs retain 30 days).

Cascade delete with `User`. Session ids are omitted from the GDPR export.

## Contracts

| Method | Route | Auth | Notes |
|--------|-------|------|-------|
| GET | `/api/open-banking/aspsps?country=` | user + flag | ASPSP list |
| POST | `/api/open-banking/connect` | user + flag | `{ institutionName, country }` → `{ url }` |
| GET | `/api/open-banking/callback` | signed `state` | public prefix in `proxy.ts` |
| GET | `/api/open-banking/connections` | user + flag | |
| DELETE | `/api/open-banking/connections/[id]` | user + flag | disconnect, keep imported lines |
| POST | `/api/open-banking/sync` | user + flag | optional `{ connectionId }` |
| GET/POST | `/api/cron/bank-sync` | `CRON_SECRET` | every 6h |
| GET | `/api/admin/open-banking/{stats,connections,sync-runs,api-logs}` | admin | |

Feature flag: `open_banking` (default off). Env: `ENABLE_BANKING_*` + `BANK_SYNC_ENCRYPTION_KEY`.

Enable Banking does not issue an API key. The Control Panel gives an Application
ID (JWT `kid`) and downloads a PEM once (`{id}.pem`). Lost PEM → register a new
app. `BANK_SYNC_ENCRYPTION_KEY` is generated locally (`openssl rand -hex 32`).

## Invariants

- Open Banking is read-only (AIS). No payment initiation.
- Missing env degrades: UI hidden, APIs 503.
- Admin API logs never persist IBANs or remittance text.
- Duplicate provider ids and the existing month-line unique index both skip writes.

## Known gaps / TODOs

- No MCP / agent tools in v1.
- No landing-page feature card in v1. In-app CTA (chat / menu / Banks / month) ships when the flag is on.
- Restricted production only returns accounts whitelisted in the Control Panel.
- ASPSP payloads may send `account_id.other` / `iban` as JSON `null` (seen with Rabobank NL); Zod schemas must use `.nullish()`, not `.optional()`.

## Related

- Skill: [`.cursor/skills/engineer-integrations/SKILL.md`](../../.cursor/skills/engineer-integrations/SKILL.md)
- Skill: [`.cursor/skills/legal-advisor/SKILL.md`](../../.cursor/skills/legal-advisor/SKILL.md)
- Spec: [`banks`](banks.md), [`import-pdf-image`](import-pdf-image.md), [`gdpr-compliance`](gdpr-compliance.md)
