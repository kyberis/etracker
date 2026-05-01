"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useLocale, useTx } from "@/lib/i18n/client";

type Props = {
  /** Live `CURRENT_TERMS_VERSION` from `src/lib/legal.ts`. */
  currentVersion: string;
  /** Validated, in-app `?next=` redirect target. */
  next: string;
  /**
   * The version the user previously accepted, if any. `null` for first-time
   * Google users and legacy accounts. Used to phrase the headline as
   * "accept" vs "re-accept".
   */
  previousVersion: string | null;
};

/**
 * Minimal full-screen form. Calls `PATCH /api/onboarding` with just
 * `acceptedTermsVersion` so the server stamps `acceptedTermsAt`. We don't
 * touch `complete: true` here; the user's onboarding state is separate.
 */
export function AcceptTermsForm({ currentVersion, next, previousVersion }: Props) {
  const tx = useTx();
  const locale = useLocale();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isReAcceptance = Boolean(previousVersion);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptedTermsVersion: currentVersion }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(
          data.error ??
            tx({
              es: "No pudimos guardar la aceptación. Probá de nuevo.",
              en: "We couldn't save your acceptance. Try again.",
            }),
        );
        return;
      }
      router.push(next);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-xl">
      <Card className="shadow-sm">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <header className="space-y-2">
            <p className="text-muted-foreground text-xs font-medium tracking-[0.18em] uppercase">
              {tx({ es: "Términos y privacidad", en: "Terms and privacy" })} ·{" "}
              {tx({ es: "versión", en: "version" })} {currentVersion}
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              {isReAcceptance
                ? tx({
                    es: "Actualizamos los Términos.",
                    en: "We updated the Terms.",
                  })
                : tx({
                    es: "Antes de empezar, una sola cosa.",
                    en: "One thing before we start.",
                  })}
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {isReAcceptance
                ? tx({
                    es: "Cambiaron los Términos del servicio o la Política de Privacidad. Léelos rápido y aceptá la nueva versión para seguir usando Clara.",
                    en: "The Terms or the Privacy Policy changed. Have a quick look and accept the new version to keep using Clara.",
                  })
                : tx({
                    es: "Necesitamos tu aceptación explícita de los Términos y la Política de Privacidad para crear tu cuenta. Es parte de cumplir con GDPR.",
                    en: "We need your explicit acceptance of the Terms and the Privacy Policy to set up your account. It's part of complying with GDPR.",
                  })}
            </p>
          </header>

          <form className="space-y-5" onSubmit={onSubmit}>
            <label className="flex items-start gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm">
              <Checkbox
                id="accept-terms"
                checked={accepted}
                onCheckedChange={(value) => setAccepted(value === true)}
                required
                aria-required="true"
                className="mt-0.5"
              />
              <span className="leading-relaxed">
                {tx({ es: "Acepto los", en: "I accept the" })}{" "}
                <Link
                  href={`/${locale}/terms`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground decoration-primary underline-offset-4 hover:underline"
                >
                  {tx({ es: "Términos", en: "Terms" })}
                </Link>{" "}
                {tx({ es: "y la", en: "and the" })}{" "}
                <Link
                  href={`/${locale}/privacy`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground decoration-primary underline-offset-4 hover:underline"
                >
                  {tx({ es: "Política de Privacidad", en: "Privacy Policy" })}
                </Link>{" "}
                ({tx({ es: "versión", en: "version" })} {currentVersion}).
              </span>
            </label>

            {error ? <p className="text-destructive text-sm">{error}</p> : null}

            <Button
              type="submit"
              size="lg"
              className="w-full"
              disabled={!accepted || submitting}
            >
              {submitting
                ? tx({ es: "Guardando…", en: "Saving…" })
                : tx({ es: "Aceptar y continuar", en: "Accept and continue" })}{" "}
              →
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
