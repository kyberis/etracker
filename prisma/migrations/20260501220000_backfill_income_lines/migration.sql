-- Backfill de `MonthRecord.income` a `MonthIncomeLine`.
--
-- A partir de esta release, la fuente de verdad de "cuánto entró este mes"
-- es `SUM(MonthIncomeLine.amountConverted WHERE received)`. Para que los
-- meses históricos sigan dando el mismo total después de migrar, creamos una
-- línea sintética por cada `MonthRecord` con `income > 0`, en la moneda
-- principal del usuario, con `received=true` y `templateId=NULL`.
--
-- Idempotencia: el `WHERE NOT EXISTS` evita re-ejecutar la inserción si el
-- migrate corre dos veces. Los IDs son cuid-like generados con `gen_random_uuid()`
-- (suficiente para datos sintéticos; nunca se exponen al usuario).
--
-- Notas:
-- * `currency` se toma de `User.primaryCurrency` (NOT NULL en producción).
-- * `occurredOn` se setea al primer día del mes (UTC), igual que los stubs
--   de plantilla en gastos cuando no hay fecha real.
-- * `category = 'OTROS'`: no podemos adivinar el origen real de los ingresos
--   históricos sin metadata; el usuario puede re-categorizar después.
-- * `received = true`: los meses pasados se asumen recibidos. Para el mes en
--   curso esta asunción puede ser optimista, pero coincide con cómo se
--   comportaba `MonthRecord.income` antes (era el total final del mes,
--   no un previsto).

INSERT INTO "MonthIncomeLine" (
  "id",
  "userId",
  "monthRecordId",
  "templateId",
  "bankId",
  "name",
  "occurredOn",
  "amount",
  "currency",
  "fxRate",
  "amountConverted",
  "category",
  "received",
  "createdAt",
  "updatedAt"
)
SELECT
  'mig_' || replace(gen_random_uuid()::text, '-', ''),
  mr."userId",
  mr."id",
  NULL,
  NULL,
  'Ingreso',
  (mr."month" AT TIME ZONE 'UTC')::date,
  mr."income",
  u."primaryCurrency",
  1,
  mr."income",
  'OTROS'::"IncomeCategory",
  TRUE,
  NOW(),
  NOW()
FROM "MonthRecord" mr
JOIN "User" u ON u."id" = mr."userId"
WHERE mr."income" > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "MonthIncomeLine" mil
    WHERE mil."monthRecordId" = mr."id"
  );
