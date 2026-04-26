import { SettingsManager } from "@/components/settings-manager";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";

async function loadSettingsData() {
  const userId = await requireUserId();
  const now = new Date();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      whatsappPhone: true,
      whatsappVerifiedAt: true,
      whatsappLinkCode: true,
      whatsappLinkCodeExpires: true,
    },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  const pending =
    user.whatsappLinkCode &&
    user.whatsappLinkCodeExpires &&
    user.whatsappLinkCodeExpires > now;

  return {
    initialUser: { email: user.email },
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
      />
    </div>
  );
}
