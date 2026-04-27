"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function RevolutCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get("ref") ?? "";
  const refOk = ref.length > 0;

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(
    refOk
      ? null
      : "Falta el identificador de la sesión (ref). Volvé a iniciar la vinculación desde Ajustes.",
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
          setError("error" in data && data.error ? data.error : "No se pudo completar la vinculación.");
          return;
        }

        if ("ok" in data && data.ok === true) {
          setMessage("Revolut vinculado correctamente.");
          return;
        }

        if ("ok" in data && data.ok === false) {
          setError(data.message ?? "La vinculación no terminó todavía.");
          return;
        }

        setMessage("Listo.");
      } catch {
        if (!cancelled) {
          setError("Error de red. Probá de nuevo.");
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
  }, [ref, refOk]);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Vinculación Revolut</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {busy ? <p className="text-muted-foreground">Completando la vinculación…</p> : null}
          {message ? <p className="text-green-600 dark:text-green-400">{message}</p> : null}
          {error ? <p className="text-destructive">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Link href="/settings" className={cn(buttonVariants({ variant: "outline" }))}>
              Ir a Ajustes
            </Link>
            {!busy && message ? (
              <Button type="button" onClick={() => router.push("/settings")}>
                Continuar
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
