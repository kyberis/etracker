"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useTx } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type SubscriptionCardProps = {
  /** "active" | "trialing" | "past_due" | "canceled" | null */
  status: string | null;
  /** ISO. End of the current billing period. */
  currentPeriodEnd: string | null;
  /** True for users who have at least one Donation row. */
  hasDonated: boolean;
  /** True only when STRIPE_* envs and the `quota_upsell` flag are both on. */
  upsellActive: boolean;
  /** True once a Stripe customer exists (so the Billing Portal is reachable). */
  hasStripeCustomer: boolean;
  /** Daily message cap currently applied to this user. */
  dailyAgentMessageLimit: number;
  /** Hosted Trefolio Pro billing on user.trefolio.com (unified IdP). */
  unifiedIdpBilling?: boolean;
  idpUpgradeUrl?: string | null;
  idpPortalUrl?: string | null;
};

/**
 * Suscripción card on Settings. Renders one of three states:
 *  - upsell off entirely → no card (parent should not render this).
 *  - active subscription / past donor → show status + Billing Portal CTA.
 *  - free user → "Subir a Supporter" CTA pointing at /api/billing/checkout.
 */
export function SubscriptionCard({
  status,
  currentPeriodEnd,
  hasDonated,
  upsellActive,
  hasStripeCustomer,
  dailyAgentMessageLimit,
  unifiedIdpBilling = false,
  idpUpgradeUrl = null,
  idpPortalUrl = null,
}: SubscriptionCardProps) {
  const tx = useTx();
  const [pending, setPending] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isActive = status === "active" || status === "trialing";
  const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;

  async function openPortal() {
    setError(null);
    setPending("portal");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
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
              es: "No pude abrir el portal de pagos.",
              en: "Could not open the billing portal.",
            }),
        );
        setPending(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(
        tx({
          es: "No pude abrir el portal de pagos.",
          en: "Could not open the billing portal.",
        }),
      );
      setPending(null);
    }
  }

  async function startSubscription() {
    setError(null);
    setPending("checkout");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "subscription" }),
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
              es: "No pude abrir el pago.",
              en: "Could not open checkout.",
            }),
        );
        setPending(null);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError(
        tx({
          es: "No pude abrir el pago.",
          en: "Could not open checkout.",
        }),
      );
      setPending(null);
    }
  }

  const isProCap = dailyAgentMessageLimit >= 200;
  const showIdpUpgrade =
    unifiedIdpBilling && Boolean(idpUpgradeUrl) && !isActive && !isProCap;
  const showIdpPortal =
    unifiedIdpBilling &&
    Boolean(idpPortalUrl) &&
    (isActive || hasStripeCustomer || isProCap);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {tx({ es: "Suscripción", en: "Subscription" })}
        </CardTitle>
        <CardDescription>
          {isActive
            ? tx({
                es: `Plan Supporter activo · ${dailyAgentMessageLimit} consultas por día con Clara.`,
                en: `Supporter plan active · ${dailyAgentMessageLimit} Clara queries per day.`,
              })
            : tx({
                es: `Plan gratuito · ${dailyAgentMessageLimit} consultas por día con Clara.`,
                en: `Free plan · ${dailyAgentMessageLimit} Clara queries per day.`,
              })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isActive && periodEnd ? (
          <p className="text-muted-foreground text-sm">
            {tx({
              es: `Se renueva el ${periodEnd.toLocaleDateString()}.`,
              en: `Renews on ${periodEnd.toLocaleDateString()}.`,
            })}
          </p>
        ) : null}
        {hasDonated ? (
          <p className="text-muted-foreground text-sm">
            {tx({
              es: "Gracias por las donaciones — se ven en el portal de pagos.",
              en: "Thanks for the donations — visible in the billing portal.",
            })}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {showIdpUpgrade ? (
            <a href={idpUpgradeUrl!} className={cn(buttonVariants({ variant: "default" }))}>
              {tx({ es: "Pasá a Trefolio Pro", en: "Upgrade to Trefolio Pro" })}
            </a>
          ) : null}

          {upsellActive && !isActive ? (
            <Button
              type="button"
              onClick={startSubscription}
              disabled={pending !== null}
            >
              {pending === "checkout" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              {tx({ es: "Subir a Supporter", en: "Upgrade to Supporter" })}
            </Button>
          ) : null}

          {showIdpPortal ? (
            <a
              href={idpPortalUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }), "inline-flex gap-1.5")}
            >
              <ExternalLink className="size-4" aria-hidden />
              {tx({
                es: "Gestionar facturación (cuenta trefolio)",
                en: "Manage billing (trefolio account)",
              })}
            </a>
          ) : hasStripeCustomer ? (
            <Button
              type="button"
              variant="outline"
              onClick={openPortal}
              disabled={pending !== null}
            >
              {pending === "portal" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : null}
              <ExternalLink className="size-4" aria-hidden />
              {tx({ es: "Gestionar pagos", en: "Manage billing" })}
            </Button>
          ) : null}
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
