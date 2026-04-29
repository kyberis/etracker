import { BanksManager } from "@/components/banks-manager";
import { PageContainer } from "@/components/page-container";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { requireUserId } from "@/lib/session";

export default async function BanksPage() {
  const [userId, t] = await Promise.all([requireUserId(), getT()]);
  const banks = await db.bank.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });

  return (
    <PageContainer className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">{t.banks.pageTitle}</h1>
      <BanksManager initialBanks={banks} />
    </PageContainer>
  );
}
