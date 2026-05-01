"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";

type Props = {
  id: string;
  repliedAt: string | null;
  archivedAt: string | null;
};

/**
 * Client-side toggles for `repliedAt` and `archivedAt`. Hits
 * `PATCH /api/admin/contact/[id]` and refreshes the server tree on success.
 *
 * Why three buttons instead of one form: the actions are independently
 * idempotent (you can mark a message as replied without archiving), and a
 * single dropdown would obscure the current state from the admin.
 */
export function ContactMessageActions({ id, repliedAt, archivedAt }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function call(body: Record<string, string | null>) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/contact/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? "No se pudo actualizar.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {repliedAt ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => call({ repliedAt: null })}
            disabled={pending}
          >
            Desmarcar respondido
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={() => call({ repliedAt: new Date().toISOString() })}
            disabled={pending}
          >
            Marcar respondido
          </Button>
        )}

        {archivedAt ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => call({ archivedAt: null })}
            disabled={pending}
          >
            Desarchivar
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => call({ archivedAt: new Date().toISOString() })}
            disabled={pending}
          >
            Archivar
          </Button>
        )}
      </div>
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
