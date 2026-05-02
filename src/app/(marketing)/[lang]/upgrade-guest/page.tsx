import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { db } from "@/lib/db";
import { CURRENT_TERMS_VERSION } from "@/lib/legal";
import { isLocale, type Locale } from "@/lib/i18n/locale";

import { GuestUpgradeForm } from "./guest-upgrade-form";

type PageProps = {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ guest?: string | string[] }>;
};

const COPY: Record<
  Locale,
  {
    metaTitle: string;
    metaDescription: string;
    title: string;
    intro: string;
    notFound: string;
    alreadyRegular: string;
    needTelegram: string;
    emailLabel: string;
    passwordLabel: string;
    passwordHint: string;
    privacyLink: string;
    termsLink: string;
    submit: string;
    success: string;
    signInLink: string;
  }
> = {
  es: {
    metaTitle: "Crear cuenta — Clara",
    metaDescription:
      "Convertí tu cuenta de invitado de Clara en una cuenta completa para llevar tus finanzas del día a día.",
    title: "Guardá lo que cargaste y arrancá con Clara",
    intro:
      "Estás a un paso. Poné un email y una contraseña y tu cuenta de invitado se convierte en una cuenta completa de Clara — con todos los gastos del viaje guardados.",
    notFound:
      "No encontramos tu cuenta de invitado. Si llegaste acá desde un viaje cerrado, tocá el botón de upgrade en Telegram una vez más.",
    alreadyRegular:
      "Esta cuenta ya es una cuenta completa de Clara. Iniciá sesión con tus credenciales.",
    needTelegram:
      "Vinculá Telegram primero tocando el link de invitación que te mandó el organizador.",
    emailLabel: "Email",
    passwordLabel: "Contraseña",
    passwordHint: "Mínimo 8 caracteres.",
    privacyLink: "Política de Privacidad",
    termsLink: "Términos",
    submit: "Crear mi cuenta",
    success: "Listo. Iniciá sesión con tu email y contraseña nueva.",
    signInLink: "Ir a iniciar sesión",
  },
  en: {
    metaTitle: "Create your account — Clara",
    metaDescription:
      "Turn your Clara guest account into a full account to track your day-to-day finances.",
    title: "Save what you logged and start with Clara",
    intro:
      "One step away. Set an email and password and your guest account turns into a full Clara account — with every trip expense saved.",
    notFound:
      "We couldn't find your guest account. If you got here from a closed trip, tap the upgrade button in Telegram again.",
    alreadyRegular:
      "This account is already a full Clara account. Sign in with your credentials.",
    needTelegram:
      "Link Telegram first by tapping the invitation link the organiser sent you.",
    emailLabel: "Email",
    passwordLabel: "Password",
    passwordHint: "At least 8 characters.",
    privacyLink: "Privacy Policy",
    termsLink: "Terms",
    submit: "Create my account",
    success: "Done. Sign in with your new email and password.",
    signInLink: "Go to sign in",
  },
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { lang } = await params;
  const locale: Locale = isLocale(lang) ? lang : "es";
  return {
    title: COPY[locale].metaTitle,
    description: COPY[locale].metaDescription,
    robots: { index: false, follow: false },
  };
}

export default async function GuestUpgradePage({
  params,
  searchParams,
}: PageProps) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const locale: Locale = lang;
  const t = COPY[locale];
  const sp = await searchParams;
  const guestId = Array.isArray(sp.guest) ? sp.guest[0] : sp.guest;

  if (!guestId) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
        <div className="border-border/60 bg-card text-card-foreground rounded-2xl border p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground mt-4 text-sm">{t.notFound}</p>
        </div>
      </div>
    );
  }

  const guest = await db.user.findUnique({
    where: { id: guestId },
    select: { kind: true, telegramVerifiedAt: true },
  });

  if (!guest) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
        <div className="border-border/60 bg-card text-card-foreground rounded-2xl border p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground mt-4 text-sm">{t.notFound}</p>
        </div>
      </div>
    );
  }

  if (guest.kind !== "GUEST") {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
        <div className="border-border/60 bg-card text-card-foreground rounded-2xl border p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground mt-4 text-sm">
            {t.alreadyRegular}
          </p>
        </div>
      </div>
    );
  }

  if (!guest.telegramVerifiedAt) {
    return (
      <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
        <div className="border-border/60 bg-card text-card-foreground rounded-2xl border p-8 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-muted-foreground mt-4 text-sm">{t.needTelegram}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl px-4 py-16 sm:px-6">
      <div className="border-border/60 bg-card text-card-foreground rounded-2xl border p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
        <p className="text-muted-foreground mt-3 text-sm">{t.intro}</p>

        <GuestUpgradeForm
          guestUserId={guestId}
          locale={locale}
          termsVersion={CURRENT_TERMS_VERSION}
          copy={{
            emailLabel: t.emailLabel,
            passwordLabel: t.passwordLabel,
            passwordHint: t.passwordHint,
            privacyLink: t.privacyLink,
            termsLink: t.termsLink,
            submit: t.submit,
            success: t.success,
            signInLink: t.signInLink,
            errorGeneric:
              locale === "en"
                ? "Something went wrong. Please try again."
                : "Algo salió mal. Probá de nuevo.",
          }}
        />
      </div>
    </div>
  );
}
