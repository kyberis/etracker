-- Onboarding wizard fields on User.
-- - country: ISO-3166 alpha-2 of the user's residence (CHAR(2)). Capturado en
--   el wizard, lo usamos para sugerir moneda principal y, más adelante, para
--   semillar instituciones de open banking por país.
-- - usageReasons: chips multi-select del wizard ("personal", "couple_family",
--   "freelance", "business", "other"). Hint para el agente, no gating.
-- - onboardingCompletedAt: NULL hasta que el wizard termina o se saltea. El
--   layout de `/app` redirige a `/onboarding` mientras sea NULL.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "country" CHAR(2),
  ADD COLUMN IF NOT EXISTS "usageReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "onboardingCompletedAt" TIMESTAMP(3);

-- Backfill: usuarios pre-existentes ya están "onboardeados" en la práctica si
-- tocaron al menos uno de los campos de onboarding (currency confirmada o
-- WhatsApp vinculado o ingresos cargados). Los marcamos como completados para
-- que no caigan en el wizard al loguear de nuevo. Los usuarios completamente
-- vacíos sí pasan por el wizard.
UPDATE "User"
SET "onboardingCompletedAt" = COALESCE("primaryCurrencyConfirmedAt", "whatsappVerifiedAt", "welcomedAt", "updatedAt")
WHERE "onboardingCompletedAt" IS NULL
  AND (
    "primaryCurrencyConfirmedAt" IS NOT NULL
    OR "whatsappVerifiedAt" IS NOT NULL
    OR "welcomedAt" IS NOT NULL
    OR "monthlyIncome" > 0
  );
