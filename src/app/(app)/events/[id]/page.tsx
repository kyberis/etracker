import { addDays, subDays } from "date-fns";
import { notFound } from "next/navigation";

import { EventDetail } from "@/components/event-detail";
import { PageContainer } from "@/components/page-container";
import { db } from "@/lib/db";
import {
  computeSettlement,
  getEvent,
  isEventOwner,
  listParticipants,
} from "@/lib/events";
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
  // Visibility check + role: getEvent already accepts the participant
  // case; here we additionally surface "am I the owner?" so the UI can
  // gate the share / remove-participant controls.
  const isOwner = await isEventOwner({ userId, eventId: event.id });
  const participants = await listParticipants({ eventId: event.id });
  // Only compute settlement when there's something to settle. Single-
  // participant events show nothing in the preview card (handled in the
  // UI, but skipping the query keeps the page fast).
  const settlement =
    participants.length >= 2 ? await computeSettlement(event.id) : null;

  // Para sugerir candidatos a "sumar al evento" usamos una ventana relajada
  // alrededor del rango. Si el evento no tiene fin, padding 0 al final
  // y traemos hasta hoy. Si el usuario igual quiere ver más, hay un
  // toggle en la UI para ampliar a "todos los gastos sueltos".
  const start = subDays(event.startDate, CANDIDATE_PADDING_DAYS);
  const end = event.endDate
    ? addDays(event.endDate, CANDIDATE_PADDING_DAYS)
    : new Date();

  // Read lines from the OWNER's books (lines are always stored under
  // the event owner regardless of who logged them via shared event).
  // The candidate-attach lists stay scoped to `userId` because only
  // the owner can attach loose lines to their books.
  const ownerId = event.userId;
  const [ownerUser, lines, candidatesNear, candidatesAll] = await Promise.all([
    db.user.findUnique({
      where: { id: ownerId },
      select: { primaryCurrency: true },
    }),
    db.monthExpenseLine.findMany({
      where: { eventId: event.id },
      orderBy: { occurredOn: "desc" },
      include: {
        bank: { select: { name: true } },
        monthRecord: { select: { month: true } },
      },
    }),
    isOwner && event.status === "OPEN"
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
    isOwner && event.status === "OPEN"
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
      paidByUserId: line.paidByUserId ?? null,
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
        primaryCurrency={ownerUser?.primaryCurrency ?? "USD"}
        currentUserId={userId}
        isOwner={isOwner}
        participants={participants}
        settlement={settlement}
      />
    </PageContainer>
  );
}
