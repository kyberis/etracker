import type { Metadata } from "next";

import { ChatExperience } from "@/components/chat-experience";
import { getOpenBankingCtaKind } from "@/lib/enable-banking/access";
import { getDict, pick } from "@/lib/i18n";
import { getLocaleFromRequest } from "@/lib/i18n/server";
import { requireUserId } from "@/lib/session";

type PageProps = {
  searchParams: Promise<{ month?: string }>;
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleFromRequest();
  const t = getDict(locale);
  return {
    title: t.chat.metaTitle,
    description: pick(locale, {
      es: "Chateá con Clara para registrar gastos, planificar el mes y conectar tu banco.",
      en: "Chat with Clara to log expenses, plan the month and connect your bank.",
    }),
    robots: { index: false, follow: false },
  };
}

/**
 * Chat-first authenticated home. Marketing lives at `/`; this is the actual
 * app surface mounted at `/app` so search engines and AI crawlers don't try
 * to index private user data.
 */
export default async function AppHomePage({ searchParams }: PageProps) {
  const [sp, userId] = await Promise.all([searchParams, requireUserId()]);
  const month =
    typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : undefined;
  const openBankingCta = await getOpenBankingCtaKind(userId);

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ChatExperience
        activeMonth={month}
        layout="fullscreen"
        openBankingCta={openBankingCta}
      />
    </main>
  );
}
