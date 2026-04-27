import { SettingsManager } from "@/components/settings-manager";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";

async function loadSettingsData() {
  const userId = await requireUserId();
  const now = new Date();
  const [user, banks, revolutConnection] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        expenseImportInstructions: true,
        whatsappPhone: true,
        whatsappVerifiedAt: true,
        whatsappLinkCode: true,
        whatsappLinkCodeExpires: true,
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
  } as const;
}

export default async function SettingsPage() {
  const data = await loadSettingsData();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsManager
        initialUser={data.initialUser}
        initialWhatsapp={data.initialWhatsapp}
        initialBanks={data.initialBanks}
        initialRevolut={data.initialRevolut}
      />
    </div>
  );
}
