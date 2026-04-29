import type { Metadata } from "next";

import { Logo } from "@/components/logo";

import { OfflineMessage } from "./offline-message";

export const dynamic = "force-static";

// The offline shell is served by the service worker for any route, so the
// metadata is read from the static prerender. Title/description ship in
// both languages because the request that surfaces this page is offline.
export const metadata: Metadata = {
  title: "Sin conexión / Offline",
  description:
    "Volvé a conectarte para seguir usando Clara. / Reconnect to keep using Clara.",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="bg-background text-foreground flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo size="lg" />
      <OfflineMessage />
    </main>
  );
}
