import { addDays, subDays } from "date-fns";
import { notFound } from "next/navigation";

import { EventDetail } from "@/components/event-detail";
import { PageContainer } from "@/components/page-container";
import { db } from "@/lib/db";
import { getEvent } from "@/lib/events";
import { formatMonthKey } from "@/lib/months";
import { requireUserId } from "@/lib/session";

const CANDIDATE_LIMIT = 100;
/** Días antes/después del rango del evento incluidos en los candidatos. */
const CANDIDATE_PADDING_DAYS = 14;

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const userId = await requireUserId();
  const { id } = await params;
  const event = await getEvent(userId, id);
  if (!event) notFound();

  // Para sugerir candidatos a "sumar al evento" usamos una ventana relajada
  // alrededor del rango. Si el evento no tiene fin, padding 0 al final
  // y traemos hasta hoy. Si el usuario igual quiere ver más, hay un
  // toggle en la UI para ampliar a "todos los gastos sueltos".
  const start = subDays(event.startDate, CANDIDATE_PADDING_DAYS);
  const end = event.endDate
    ? addDays(event.endDate, CANDIDATE_PADDING_DAYS)
    : new Date();

  const [user, lines, candidatesNear, candidatesAll] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { primaryCurrency: true },
    }),
    db.monthExpenseLine.findMany({
      where: { eventId: event.id, userId },
      orderBy: { occurredOn: "desc" },
      include: {
        bank: { select: { name: true } },
        monthRecord: { select: { month: true } },
      },
    }),
    event.status === "OPEN"
      ? db.monthExpenseLine.findMany({
          where: {
            userId,
            eventId: null,
            occurredOn: { gte: start, lte: end },
          },
          orderBy: { occurredOn: "desc" },
          take: CANDIDATE_LIMIT,
          include: {
            bank: { select: { name: true } },
            monthRecord: { select: { month: true } },
          },
        })
      : Promise.resolve([] as never[]),
    event.status === "OPEN"
      ? db.monthExpenseLine.findMany({
          where: { userId, eventId: null },
          orderBy: { occurredOn: "desc" },
          take: CANDIDATE_LIMIT,
          include: {
            bank: { select: { name: true } },
            monthRecord: { select: { month: true } },
          },
        })
      : Promise.resolve([] as never[]),
  ]);

  function toLinePayload(line: (typeof lines)[number]) {
    return {
      id: line.id,
      name: line.name,
      amount: line.amount.toString(),
      amountConverted: line.amountConverted.toString(),
      currency: line.currency,
      monthKey: formatMonthKey(line.monthRecord.month),
      occurredOn: line.occurredOn.toISOString().slice(0, 10),
      bankName: line.bank.name,
      category: line.category,
      paid: line.paid,
    };
  }

  const linePayloads = lines.map(toLinePayload);
  const candidatesNearPayloads = candidatesNear.map(toLinePayload);
  const candidatesAllPayloads = candidatesAll.map(toLinePayload);

  return (
    <PageContainer className="space-y-6">
      <EventDetail
        event={event}
        lines={linePayloads}
        candidatesInRange={candidatesNearPayloads}
        candidatesAll={candidatesAllPayloads}
        primaryCurrency={user?.primaryCurrency ?? "USD"}
      />
    </PageContainer>
  );
}
