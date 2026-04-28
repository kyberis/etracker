import type { Metadata } from "next";

import { ChatExperience } from "@/components/chat-experience";

type PageProps = {
  searchParams: Promise<{ month?: string }>;
};

export const metadata: Metadata = {
  title: "Tu asistente",
  description:
    "Chateá con Clara para registrar gastos, planificar el mes y conectar tu banco.",
  robots: { index: false, follow: false },
};

/**
 * Chat-first authenticated home. Marketing lives at `/`; this is the actual
 * app surface mounted at `/app` so search engines and AI crawlers don't try
 * to index private user data.
 */
export default async function AppHomePage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const month =
    typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : undefined;

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <ChatExperience activeMonth={month} layout="fullscreen" />
    </main>
  );
}
