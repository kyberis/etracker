-- CreateEnum
CREATE TYPE "BankConnectionProvider" AS ENUM ('ENABLE_BANKING');

-- CreateEnum
CREATE TYPE "BankConnectionStatus" AS ENUM ('PENDING', 'ACTIVE', 'NEEDS_REAUTH', 'ERROR', 'DISCONNECTED');

-- CreateTable
CREATE TABLE "BankConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "BankConnectionProvider" NOT NULL DEFAULT 'ENABLE_BANKING',
    "institutionName" TEXT NOT NULL,
    "institutionCountry" CHAR(2) NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "BankConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "validUntil" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankLinkedAccount" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalUid" TEXT NOT NULL,
    "ibanMasked" TEXT,
    "name" TEXT,
    "currency" TEXT NOT NULL,
    "bankId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankLinkedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankImportedTransaction" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "monthLineId" TEXT,
    "lineType" TEXT,
    "rawPayload" JSONB,
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankImportedTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankSyncRun" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "transactionsFound" INTEGER NOT NULL DEFAULT 0,
    "transactionsImported" INTEGER NOT NULL DEFAULT 0,
    "transactionsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "durationMs" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnableBankingApiLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "httpStatus" INTEGER,
    "requestSummary" JSONB,
    "responseSummary" JSONB,
    "errorMessage" TEXT,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnableBankingApiLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankConnection_userId_provider_sessionId_key" ON "BankConnection"("userId", "provider", "sessionId");

-- CreateIndex
CREATE INDEX "BankConnection_userId_status_idx" ON "BankConnection"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BankLinkedAccount_connectionId_externalUid_key" ON "BankLinkedAccount"("connectionId", "externalUid");

-- CreateIndex
CREATE INDEX "BankLinkedAccount_bankId_idx" ON "BankLinkedAccount"("bankId");

-- CreateIndex
CREATE UNIQUE INDEX "BankImportedTransaction_connectionId_externalId_key" ON "BankImportedTransaction"("connectionId", "externalId");

-- CreateIndex
CREATE INDEX "BankImportedTransaction_monthLineId_idx" ON "BankImportedTransaction"("monthLineId");

-- CreateIndex
CREATE INDEX "BankSyncRun_connectionId_startedAt_idx" ON "BankSyncRun"("connectionId", "startedAt");

-- CreateIndex
CREATE INDEX "EnableBankingApiLog_userId_createdAt_idx" ON "EnableBankingApiLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EnableBankingApiLog_action_createdAt_idx" ON "EnableBankingApiLog"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "BankConnection" ADD CONSTRAINT "BankConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankLinkedAccount" ADD CONSTRAINT "BankLinkedAccount_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankLinkedAccount" ADD CONSTRAINT "BankLinkedAccount_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImportedTransaction" ADD CONSTRAINT "BankImportedTransaction_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankSyncRun" ADD CONSTRAINT "BankSyncRun_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "BankConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnableBankingApiLog" ADD CONSTRAINT "EnableBankingApiLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
