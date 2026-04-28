-- Multi-currency support.
-- - User.primaryCurrency: ISO 4217 (3-letter) currency in which all
--   aggregations are reported (totals, balance, income).
-- - User.primaryCurrencyConfirmedAt: null until the user (or the AI in its
--   name) confirms the primary currency, gating the agent's onboarding.
-- - MonthExpenseLine.currency / fxRate / amountConverted: the line's amount
--   stays in the original currency. fxRate is locked at entry time, and
--   amountConverted is the pre-computed value in primary currency used by
--   every aggregation (cheap, deterministic).

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "primaryCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "primaryCurrencyConfirmedAt" TIMESTAMP(3);

ALTER TABLE "MonthExpenseLine"
  ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS "fxRate" DECIMAL(20, 10) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "amountConverted" DECIMAL(12, 2);

-- Backfill existing rows: copy each line's `amount` into `amountConverted`
-- and align `currency` with the owning user's primary currency. Rows without
-- a corresponding user (shouldn't happen) fall back to the column default.
UPDATE "MonthExpenseLine" l
SET
  "currency" = COALESCE(u."primaryCurrency", 'USD'),
  "fxRate" = 1,
  "amountConverted" = l."amount"
FROM "MonthRecord" mr
JOIN "User" u ON u."id" = mr."userId"
WHERE l."monthRecordId" = mr."id"
  AND l."amountConverted" IS NULL;

-- Defensive: any orphan line still missing the converted amount.
UPDATE "MonthExpenseLine"
SET "amountConverted" = "amount"
WHERE "amountConverted" IS NULL;

ALTER TABLE "MonthExpenseLine"
  ALTER COLUMN "amountConverted" SET NOT NULL;
