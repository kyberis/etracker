"use client";

import { ExternalLink, Heart, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_DONATION_CENTS,
  MAX_DONATION_CENTS,
  MIN_DONATION_CENTS,
} from "@/lib/billing/pricing";
import { useTx } from "@/lib/i18n/client";

export type QuotaUpsellPayload = {
  limit: number;
  used: number;
  resetAtUtc: string;
  upsell: {
    subscription: boolean;
    donation: boolean;
    /** Trefolio Pro checkout on user.trefolio.com when unified IdP billing is on. */
    idpUrl?: string;
  };
};

type Props = {
  payload: QuotaUpsellPayload | null;
  onClose: () => void;
};

function formatEur(cents: number): string {
  const value = cents / 100;
  return value.toLocaleString("es-AR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  });
}

/**
 * Modal shown when `/api/chat` returns a 429 with `kind: "quota_limit"`.
 * Optional CTAs: IdP upgrade link and/or donation checkout (when upsell flags allow).
 */
export function QuotaLimitDialog({ payload, onClose }: Props) {
  const tx = useTx();
  const [donationEur, setDonationEur] = useState<string>(
    String(DEFAULT_DONATION_CENTS / 100),
  );
  const [pending, setPending] = useState<"donation" | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!payload) return null;

  const showDonation = payload.upsell.donation;
  const idpUrl = payload.upsell.idpUrl;
  const showCtas = showDonation;
  const introMulti = Boolean(idpUrl) && showDonation;

  const resetAt = new Date(payload.resetAtUtc);
  const resetLabel = resetAt.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  async function startCheckout(
    body: { mode: "donation"; amountCents: number },
  ) {
    setError(null);
    setPending(body.mode);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
      });
      const data = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !data.url) {
        setError(
          data.error ??
            tx({
              es: "No pude abrir el pago. Probá de nuevo en un momento.",
              en: "Could not open checkout. Try again in a moment.",
            }),
        );
        setPending(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(
        tx({
          es: "No pude abrir el pago. Probá de nuevo en un momento.",
          en: "Could not open checkout. Try again in a moment.",
        }),
      );
      setPending(null);
    }
  }

  function onDonate() {
    const value = Number.parseFloat(donationEur.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setError(
        tx({
          es: "Ingresá un monto válido en euros.",
          en: "Enter a valid amount in euros.",
        }),
      );
      return;
    }
    const cents = Math.round(value * 100);
    if (cents < MIN_DONATION_CENTS) {
      setError(
        tx({
          es: `El monto mínimo es ${formatEur(MIN_DONATION_CENTS)}.`,
          en: `Minimum amount is ${formatEur(MIN_DONATION_CENTS)}.`,
        }),
      );
      return;
    }
    if (cents > MAX_DONATION_CENTS) {
      setError(
        tx({
          es: `El monto máximo es ${formatEur(MAX_DONATION_CENTS)}.`,
          en: `Maximum amount is ${formatEur(MAX_DONATION_CENTS)}.`,
        }),
      );
      return;
    }
    void startCheckout({ mode: "donation", amountCents: cents });
  }

  return (
    <Dialog
      open={payload != null}
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {tx({
              es: "Llegaste al límite de hoy",
              en: "You've reached today's limit",
            })}
          </DialogTitle>
          <DialogDescription>
            {tx({
              es: `Usaste ${payload.used} de ${payload.limit} consultas con Clara hoy. El contador se reinicia a las ${resetLabel} (00:00 UTC).`,
              en: `You used ${payload.used} of ${payload.limit} Clara queries today. The counter resets at ${resetLabel} (00:00 UTC).`,
            })}
          </DialogDescription>
        </DialogHeader>

        {!showCtas && !idpUrl ? (
          <p className="text-muted-foreground text-sm">
            {tx({
              es: "Volvé mañana y seguimos.",
              en: "Come back tomorrow and we keep going.",
            })}
          </p>
        ) : (
          <div className="space-y-4">
            {idpUrl ? (
              <div className="ring-foreground/10 space-y-2 rounded-xl ring-1 p-3">
                <p className="text-muted-foreground text-sm">
                  {tx({
                    es: "Pasá a Trefolio Pro (€7,99/mes) para 200 consultas diarias en Clara, Will y el panel Warren.",
                    en: "Upgrade to Trefolio Pro (€7.99/mo) for 200 daily queries on Clara, Will, and the Warren dashboard.",
                  })}
                </p>
                <a
                  href={idpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-primary text-primary-foreground ring-offset-background focus-visible:ring-ring inline-flex h-10 w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <ExternalLink className="mr-2 size-4" aria-hidden />
                  {tx({
                    es: "Ver planes en user.trefolio.com",
                    en: "View plans on user.trefolio.com",
                  })}
                </a>
              </div>
            ) : null}

            {showCtas ? (
              <>
                <p className="text-muted-foreground text-sm">
                  {introMulti
                    ? tx({
                        es: "Si Clara te está sirviendo, podés seguir hoy y ayudar a mantenerla viva:",
                        en: "If Clara is helping you, here are ways to keep going today and help keep her alive:",
                      })
                    : tx({
                        es: "Si Clara te está sirviendo, podés dar una mano:",
                        en: "If Clara is helping you, you can chip in:",
                      })}
                </p>

            {showDonation ? (
              <div className="ring-foreground/10 space-y-2 rounded-xl ring-1 p-3">
                <div className="flex items-start gap-2">
                  <Heart className="text-peach mt-0.5 size-4" aria-hidden />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {tx({
                        es: "Donar para mantener Clara",
                        en: "Donate to keep Clara running",
                      })}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {tx({
                        es: "Aporte único, no es reembolsable. Va a infraestructura (servidores + IA).",
                        en: "One-time, non-refundable. Covers infrastructure (servers + AI).",
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor="donation-amount" className="text-xs">
                      {tx({ es: "Monto en EUR", en: "Amount in EUR" })}
                    </Label>
                    <Input
                      id="donation-amount"
                      type="number"
                      min={MIN_DONATION_CENTS / 100}
                      max={MAX_DONATION_CENTS / 100}
                      step="0.01"
                      value={donationEur}
                      onChange={(e) => setDonationEur(e.currentTarget.value)}
                      disabled={pending !== null}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onDonate}
                    disabled={pending !== null}
                  >
                    {pending === "donation" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    {tx({ es: "Donar", en: "Donate" })}
                  </Button>
                </div>
              </div>
            ) : null}
              </>
            ) : null}
          </div>
        )}

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
