-- CreateTable
CREATE TABLE "RevolutConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "accountId" TEXT,
    "institutionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastSyncAt" TIMESTAMP(3),
    "defaultImportBankId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevolutConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IgnoredTransaction" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IgnoredTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RevolutConnection_userId_key" ON "RevolutConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RevolutConnection_requisitionId_key" ON "RevolutConnection"("requisitionId");

-- CreateIndex
CREATE UNIQUE INDEX "IgnoredTransaction_connectionId_transactionId_key" ON "IgnoredTransaction"("connectionId", "transactionId");

-- AddForeignKey
ALTER TABLE "RevolutConnection" ADD CONSTRAINT "RevolutConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IgnoredTransaction" ADD CONSTRAINT "IgnoredTransaction_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "RevolutConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
