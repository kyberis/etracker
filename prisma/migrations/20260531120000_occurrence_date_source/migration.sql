-- CreateEnum
CREATE TYPE "OccurrenceDateSource" AS ENUM ('USER', 'ARTIFACT', 'ESTIMATED');

-- AlterTable
ALTER TABLE "MonthExpenseLine"
ADD COLUMN "occurredOnSource" "OccurrenceDateSource" NOT NULL DEFAULT 'USER';

ALTER TABLE "MonthIncomeLine"
ADD COLUMN "occurredOnSource" "OccurrenceDateSource" NOT NULL DEFAULT 'USER';
