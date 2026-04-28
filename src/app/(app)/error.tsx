"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[etracker.error] app boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">No pudimos cargar esta sección</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        Hubo un error mostrando esta vista de tu cuenta. Probá reintentar; si seguís viendo
        esto, volvé al inicio o recargá.
      </p>
      {error.digest ? (
        <p className="text-muted-foreground/70 font-mono text-[11px]">id: {error.digest}</p>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={reset}>Reintentar</Button>
        <Link href="/app" className={buttonVariants({ variant: "outline" })}>
          Inicio
        </Link>
      </div>
    </div>
  );
}
