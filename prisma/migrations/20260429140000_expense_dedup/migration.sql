-- Deduplicación de gastos por (usuario, fecha, descripción normalizada, monto, moneda).
--
-- Cambios:
-- 1. `MonthExpenseLine.userId`: denormalizado desde `MonthRecord.userId` para
--    poder indexar por usuario sin un join. Se necesita para el índice único
--    de deduplicación global (un usuario no puede tener dos líneas iguales).
-- 2. `MonthExpenseLine.occurredOn`: fecha real del gasto (sin hora, en UTC).
--    Para Revolut: bookingDate ?? valueDate ?? hoy. Para cargas manuales
--    (chat / foto / formulario): hoy salvo que el usuario indique otra.
-- 3. Borrado de duplicados pre-existentes: para usuarios que vienen del flujo
--    anterior (sin dedup) puede haber dos líneas idénticas. Se conserva la
--    más vieja por `createdAt` (con `id` como tie-breaker) y se elimina el
--    resto antes de crear el índice único.
-- 4. Índice único parcial sobre las líneas NO derivadas de plantilla
--    (`templateId IS NULL`): las plantillas son stubs recurrentes y no
--    deduplican contra entradas reales. La descripción se normaliza con
--    lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) para que
--    "  Spotify  " y "spotify" colisionen.
--
-- La migración es idempotente: si una corrida previa falló a mitad de camino
-- (ej. al crear el índice porque había duplicados), correr `prisma migrate
-- resolve --rolled-back 20260429140000_expense_dedup` y volver a deployar es
-- suficiente — los pasos 1-2 son `IF NOT EXISTS` y la FK se agrega solo si
-- todavía no existe.

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'MonthExpenseLine_userId_fkey'
  ) THEN
    ALTER TABLE "MonthExpenseLine"
      ADD CONSTRAINT "MonthExpenseLine_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;

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

-- 3. Eliminar duplicados pre-existentes antes de crear el índice único.
--    Se conserva la línea más vieja por (createdAt asc, id asc) en cada
--    grupo y se eliminan las demás. Solo aplica a líneas reales
--    (`templateId IS NULL`); las plantillas son stubs y no participan del
--    índice. Las relaciones aguas abajo (no hay borrado en cascada que rompa
--    nada hoy) se ignoran porque las filas duplicadas son "líneas hoja".
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY
        "userId",
        "occurredOn",
        lower(btrim(regexp_replace("name", '\s+', ' ', 'g'))),
        "amount",
        "currency"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "MonthExpenseLine"
  WHERE "templateId" IS NULL
)
DELETE FROM "MonthExpenseLine"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

-- 4. Índice único parcial con expresión sobre el nombre normalizado.
--    Solo aplica a líneas no derivadas de plantilla (templateId IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS "MonthExpenseLine_dedup_key"
  ON "MonthExpenseLine" (
    "userId",
    "occurredOn",
    lower(btrim(regexp_replace("name", '\s+', ' ', 'g'))),
    "amount",
    "currency"
  )
  WHERE "templateId" IS NULL;
