import { PageContainer } from "@/components/page-container";
import { SavingsManager } from "@/components/savings-manager";
import { getT } from "@/lib/i18n/server";
import { getSavingsState } from "@/lib/savings";
import { requireUserId } from "@/lib/session";

export default async function SavingsPage() {
  const [userId, t] = await Promise.all([requireUserId(), getT()]);
  const initial = await getSavingsState(userId, { limit: 100 });

  return (
    <PageContainer className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">{t.savings.pageTitle}</h1>
        <p className="text-muted-foreground text-sm">{t.savings.pageDescription}</p>
      </div>
      <SavingsManager initial={initial} />
    </PageContainer>
  );
}
