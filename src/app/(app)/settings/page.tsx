import { PageContainer } from "@/components/page-container";
import { SettingsManager } from "@/components/settings-manager";
import { isGoogleAuthConfigured } from "@/lib/auth-providers";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";

async function loadSettingsData() {
  const userId = await requireUserId();
  const now = new Date();
  const [user, banks, revolutConnection, apiTokens] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        expenseImportInstructions: true,
        passwordHash: true,
        primaryCurrency: true,
        primaryCurrencyConfirmedAt: true,
        whatsappPhone: true,
        whatsappVerifiedAt: true,
        whatsappLinkCode: true,
        whatsappLinkCodeExpires: true,
        accounts: { select: { provider: true } },
      },
    }),
    db.bank.findMany({
      where: { userId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.revolutConnection.findUnique({
      where: { userId },
      select: {
        status: true,
        institutionId: true,
        accountId: true,
        lastSyncAt: true,
        defaultImportBankId: true,
      },
    }),
    db.apiToken.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
    }),
  ]);

  if (!user) {
    throw new Error("User not found.");
  }

  const pending =
    user.whatsappLinkCode &&
    user.whatsappLinkCodeExpires &&
    user.whatsappLinkCodeExpires > now;

  const linked = Boolean(revolutConnection?.accountId);

  return {
    initialUser: {
      email: user.email,
      expenseImportInstructions: user.expenseImportInstructions,
      hasPassword: user.passwordHash != null,
      primaryCurrency: user.primaryCurrency,
      primaryCurrencyConfirmedAt: user.primaryCurrencyConfirmedAt?.toISOString() ?? null,
      linkedProviders: user.accounts.map((a) => a.provider),
    },
    initialWhatsapp: {
      phone: user.whatsappVerifiedAt ? user.whatsappPhone : null,
      verifiedAt: user.whatsappVerifiedAt
        ? user.whatsappVerifiedAt.toISOString()
        : null,
      pendingCode: pending ? user.whatsappLinkCode : null,
      pendingExpiresAt: pending
        ? user.whatsappLinkCodeExpires!.toISOString()
        : null,
    },
    initialBanks: banks.map((b) => ({ id: b.id, name: b.name })),
    initialRevolut: revolutConnection
      ? ({
          connected: true as const,
          linked,
          pending: !linked,
          institutionId: revolutConnection.institutionId,
          lastSyncAt: revolutConnection.lastSyncAt?.toISOString() ?? null,
          defaultImportBankId: revolutConnection.defaultImportBankId,
        } as const)
      : ({ connected: false as const } as const),
    initialApiTokens: apiTokens.map((t) => ({
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      revokedAt: t.revokedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
  } as const;
}

export default async function SettingsPage() {
  const data = await loadSettingsData();

  return (
    <PageContainer className="space-y-4">
      <h1 className="font-display text-2xl font-semibold">Configuración</h1>
      <SettingsManager
        initialUser={data.initialUser}
        initialWhatsapp={data.initialWhatsapp}
        initialBanks={data.initialBanks}
        initialRevolut={data.initialRevolut}
        initialApiTokens={data.initialApiTokens}
        googleAuthConfigured={isGoogleAuthConfigured()}
      />
    </PageContainer>
  );
}
