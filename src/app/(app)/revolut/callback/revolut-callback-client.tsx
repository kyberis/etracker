"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTx } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function RevolutCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tx = useTx();
  const ref = searchParams.get("ref") ?? "";
  const refOk = ref.length > 0;

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    refOk
      ? null
      : tx({
          es: "Falta el identificador de la sesión (ref). Volvé a iniciar la vinculación desde Ajustes.",
          en: "Missing session id (ref). Restart the linking flow from Settings.",
        }),
  );
  const [busy, setBusy] = useState(refOk);

  useEffect(() => {
    if (!refOk) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/revolut/callback?ref=${encodeURIComponent(ref)}`);
        const data = (await res.json()) as
          | { ok: true; accountId?: string }
          | { ok: false; message?: string; error?: string }
          | { error?: string };

        if (cancelled) return;

        if (!res.ok) {
          setError(
            "error" in data && data.error
              ? data.error
              : tx({
                  es: "No se pudo completar la vinculación.",
                  en: "Could not complete the linking.",
                }),
          );
          return;
        }

        if ("ok" in data && data.ok === true) {
          setMessage(
            tx({ es: "Revolut vinculado correctamente.", en: "Revolut linked successfully." }),
          );
          return;
        }

        if ("ok" in data && data.ok === false) {
          setError(
            data.message ??
              tx({ es: "La vinculación no terminó todavía.", en: "Linking has not finished yet." }),
          );
          return;
        }

        setMessage(tx({ es: "Listo.", en: "Done." }));
      } catch {
        if (!cancelled) {
          setError(tx({ es: "Error de red. Probá de nuevo.", en: "Network error. Try again." }));
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ref, refOk, tx]);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{tx({ es: "Vinculación Revolut", en: "Revolut linking" })}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {busy ? (
            <p className="text-muted-foreground">
              {tx({ es: "Completando la vinculación…", en: "Completing linking…" })}
            </p>
          ) : null}
          {message ? <p className="text-green-600 dark:text-green-400">{message}</p> : null}
          {error ? <p className="text-destructive">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Link href="/settings" className={cn(buttonVariants({ variant: "outline" }))}>
              {tx({ es: "Ir a Ajustes", en: "Go to Settings" })}
            </Link>
            {!busy && message ? (
              <Button type="button" onClick={() => router.push("/settings")}>
                {tx({ es: "Continuar", en: "Continue" })}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
