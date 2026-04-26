-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM (
  'VIVIENDA',
  'SERVICIOS',
  'TRANSPORTE',
  'ALIMENTACION',
  'SALUD',
  'EDUCACION',
  'ENTRETENIMIENTO',
  'SUSCRIPCIONES',
  'DEUDAS',
  'IMPUESTOS',
  'AHORRO',
  'REGALOS',
  'OTROS'
);

-- CreateTable
CREATE TABLE "MonthRecord" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "month" TIMESTAMP(3) NOT NULL,
  "income" DECIMAL(12, 2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MonthRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthExpenseLine" (
  "id" TEXT NOT NULL,
  "monthRecordId" TEXT NOT NULL,
  "templateId" TEXT,
  "bankId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "category" "ExpenseCategory" NOT NULL DEFAULT 'OTROS',
  "paid" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MonthExpenseLine_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "category" "ExpenseCategory" NOT NULL DEFAULT 'OTROS';

-- CreateIndex
CREATE UNIQUE INDEX "MonthRecord_userId_month_key" ON "MonthRecord"("userId", "month");

-- CreateIndex
CREATE INDEX "MonthRecord_userId_idx" ON "MonthRecord"("userId");

-- CreateIndex
CREATE INDEX "MonthExpenseLine_monthRecordId_idx" ON "MonthExpenseLine"("monthRecordId");

-- AddForeignKey
ALTER TABLE
  "MonthRecord"
ADD
  CONSTRAINT "MonthRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  "MonthExpenseLine"
ADD
  CONSTRAINT "MonthExpenseLine_monthRecordId_fkey" FOREIGN KEY ("monthRecordId") REFERENCES "MonthRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  "MonthExpenseLine"
ADD
  CONSTRAINT "MonthExpenseLine_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Expense"("id") ON DELETE
SET
  NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE
  "MonthExpenseLine"
ADD
  CONSTRAINT "MonthExpenseLine_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill month buckets from existing payments and per-month income overrides
INSERT INTO
  "MonthRecord" ("id", "userId", "month", "income", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  u."userId",
  u."month",
  COALESCE(mi."amount", usr."monthlyIncome"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM
  (
    SELECT DISTINCT
      e."userId",
      p."month" AS "month"
    FROM
      "Payment" p
      INNER JOIN "Expense" e ON e."id" = p."expenseId"
    UNION
    SELECT
      "userId",
      "month"
    FROM
      "MonthlyIncome"
  ) u
  INNER JOIN "User" usr ON usr."id" = u."userId"
  LEFT JOIN "MonthlyIncome" mi ON mi."userId" = u."userId"
  AND date_trunc('month', mi."month") = date_trunc('month', u."month")
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      "MonthRecord" mr
    WHERE
      mr."userId" = u."userId"
      AND date_trunc('month', mr."month") = date_trunc('month', u."month")
  );

-- Snapshot template expenses into each bucket (applies when template is valid for that month)
INSERT INTO
  "MonthExpenseLine" (
    "id",
    "monthRecordId",
    "templateId",
    "bankId",
    "name",
    "amount",
    "category",
    "paid",
    "createdAt",
    "updatedAt"
  )
SELECT
  gen_random_uuid()::text,
  mr."id",
  e."id",
  e."bankId",
  e."name",
  e."amount",
  'OTROS'::"ExpenseCategory",
  EXISTS (
    SELECT
      1
    FROM
      "Payment" p
    WHERE
      p."expenseId" = e."id"
      AND date_trunc('month', p."month") = date_trunc('month', mr."month")
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM
  "MonthRecord" mr
  INNER JOIN "Expense" e ON e."userId" = mr."userId"
WHERE
  (
    e."isRecurring" = false
    AND date_trunc('month', e."startMonth") = date_trunc('month', mr."month")
  )
  OR (
    e."isRecurring" = true
    AND date_trunc('month', e."startMonth") <= date_trunc('month', mr."month")
    AND (
      e."endMonth" IS NULL
      OR date_trunc('month', e."endMonth") >= date_trunc('month', mr."month")
    )
  );

-- Remove legacy tables
DROP TABLE "Payment";

DROP TABLE "MonthlyIncome";
