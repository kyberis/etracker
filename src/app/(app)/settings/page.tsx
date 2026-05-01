import { PageContainer } from "@/components/page-container";
import { SettingsManager } from "@/components/settings-manager";
import { SubscriptionCard } from "@/components/subscription-card";
import { isUpsellActive } from "@/lib/billing/stripe";
import { isGoogleAuthConfigured } from "@/lib/auth-providers";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { requireUserId } from "@/lib/session";

async function loadSettingsData() {
  const userId = await requireUserId();
  const now = new Date();
  const [user, banks, revolutConnection, apiTokens, donationCount, upsellOn, passkeys] =
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
        whatsappPhone: true,
        whatsappVerifiedAt: true,
        whatsappLinkCode: true,
        whatsappLinkCodeExpires: true,
        telegramUserId: true,
        telegramUsername: true,
        telegramVerifiedAt: true,
        telegramLinkCode: true,
        telegramLinkCodeExpires: true,
        stripeCustomerId: true,
        subscriptionStatus: true,
        subscriptionCurrentPeriodEnd: true,
        dailyAgentMessageLimit: true,
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
    db.donation.count({ where: { userId } }),
    isUpsellActive(userId),
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
  ]);

  if (!user) {
    throw new Error("User not found.");
  }

  const waPending =
    user.whatsappLinkCode &&
    user.whatsappLinkCodeExpires &&
    user.whatsappLinkCodeExpires > now;

  const tgPending =
    user.telegramLinkCode &&
    user.telegramLinkCodeExpires &&
    user.telegramLinkCodeExpires > now;

  const linked = Boolean(revolutConnection?.accountId);

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
    initialWhatsapp: {
      phone: user.whatsappVerifiedAt ? user.whatsappPhone : null,
      verifiedAt: user.whatsappVerifiedAt
        ? user.whatsappVerifiedAt.toISOString()
        : null,
      pendingCode: waPending ? user.whatsappLinkCode : null,
      pendingExpiresAt: waPending
        ? user.whatsappLinkCodeExpires!.toISOString()
        : null,
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
      upsellActive: upsellOn,
      hasStripeCustomer: Boolean(user.stripeCustomerId),
      dailyAgentMessageLimit: user.dailyAgentMessageLimit,
    },
  } as const;
}

export default async function SettingsPage() {
  const [data, locale] = await Promise.all([loadSettingsData(), getLocale()]);
  const t = getDict(locale);

  // Card is shown only when there's something to manage: the upsell flag is
  // on for this user, OR they already have a Stripe customer (so they can
  // see receipts / cancel even if the flag was flipped off later).
  const showSubscriptionCard =
    data.subscription.upsellActive ||
    data.subscription.hasStripeCustomer ||
    data.subscription.status === "active" ||
    data.subscription.status === "trialing";

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
          upsellActive={data.subscription.upsellActive}
          hasStripeCustomer={data.subscription.hasStripeCustomer}
          dailyAgentMessageLimit={data.subscription.dailyAgentMessageLimit}
        />
      ) : null}
      <SettingsManager
        initialUser={data.initialUser}
        initialWhatsapp={data.initialWhatsapp}
        initialTelegram={data.initialTelegram}
        initialBanks={data.initialBanks}
        initialRevolut={data.initialRevolut}
        initialApiTokens={data.initialApiTokens}
        initialPasskeys={data.initialPasskeys}
        googleAuthConfigured={isGoogleAuthConfigured()}
      />
    </PageContainer>
  );
}
