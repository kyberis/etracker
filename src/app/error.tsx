"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[etracker.error] boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Algo salió mal</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Tuvimos un problema cargando esta vista. Probá de nuevo; si persiste, recargá la página.
      </p>
      {error.digest ? (
        <p className="text-muted-foreground/70 font-mono text-[11px]">id: {error.digest}</p>
      ) : null}
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
