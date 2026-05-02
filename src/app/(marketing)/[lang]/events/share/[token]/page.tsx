import { format, parseISO } from "date-fns";
import { es as esLocale, enUS } from "date-fns/locale";
import type { Metadata } from "next";
import Link from "next/link";

import { db } from "@/lib/db";
import { verifyShareToken } from "@/lib/events-share";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { getOptionalUserId } from "@/lib/session";

import { ShareAcceptForm } from "./share-accept-form";

type PageProps = {
  params: Promise<{ lang: string; token: string }>;
};

const COPY: Record<
  Locale,
  {
    metaTitle: (eventName: string) => string;
    metaDescription: (
      eventName: string,
      ownerName: string,
    ) => string;
    invalidTitle: string;
    invalidBody: string;
    expiredTitle: string;
    expiredBody: string;
    revokedTitle: string;
    revokedBody: string;
    closedTitle: string;
    closedBody: string;
    inviteHeading: (ownerName: string) => string;
    inviteSubhead: (
      eventName: string,
      ownerName: string,
    ) => string;
    rangeLabel: string;
    rangeOpen: string;
    alreadyJoinedTitle: string;
    alreadyJoinedBody: string;
    goToEvent: string;
    sectionGuestTitle: string;
    sectionGuestBody: string;
    sectionRegisteredTitle: string;
    sectionRegisteredBody: string;
    nameLabel: string;
    namePlaceholder: string;
    submitGuest: string;
    submitRegistered: string;
    legalNote: string;
    termsLink: string;
    privacyLink: string;
    or: string;
    signInPrompt: string;
    signInLink: string;
    errorGeneric: string;
  }
