import { BanksManager } from "@/components/banks-manager";
import { PageContainer } from "@/components/page-container";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";

export default async function BanksPage() {
  const userId = await requireUserId();
  const banks = await db.bank.findMany({
    where: { userId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });

  return (
    <PageContainer className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Bancos</h1>
      <BanksManager initialBanks={banks} />
    </PageContainer>
  );
}
