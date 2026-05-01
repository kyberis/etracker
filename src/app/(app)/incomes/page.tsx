import { IncomesManager } from "@/components/incomes-manager";
import { PageContainer } from "@/components/page-container";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";
import { formatMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";

/**
 * Plantillas de ingreso (sueldo, alquiler cobrado, freelance retainer, etc.).
 * Espejo de la página de gastos. Las plantillas materializan líneas en cada
 * mes que aplican (con `received=false`); la UI del mes confirma cuando la
 * plata entra.
 */
export default async function IncomesPage() {
  const [userId, t] = await Promise.all([requireUserId(), getT()]);
  const [user, banks, incomes] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { primaryCurrency: true },
    }),
    db.bank.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.income.findMany({
      where: { userId },
      include: { bank: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
  ]);
  const primaryCurrency = user?.primaryCurrency ?? "USD";

  const initialIncomes = incomes.map((income) => ({
    id: income.id,
    name: income.name,
    amount: String(income.amount),
    currency: income.currency,
    bankId: income.bankId,
    bank: income.bank,
    isRecurring: income.isRecurring,
    startMonth: formatMonthKey(income.startMonth),
    endMonth: income.endMonth ? formatMonthKey(income.endMonth) : null,
    category: income.category as string,
  }));

  return (
    <PageContainer className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">{t.incomes.pageTitle}</h1>
        <p className="text-muted-foreground text-sm">{t.incomes.pageDescription}</p>
      </div>
      <IncomesManager
        initialBanks={banks}
        initialIncomes={initialIncomes}
        primaryCurrency={primaryCurrency}
      />
    </PageContainer>
  );
}
