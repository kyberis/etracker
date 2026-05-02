import { EventsManager } from "@/components/events-manager";
import { PageContainer } from "@/components/page-container";
import { db } from "@/lib/db";
import { listEvents } from "@/lib/events";
import { getT } from "@/lib/i18n/server";
import { requireUserId } from "@/lib/session";

export default async function EventsPage() {
  const [userId, t] = await Promise.all([requireUserId(), getT()]);
  const [events, user] = await Promise.all([
    listEvents(userId),
    db.user.findUnique({
      where: { id: userId },
      select: { primaryCurrency: true },
    }),
  ]);

  return (
    <PageContainer className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-semibold">
          {t.header.nav.events}
        </h1>
      </div>
      <EventsManager
        initialEvents={events}
        primaryCurrency={user?.primaryCurrency ?? "USD"}
      />
    </PageContainer>
  );
}
