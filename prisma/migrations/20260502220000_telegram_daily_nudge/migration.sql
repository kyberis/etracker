-- Recordatorios diarios por Telegram: si el usuario no carg\u00f3 nada durante
-- su d\u00eda (hora local, inferida desde `User.country`), Clara le escribe a las
-- 20:00 locales con un mensaje corto preguntando si tiene algo que registrar.
-- Dos columnas nuevas en `User`:
--   * `telegramNudgeEnabled` (default true) — toggle por usuario.
--   * `telegramNudgeLastSentAt` — idempotencia para evitar duplicados si el
--     cron se retriggerea dentro del mismo d\u00eda local.

ALTER TABLE "User"
  ADD COLUMN "telegramNudgeEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "telegramNudgeLastSentAt" TIMESTAMP(3);
