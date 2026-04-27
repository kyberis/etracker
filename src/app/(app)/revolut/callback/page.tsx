import { Suspense } from "react";

import { RevolutCallbackClient } from "./revolut-callback-client";

export default function RevolutCallbackPage() {
  return (
    <Suspense
      fallback={
        <p className="text-muted-foreground text-sm">Cargando resultado de la vinculación…</p>
      }
    >
      <RevolutCallbackClient />
    </Suspense>
  );
}
