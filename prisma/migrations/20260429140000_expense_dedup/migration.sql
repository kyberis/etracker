-- Deduplicación de gastos por (usuario, fecha, descripción normalizada, monto, moneda).
--
-- Cambios:
-- 1. `MonthExpenseLine.userId`: denormalizado desde `MonthRecord.userId` para
--    poder indexar por usuario sin un join. Se necesita para el índice único
--    de deduplicación global (un usuario no puede tener dos líneas iguales).
-- 2. `MonthExpenseLine.occurredOn`: fecha real del gasto (sin hora, en UTC).
--    Para Revolut: bookingDate ?? valueDate ?? hoy. Para cargas manuales
--    (chat / foto / formulario): hoy salvo que el usuario indique otra.
-- 3. Índice único parcial sobre las líneas NO derivadas de plantilla
--    (`templateId IS NULL`): las plantillas son stubs recurrentes y no
--    deduplican contra entradas reales. La descripción se normaliza con
--    lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) para que
--    "  Spotify  " y "spotify" colisionen.

-- 1. userId: agregar nullable, backfill, NOT NULL + FK + index.
ALTER TABLE "MonthExpenseLine"
  ADD COLUMN IF NOT EXISTS "userId" TEXT;

UPDATE "MonthExpenseLine" l
SET "userId" = mr."userId"
FROM "MonthRecord" mr
WHERE l."monthRecordId" = mr."id"
  AND l."userId" IS NULL;

ALTER TABLE "MonthExpenseLine"
  ALTER COLUMN "userId" SET NOT NULL;

ALTER TABLE "MonthExpenseLine"
  ADD CONSTRAINT "MonthExpenseLine_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "MonthExpenseLine_userId_idx"
  ON "MonthExpenseLine" ("userId");

-- 2. occurredOn: agregar nullable, backfill desde monthRecord.month
--    (la mejor fecha disponible para datos históricos), NOT NULL.
ALTER TABLE "MonthExpenseLine"
  ADD COLUMN IF NOT EXISTS "occurredOn" DATE;

UPDATE "MonthExpenseLine" l
SET "occurredOn" = (mr."month" AT TIME ZONE 'UTC')::date
FROM "MonthRecord" mr
WHERE l."monthRecordId" = mr."id"
  AND l."occurredOn" IS NULL;

ALTER TABLE "MonthExpenseLine"
  ALTER COLUMN "occurredOn" SET NOT NULL;

-- 3. Índice único parcial con expresión sobre el nombre normalizado.
--    Solo aplica a líneas no derivadas de plantilla (templateId IS NULL).
--    Si los datos preexistentes tienen colisiones, este índice fallará y
--    deberá resolverse a mano (no es nuestro caso porque el campo no existía).
CREATE UNIQUE INDEX IF NOT EXISTS "MonthExpenseLine_dedup_key"
  ON "MonthExpenseLine" (
    "userId",
    "occurredOn",
    lower(btrim(regexp_replace("name", '\s+', ' ', 'g'))),
    "amount",
    "currency"
  )
  WHERE "templateId" IS NULL;
