-- Modelos de ingreso: plantillas (`Income`) y líneas mensuales
-- (`MonthIncomeLine`). Espejo del modelo de gastos
-- (`Expense` / `MonthExpenseLine`). Sin deduplicación todavía: el índice
-- único parcial vive en la migración siguiente
-- (`20260501210000_income_dedup`) para que el rollback granular sea posible.

-- CreateEnum
CREATE TYPE "IncomeCategory" AS ENUM (
    'SUELDO',
    'FREELANCE',
    'NEGOCIO',
    'INVERSIONES',
    'ALQUILER',
    'BONO',
    'REEMBOLSO',
    'REGALO',
    'OTROS'
);

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankId" TEXT,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "startMonth" TIMESTAMP(3) NOT NULL,
    "endMonth" TIMESTAMP(3),
    "category" "IncomeCategory" NOT NULL DEFAULT 'OTROS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthIncomeLine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthRecordId" TEXT NOT NULL,
    "templateId" TEXT,
    "bankId" TEXT,
    "name" TEXT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "fxRate" DECIMAL(20,10) NOT NULL DEFAULT 1,
    "amountConverted" DECIMAL(12,2) NOT NULL,
    "category" "IncomeCategory" NOT NULL DEFAULT 'OTROS',
    "received" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthIncomeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthIncomeLine_monthRecordId_idx" ON "MonthIncomeLine"("monthRecordId");

-- CreateIndex
CREATE INDEX "MonthIncomeLine_userId_idx" ON "MonthIncomeLine"("userId");

-- AddForeignKey
ALTER TABLE "Income"
    ADD CONSTRAINT "Income_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Income"
    ADD CONSTRAINT "Income_bankId_fkey"
    FOREIGN KEY ("bankId") REFERENCES "Bank"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthIncomeLine"
    ADD CONSTRAINT "MonthIncomeLine_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthIncomeLine"
    ADD CONSTRAINT "MonthIncomeLine_monthRecordId_fkey"
    FOREIGN KEY ("monthRecordId") REFERENCES "MonthRecord"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthIncomeLine"
    ADD CONSTRAINT "MonthIncomeLine_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "Income"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthIncomeLine"
    ADD CONSTRAINT "MonthIncomeLine_bankId_fkey"
    FOREIGN KEY ("bankId") REFERENCES "Bank"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
