"use client";

import { ExternalLink } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
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
  /** Legacy Stripe subscription status (self-host); ignored when unified IdP billing. */
  status: string | null;
  currentPeriodEnd: string | null;
  hasDonated: boolean;
  dailyAgentMessageLimit: number;
  unifiedIdpBilling?: boolean;
  idpUpgradeUrl?: string | null;
  idpPortalUrl?: string | null;
};

/**
 * Subscription card on Settings. With unified IdP billing, all CTAs point to
 * user.trefolio.com (upgrade + Stripe Customer Portal).
 */
export function SubscriptionCard({
  status,
  currentPeriodEnd,
  hasDonated,
  dailyAgentMessageLimit,
  unifiedIdpBilling = false,
  idpUpgradeUrl = null,
  idpPortalUrl = null,
}: SubscriptionCardProps) {
  const tx = useTx();

  const isProCap = dailyAgentMessageLimit >= 200;
  const isActiveLegacy =
    status === "active" || status === "trialing";
  const periodEnd = currentPeriodEnd ? new Date(currentPeriodEnd) : null;

  const showIdpUpgrade =
    unifiedIdpBilling && Boolean(idpUpgradeUrl) && !isProCap;
  const showIdpPortal =
    unifiedIdpBilling &&
    Boolean(idpPortalUrl) &&
    (isProCap || isActiveLegacy || hasDonated);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {tx({ es: "Suscripción", en: "Subscription" })}
        </CardTitle>
        <CardDescription>
          {unifiedIdpBilling
            ? isProCap
              ? tx({
                  es: `Trefolio Pro (ecosistema) · ${dailyAgentMessageLimit} consultas por día con Clara.`,
                  en: `Trefolio Pro (ecosystem) · ${dailyAgentMessageLimit} Clara queries per day.`,
                })
              : tx({
                  es: `Plan gratuito · ${dailyAgentMessageLimit} consultas por día con Clara.`,
                  en: `Free plan · ${dailyAgentMessageLimit} Clara queries per day.`,
                })
            : isActiveLegacy
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
        {unifiedIdpBilling && isActiveLegacy && periodEnd ? (
          <p className="text-muted-foreground text-sm">
            {tx({
              es: `Antes: Supporter local · período hasta ${periodEnd.toLocaleDateString()}.`,
              en: `Previously: local Supporter · period through ${periodEnd.toLocaleDateString()}.`,
            })}
          </p>
        ) : null}
        {!unifiedIdpBilling && isActiveLegacy && periodEnd ? (
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
              es: "Gracias por las donaciones.",
              en: "Thanks for your donations.",
            })}
          </p>
        ) : null}

        {unifiedIdpBilling ? (
          <div className="flex flex-wrap gap-2">
            {showIdpUpgrade ? (
              <a href={idpUpgradeUrl!} className={cn(buttonVariants({ variant: "default" }))}>
                {tx({ es: "Pasá a Trefolio Pro", en: "Upgrade to Trefolio Pro" })}
              </a>
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
                  es: "Gestionar facturación en user.trefolio.com",
                  en: "Manage billing on user.trefolio.com",
                })}
              </a>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
