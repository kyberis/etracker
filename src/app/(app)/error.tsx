"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { useT } from "@/lib/i18n/client";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error("[etracker.error] app boundary", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">{t.errors.appCrashTitle}</h1>
      <p className="text-muted-foreground max-w-md text-sm">{t.errors.appCrashBody}</p>
      {error.digest ? (
        <p className="text-muted-foreground/70 font-mono text-[11px]">id: {error.digest}</p>
      ) : null}
      <div className="flex gap-2">
        <Button onClick={reset}>{t.errors.appCrashRetry}</Button>
        <Link href="/app" className={buttonVariants({ variant: "outline" })}>
          {t.errors.notFoundCtaApp}
        </Link>
      </div>
    </div>
  );
}
