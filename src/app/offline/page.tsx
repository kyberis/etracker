import type { Metadata } from "next";

import { Logo } from "@/components/logo";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Sin conexión",
  description: "Volvé a conectarte para seguir usando Clara.",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="bg-background text-foreground flex min-h-[100dvh] flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo size="lg" />
      <div className="flex max-w-sm flex-col gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
          Estás sin conexión
        </h1>
        <p className="text-muted-foreground text-sm">
          No pudimos cargar esta vista. Revisá tu conexión y volvé a intentar — Clara va a
          retomar donde lo dejaste.
        </p>
      </div>
      <a
        href="/app"
        className="bg-primary text-primary-foreground inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium shadow-sm transition-colors hover:opacity-90"
      >
        Reintentar
      </a>
    </main>
  );
}
