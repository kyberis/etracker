# occurred-on-month-bucketing

> **Status:** implemented (schema + `month-line-bucket.ts`). Wiring in REST/tools/UI
> tracked in exec plan
> [`cross-month-crud-act-first`](../exec-plans/active/cross-month-crud-act-first.md).

## Problem

`MonthExpenseLine` and `MonthIncomeLine` rows are stored under
`MonthRecord.id` (`monthRecordId`), but chat tools historically created lines
under the **current calendar month** while `occurredOn` could point to any day.
The dashboard at `/m/YYYY-MM` loads `monthRecord.lines` for that bucket only,
so backdated or future-dated entries appear in the wrong month view.

Users expect: "everything that happened in March lives in March", including
edits from Telegram, web chat, and the month dashboard.

## Decision

1. **Bucket key = UTC month of `occurredOn`.** On create or when `occurredOn`
   changes, set `monthRecordId` to the user's `MonthRecord` for
   `toMonthStart(occurredOn)`. Create the record lazily if missing
   (`createMonthIfNeeded`).

2. **Do not infer bucket from "today" or from the URL alone.** The REST path
   `/api/months/[month]/lines` must validate that `[month]` matches the month
   derived from `occurredOn` (or accept only `occurredOn` and derive month).

3. **`occurredOnSource` discriminates confidence:**

   | Value | Meaning |
   |-------|---------|
   | `USER` | User stated the date (chat, form, voice with explicit day) |
   | `ARTIFACT` | Read from CSV, PDF, or bank screenshot |
   | `ESTIMATED` | Defaulted to report date when no date was given |

   UI shows a small badge when `ESTIMATED`. Agent may promote to `USER` on
   correction.

4. **Rebucket is a single transaction:** update `occurredOn`, `occurredOnSource`
   (optional), and `monthRecordId`; run dedupe check; call
   `expireYearTimeline` for affected years.

## Why this and not X

| Alternative | Why rejected |
|-------------|--------------|
| Keep bucket = creation month, filter UI by `occurredOn` | Double source of truth; totals and agent `getMonthState` diverge |
| Duplicate line across months | Inflates balances; nightmare for edits/deletes |
| Only allow edits in current month | Fails product requirement |

## Implementation surface

| Layer | Change |
|-------|--------|
| `src/lib/month-line-bucket.ts` | `resolveMonthRecordId`, `rebucketLineIfNeeded` |
| REST POST/PATCH | Use shared helpers |
| `expense-tools.ts` | `addMonthLine`, `addIncomeLine`, updates |
| UI | Edit dialogs send `occurredOn`; list shows ESTIMATED badge |

## Legacy data

One-shot script `scripts/rebucket-lines-by-occurred-on.ts`:

- Select lines where `monthRecord.month` ≠ month(`occurredOn`).
- Move each to the correct record (create month if needed).
- Log counts per user; dry-run default.

Run in staging before production deploy of the feature.

## Invariants

- Partial unique dedupe index still applies on `(userId, occurredOn, name, amount, currency)` for manual lines.
- `amountConverted` and frozen `fxRate` unchanged by rebucket-only moves.
- Event `BY_DATE` lines must stay consistent: event attribution uses `occurredOn`, not bucket month alone.
- Soft-deleted users: script skips.

## Open questions

- **Timezone:** bucket uses UTC month (consistent with `getCurrentMonthKey`). If users in AR expect "hoy" local, document in UX copy; optional future `User.timezone` is out of scope for v1.
- **Template-derived lines:** materialised lines keep template month sync rules; rebucket applies primarily to `templateId IS NULL` manual/import lines unless user explicitly moves a paid template copy (defer: disallow rebucket across months for template lines in v1).

## Related

- Exec plan: [`cross-month-crud-act-first`](../exec-plans/active/cross-month-crud-act-first.md)
- Spec: [`months-and-templates`](../product-specs/months-and-templates.md)
- Spec: [`income`](../product-specs/income.md)
