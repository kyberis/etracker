import { Suspense } from "react";

import { pick } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

import { RevolutCallbackClient } from "./revolut-callback-client";

export default async function RevolutCallbackPage() {
  const locale = await getLocale();
  const fallback = pick(locale, {
    es: "Cargando resultado de la vinculación…",
    en: "Loading link result…",
  });
  return (
    <Suspense fallback={<p className="text-muted-foreground text-sm">{fallback}</p>}>
      <RevolutCallbackClient />
    </Suspense>
  );
}
