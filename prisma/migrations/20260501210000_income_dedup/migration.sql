-- Deduplicación de líneas de ingreso por
-- (usuario, fecha, descripción normalizada, monto, moneda).
--
-- Espejo exacto de la migración `20260429140000_expense_dedup`: misma
-- estrategia, misma normalización del nombre, mismo predicado parcial sobre
-- `templateId IS NULL` para que las líneas derivadas de plantillas (stubs
-- recurrentes) no participen del índice — pueden coexistir con cobros
-- reales entrados manualmente que tengan el mismo nombre/monto.

CREATE UNIQUE INDEX IF NOT EXISTS "MonthIncomeLine_dedup_key"
  ON "MonthIncomeLine" (
    "userId",
    "occurredOn",
    lower(btrim(regexp_replace("name", '\s+', ' ', 'g'))),
    "amount",
    "currency"
  )
  WHERE "templateId" IS NULL;
