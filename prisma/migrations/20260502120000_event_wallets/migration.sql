-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "EventAttributionMode" AS ENUM ('BY_DATE', 'LUMP_SUM');

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" "EventStatus" NOT NULL DEFAULT 'OPEN',
    "attributionMode" "EventAttributionMode" NOT NULL DEFAULT 'LUMP_SUM',
    "attributionMonthId" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Event_userId_status_idx" ON "Event"("userId", "status");

-- CreateIndex
CREATE INDEX "Event_attributionMonthId_idx" ON "Event"("attributionMonthId");

-- AddForeignKey
ALTER TABLE "Event"
    ADD CONSTRAINT "Event_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event"
    ADD CONSTRAINT "Event_attributionMonthId_fkey"
    FOREIGN KEY ("attributionMonthId") REFERENCES "MonthRecord"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable: add eventId column to MonthExpenseLine
ALTER TABLE "MonthExpenseLine" ADD COLUMN "eventId" TEXT;

-- CreateIndex
CREATE INDEX "MonthExpenseLine_eventId_idx" ON "MonthExpenseLine"("eventId");

-- AddForeignKey
ALTER TABLE "MonthExpenseLine"
    ADD CONSTRAINT "MonthExpenseLine_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "Event"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
