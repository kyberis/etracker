import { BanksManager } from "@/components/banks-manager";
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
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Banks</h1>
      <BanksManager initialBanks={banks} />
    </div>
  );
}
