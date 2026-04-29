"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error("[etracker.error] boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">{t.errors.appCrashTitle}</h1>
      <p className="text-muted-foreground max-w-md text-sm">{t.errors.appCrashBody}</p>
      {error.digest ? (
        <p className="text-muted-foreground/70 font-mono text-[11px]">id: {error.digest}</p>
      ) : null}
      <Button onClick={reset}>{t.errors.appCrashRetry}</Button>
    </div>
  );
}
