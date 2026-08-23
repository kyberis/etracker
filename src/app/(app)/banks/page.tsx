import { BanksManager } from "@/components/banks-manager";
import { OpenBankingConnectCta } from "@/components/open-banking-connect-cta";
import { PageContainer } from "@/components/page-container";
import { db } from "@/lib/db";
import { getOpenBankingCtaKind } from "@/lib/enable-banking/access";
import { getT } from "@/lib/i18n/server";
import { requireUserId } from "@/lib/session";

export default async function BanksPage() {
  const [userId, t] = await Promise.all([requireUserId(), getT()]);
  const [banks, openBankingCta] = await Promise.all([
    db.bank.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    getOpenBankingCtaKind(userId),
  ]);

  return (
    <PageContainer className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">{t.banks.pageTitle}</h1>
        <p className="text-muted-foreground text-sm">{t.banks.pageDescription}</p>
      </div>
      {openBankingCta ? <OpenBankingConnectCta kind={openBankingCta} /> : null}
      <BanksManager initialBanks={banks} />
    </PageContainer>
  );
}