> = {
  es: {
    metaTitle: (name) => `Sumate a ${name} en Clara`,
    metaDescription: (name, owner) =>
      `${owner} te invitó a llevar los gastos del viaje "${name}" en Clara.`,
    invalidTitle: "Este link no es válido",
    invalidBody:
      "El link que abriste no se encuentra. Pedile al organizador que te mande uno nuevo.",
    expiredTitle: "Este link expiró",
    expiredBody:
      "Pedile al organizador del viaje que genere un link nuevo desde la pantalla del evento.",
    revokedTitle: "Este link fue desactivado",
    revokedBody:
      "El organizador del viaje desactivó este link. Pedile uno nuevo.",
    closedTitle: "El viaje ya está cerrado",
    closedBody:
      "Este viaje fue cerrado y los gastos ya fueron repartidos. No se aceptan más participantes.",
    inviteHeading: (owner) => `${owner} te invitó`,
    inviteSubhead: (name, owner) =>
      `Sumate a ${name} con ${owner} y llevemos los gastos del viaje juntos.`,
    rangeLabel: "Fechas",
    rangeOpen: "Sin fecha de cierre",
    alreadyJoinedTitle: "Ya estás dentro",
    alreadyJoinedBody:
      "Tenés acceso a este viaje. Abrilo desde tu panel para ver los gastos.",
    goToEvent: "Abrir el viaje",
    sectionGuestTitle: "Sumate por Telegram",
    sectionGuestBody:
      "Sin cuenta de Clara — empezás a cargar gastos en segundos. Te llevamos a Telegram para abrir la conversación con el bot.",
    sectionRegisteredTitle: "Ya tengo cuenta",
    sectionRegisteredBody:
      "Sumate desde tu cuenta y el viaje aparece en tu panel.",
    nameLabel: "¿Cómo querés que te llamen?",
    namePlaceholder: "Tu nombre",
    submitGuest: "Sumarme por Telegram",
    submitRegistered: "Sumarme al viaje",
    legalNote:
      "Al sumarte aceptás que se cree una cuenta de invitado en Clara para llevar este viaje.",
    termsLink: "Términos",
    privacyLink: "Política de Privacidad",
    or: "o",
    signInPrompt: "¿Ya sos parte? ",
    signInLink: "Iniciá sesión",
    errorGeneric: "No pudimos procesar tu pedido. Probá de nuevo.",
  },
  en: {
    metaTitle: (name) => `Join ${name} on Clara`,
    metaDescription: (name, owner) =>
      `${owner} invited you to track expenses for the trip "${name}" on Clara.`,
    invalidTitle: "This link is not valid",
    invalidBody:
      "We couldn't find this invite. Ask the organiser to send you a fresh one.",
    expiredTitle: "This link has expired",
    expiredBody:
      "Ask the trip's organiser to generate a new invite from the event screen.",
    revokedTitle: "This link was revoked",
    revokedBody:
      "The trip's organiser revoked this invite. Ask them for a new one.",
    closedTitle: "The trip is already closed",
    closedBody:
      "This trip was closed and expenses were settled. New participants can't join.",
    inviteHeading: (owner) => `${owner} invited you`,
    inviteSubhead: (name, owner) =>
      `Join ${name} with ${owner} and we'll track the trip's expenses together.`,
    rangeLabel: "Dates",
    rangeOpen: "No end date",
    alreadyJoinedTitle: "You're already in",
    alreadyJoinedBody:
      "You already have access to this trip. Open it from your dashboard to see the expenses.",
    goToEvent: "Open the trip",
    sectionGuestTitle: "Join via Telegram",
    sectionGuestBody:
      "No Clara account needed — you'll be logging expenses in seconds. We'll send you to Telegram to start chatting with the bot.",
    sectionRegisteredTitle: "I already have an account",
    sectionRegisteredBody:
      "Join from your account and the trip will show up on your dashboard.",
    nameLabel: "What should we call you?",
    namePlaceholder: "Your name",
    submitGuest: "Join via Telegram",
    submitRegistered: "Join the trip",
    legalNote:
      "Joining creates a guest account on Clara to track this trip.",
    termsLink: "Terms",
    privacyLink: "Privacy Policy",
    or: "or",
    signInPrompt: "Already in? ",
    signInLink: "Sign in",
    errorGeneric: "We couldn't process your request. Please try again.",
  },
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang, token } = await params;
  const locale: Locale = isLocale(lang) ? lang : "es";
  const t = COPY[locale];
  const verified = await verifyShareToken(token);
  if (!verified.ok) {
    return {
      title: t.invalidTitle,
      robots: { index: false, follow: false },
    };
  }
  const event = await db.event.findUnique({
    where: { id: verified.eventId },
    select: {
      name: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!event) {
    return { title: t.invalidTitle, robots: { index: false, follow: false } };
  }
  const ownerName = pickOwnerName(event.user);
  return {
    title: t.metaTitle(event.name),
    description: t.metaDescription(event.name, ownerName),
    robots: { index: false, follow: false },
  };
}

export default async function EventSharePage({ params }: PageProps) {
  const { lang, token } = await params;
  const locale: Locale = isLocale(lang) ? lang : "es";
  const t = COPY[locale];
  const dfLocale = locale === "en" ? enUS : esLocale;

  const verified = await verifyShareToken(token);
  if (!verified.ok) {
    const { title, body } =
      verified.reason === "expired"
        ? { title: t.expiredTitle, body: t.expiredBody }
        : verified.reason === "revoked"
          ? { title: t.revokedTitle, body: t.revokedBody }
          : { title: t.invalidTitle, body: t.invalidBody };
    return <Shell title={title} body={body} />;
  }

  const event = await db.event.findUnique({
    where: { id: verified.eventId },
    select: {
      id: true,
      name: true,
      color: true,
      startDate: true,
      endDate: true,
      status: true,
      userId: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!event) {
    return <Shell title={t.invalidTitle} body={t.invalidBody} />;
  }

  if (event.status === "CLOSED") {
    return <Shell title={t.closedTitle} body={t.closedBody} />;
  }

  const ownerName = pickOwnerName(event.user);

  // Authenticated visitor + already in (owner counts as already-in)
  // → show a friendly "open the trip" pointer, no accept form.
  const callerUserId = await getOptionalUserId();
  let alreadyJoined = false;
  if (callerUserId) {
    if (event.userId === callerUserId) {
      alreadyJoined = true;
    } else {
      const part = await db.eventParticipant.findUnique({
        where: {
          eventId_userId: {
            eventId: event.id,
            userId: callerUserId,
          },
        },
        select: { removedAt: true },
      });
      alreadyJoined = Boolean(part && part.removedAt === null);
    }
  }

  const rangeLabel = formatRange(
    event.startDate,
    event.endDate,
    dfLocale,
    t.rangeOpen,
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-8 flex items-center gap-3">
        {event.color ? (
          <span
            aria-hidden
            className="size-3 rounded-full"
            style={{ backgroundColor: event.color }}
          />
        ) : null}
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {t.inviteHeading(ownerName)}
        </p>
      </header>

      <div className="border-border/60 bg-card text-card-foreground rounded-2xl border p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {event.name}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {t.inviteSubhead(event.name, ownerName)}
        </p>
        <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs uppercase tracking-wide">
              {t.rangeLabel}
            </dt>
            <dd className="text-foreground mt-0.5">{rangeLabel}</dd>
          </div>
        </dl>
      </div>

      {alreadyJoined ? (
        <section className="border-border/60 bg-card text-card-foreground mt-6 rounded-2xl border p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold">{t.alreadyJoinedTitle}</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {t.alreadyJoinedBody}
          </p>
          <Link
            href={`/events/${event.id}`}
            className="bg-foreground text-background hover:bg-foreground/90 mt-5 inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors"
          >
            {t.goToEvent}
          </Link>
        </section>
      ) : (
        <ShareAcceptForm
          token={token}
          locale={locale}
          eventId={event.id}
          isAuthenticated={Boolean(callerUserId)}
          copy={{
            sectionGuestTitle: t.sectionGuestTitle,
            sectionGuestBody: t.sectionGuestBody,
            sectionRegisteredTitle: t.sectionRegisteredTitle,
            sectionRegisteredBody: t.sectionRegisteredBody,
            nameLabel: t.nameLabel,
            namePlaceholder: t.namePlaceholder,
            submitGuest: t.submitGuest,
            submitRegistered: t.submitRegistered,
            legalNote: t.legalNote,
            termsLink: t.termsLink,
            privacyLink: t.privacyLink,
            or: t.or,
            signInPrompt: t.signInPrompt,
            signInLink: t.signInLink,
            errorGeneric: t.errorGeneric,
          }}
        />
      )}
    </div>
  );
}

function Shell({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
      <div className="border-border/60 bg-card text-card-foreground rounded-2xl border p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-3 text-sm">{body}</p>
      </div>
    </div>
  );
}

function pickOwnerName(
  user: { name: string | null; email: string } | null,
): string {
  if (!user) return "Tu organizador";
  if (user.name && user.name.trim().length > 0) return user.name.trim();
  return user.email.split("@")[0] || "Tu organizador";
}

function formatRange(
  start: Date | string,
  end: Date | string | null,
  locale: typeof esLocale,
  openLabel: string,
): string {
  // Server components hand us Date objects, but defend against ISO strings
  // too (e.g. parsed from URL params someday).
  const s = typeof start === "string" ? parseISO(start) : start;
  const e = end ? (typeof end === "string" ? parseISO(end) : end) : null;
  const startFmt = format(s, "d LLL yyyy", { locale });
  if (!e) return `${startFmt} — ${openLabel}`;
  const endFmt = format(e, "d LLL yyyy", { locale });
  return `${startFmt} → ${endFmt}`;
}
