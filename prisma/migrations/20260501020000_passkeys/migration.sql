-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialPublicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "deviceType" TEXT NOT NULL,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "name" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
