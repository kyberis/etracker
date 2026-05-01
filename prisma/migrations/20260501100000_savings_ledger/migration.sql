-- CreateEnum
CREATE TYPE "SavingsMovementKind" AS ENUM (
    'MONTHLY_CONTRIBUTION',
    'CARRYOVER_DEPOSIT',
    'DEBT_COVERAGE',
    'MANUAL_DEPOSIT',
    'MANUAL_WITHDRAWAL'
);

-- CreateTable
CREATE TABLE "SavingsMovement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthRecordId" TEXT,
    "kind" "SavingsMovementKind" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "note" TEXT,
    "occurredOn" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavingsMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavingsMovement_userId_occurredOn_idx" ON "SavingsMovement"("userId", "occurredOn");

-- CreateIndex
CREATE INDEX "SavingsMovement_userId_monthRecordId_idx" ON "SavingsMovement"("userId", "monthRecordId");

-- CreateIndex
-- One MONTHLY_CONTRIBUTION and one CARRYOVER_DEPOSIT per (user, month).
-- Postgres treats NULL as distinct, so MANUAL_* movements (which usually
-- have monthRecordId NULL) are not constrained by this index.
CREATE UNIQUE INDEX "SavingsMovement_userId_monthRecordId_kind_key"
    ON "SavingsMovement"("userId", "monthRecordId", "kind");

-- AddForeignKey
ALTER TABLE "SavingsMovement"
    ADD CONSTRAINT "SavingsMovement_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavingsMovement"
    ADD CONSTRAINT "SavingsMovement_monthRecordId_fkey"
    FOREIGN KEY ("monthRecordId") REFERENCES "MonthRecord"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
