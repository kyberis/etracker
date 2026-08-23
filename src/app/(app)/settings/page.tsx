import { PageContainer } from "@/components/page-container";
import { SettingsManager } from "@/components/settings-manager";
import { SubscriptionCard } from "@/components/subscription-card";
import { isGoogleAuthConfigured } from "@/lib/auth-providers";
import {
  buildIdpAccountUrlForClara,
  buildIdpBillingPortalUrlForClara,
  buildIdpUpgradeUrlForClara,
  getIdpBaseUrl,
  getIdpBrowserOrigin,
  shouldSendUsersToUnifiedIdp,
} from "@/lib/idp-base";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { listUserConnections, serializePublicConnection } from "@/lib/db/bank-connections";
import { isOpenBankingAvailable } from "@/lib/enable-banking/access";
import { requireUserId } from "@/lib/session";

async function loadSettingsData() {
  const userId = await requireUserId();
  const now = new Date();
  const [user, apiTokens, donationCount, passkeys, openBankingEnabled, openBankingRows] =
    await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        expenseImportInstructions: true,
        passwordHash: true,
        primaryCurrency: true,
        primaryCurrencyConfirmedAt: true,
        locale: true,
        telegramUserId: true,
        telegramUsername: true,
        telegramVerifiedAt: true,
        telegramLinkCode: true,
        telegramLinkCodeExpires: true,
        telegramNudgeEnabled: true,
        stripeCustomerId: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
        dailyAgentMessageLimit: true,
        idpSub: true,
        accounts: { select: { provider: true } },
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
    db.donation.count({ where: { userId } }),
    db.passkey.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
        deviceType: true,
        backedUp: true,
      },
    }),
    isOpenBankingAvailable(userId),
    listUserConnections(userId),
  ]);

  if (!user) {
    throw new Error("User not found.");
  }

  const unifiedIdpBilling = shouldSendUsersToUnifiedIdp();
  const idpUpgradeUrl = unifiedIdpBilling
    ? buildIdpUpgradeUrlForClara(user.idpSub)
    : null;
  const idpPortalUrl = unifiedIdpBilling ? buildIdpBillingPortalUrlForClara() : null;
  const unifiedIdpAccountUrl = unifiedIdpBilling ? buildIdpAccountUrlForClara() : null;
  const ecosystemPatManageUrl = unifiedIdpBilling
    ? `${(getIdpBrowserOrigin() || getIdpBaseUrl()).replace(/\/+$/, "")}/account/developer`
    : null;

  const tgPending =
    user.telegramLinkCode &&
    user.telegramLinkCodeExpires &&
    user.telegramLinkCodeExpires > now;

  return {
    initialUser: {
      email: user.email,
      expenseImportInstructions: user.expenseImportInstructions,
      hasPassword: user.passwordHash != null,
      primaryCurrency: user.primaryCurrency,
      primaryCurrencyConfirmedAt: user.primaryCurrencyConfirmedAt?.toISOString() ?? null,
      locale: isLocale(user.locale) ? user.locale : "es",
      linkedProviders: user.accounts.map((a) => a.provider),
    },
    initialTelegram: {
      linked: Boolean(user.telegramVerifiedAt),
      username: user.telegramVerifiedAt ? user.telegramUsername : null,
      // BigInt → string so Next.js can serialise it across the RSC boundary.
      telegramUserId:
        user.telegramVerifiedAt && user.telegramUserId !== null
          ? user.telegramUserId.toString()
          : null,
      verifiedAt: user.telegramVerifiedAt
        ? user.telegramVerifiedAt.toISOString()
        : null,
      pendingCode: tgPending ? user.telegramLinkCode : null,
      pendingExpiresAt: tgPending
        ? user.telegramLinkCodeExpires!.toISOString()
        : null,
      nudgeEnabled: user.telegramNudgeEnabled,
    },
    initialApiTokens: apiTokens.map((t) => ({
      id: t.id,
      name: t.name,
      prefix: t.prefix,
      lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      expiresAt: t.expiresAt?.toISOString() ?? null,
      revokedAt: t.revokedAt?.toISOString() ?? null,
      createdAt: t.createdAt.toISOString(),
    })),
    initialPasskeys: passkeys.map((p) => ({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt.toISOString(),
      lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
      deviceType: p.deviceType,
      backedUp: p.backedUp,
    })),
    subscription: {
      status: user.subscriptionStatus,
      currentPeriodEnd:
        user.subscriptionCurrentPeriodEnd?.toISOString() ?? null,
      hasDonated: donationCount > 0,
      dailyAgentMessageLimit: user.dailyAgentMessageLimit,
      unifiedIdpBilling,
      idpUpgradeUrl,
      idpPortalUrl,
    },
    ecosystemPatManageUrl,
    unifiedIdpAccountUrl,
    openBankingEnabled,
    openBankingConnections: openBankingEnabled
      ? openBankingRows.map((row) => serializePublicConnection(row))
      : [],
  } as const;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ openBanking?: string }>;
}) {
  const [data, locale, params] = await Promise.all([
    loadSettingsData(),
    getLocale(),
    searchParams,
  ]);
  const t = getDict(locale);

  // Unified IdP: subscription UI is links to user.trefolio.com. Donations-only
  // users still see a thank-you line when not on unified billing.
  const showSubscriptionCard =
    data.subscription.unifiedIdpBilling || data.subscription.hasDonated;

  return (
    <PageContainer className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">{t.settings.pageTitle}</h1>
        <p className="text-muted-foreground text-sm">{t.settings.pageDescription}</p>
      </div>
      {showSubscriptionCard ? (
        <SubscriptionCard
          status={data.subscription.status}
          currentPeriodEnd={data.subscription.currentPeriodEnd}
          hasDonated={data.subscription.hasDonated}
          dailyAgentMessageLimit={data.subscription.dailyAgentMessageLimit}
          unifiedIdpBilling={data.subscription.unifiedIdpBilling}
          idpUpgradeUrl={data.subscription.idpUpgradeUrl}
          idpPortalUrl={data.subscription.idpPortalUrl}
        />
      ) : null}
      <SettingsManager
        initialUser={data.initialUser}
        initialTelegram={data.initialTelegram}
        initialApiTokens={data.initialApiTokens}
        initialPasskeys={data.initialPasskeys}
        googleAuthConfigured={isGoogleAuthConfigured()}
        ecosystemPatManageUrl={data.ecosystemPatManageUrl}
        unifiedIdpAccountUrl={data.unifiedIdpAccountUrl}
        openBankingEnabled={data.openBankingEnabled}
        openBankingConnections={data.openBankingConnections}
        openBankingCallback={params.openBanking ?? null}
      />
    </PageContainer>
  );
}
