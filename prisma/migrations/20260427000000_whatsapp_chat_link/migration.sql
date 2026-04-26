-- AlterTable: add WhatsApp link fields to User
ALTER TABLE "User"
  ADD COLUMN "whatsappPhone" TEXT,
  ADD COLUMN "whatsappVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "whatsappLinkCode" TEXT,
  ADD COLUMN "whatsappLinkCodeExpires" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_whatsappPhone_key" ON "User"("whatsappPhone");

-- CreateTable: rolling history for the WhatsApp conversation per user
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappMessage_userId_createdAt_idx" ON "WhatsappMessage"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "WhatsappMessage" ADD CONSTRAINT "WhatsappMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
