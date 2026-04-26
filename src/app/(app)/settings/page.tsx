import { SettingsManager } from "@/components/settings-manager";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/session";

export default async function SettingsPage() {
  const userId = await requireUserId();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!user) {
    throw new Error("User not found.");
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <SettingsManager initialUser={{ email: user.email }} />
    </div>
  );
}
