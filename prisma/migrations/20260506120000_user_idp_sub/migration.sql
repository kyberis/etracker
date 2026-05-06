-- IdP OIDC `sub` for unified accounts (Telegram map, upgrade deep links).
ALTER TABLE "User" ADD COLUMN "idpSub" TEXT;
CREATE UNIQUE INDEX "User_idpSub_key" ON "User"("idpSub");
