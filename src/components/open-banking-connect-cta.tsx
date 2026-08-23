"use client";

import { Landmark } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  OPEN_BANKING_SETTINGS_HREF,
  type OpenBankingCtaKind,
} from "@/lib/enable-banking/cta";
import { useT } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export function OpenBankingConnectCta({
  kind,
  variant = "card",
  onNavigate,
}: {
  kind: OpenBankingCtaKind;
  variant?: "card" | "menu";
  onNavigate?: () => void;
}) {
  const t = useT();
  const copy = t.openBankingCta;
  const title = kind === "reauth" ? copy.reauthTitle : copy.connectTitle;
  const body = kind === "reauth" ? copy.reauthBody : copy.connectBody;
  const action = kind === "reauth" ? copy.reauthAction : copy.connectAction;

  if (variant === "menu") {
    return (
      <Link
        href={OPEN_BANKING_SETTINGS_HREF}
        data-testid="open-banking-cta-menu"
        onClick={onNavigate}
        className="from-peach/30 via-card to-lime/15 ring-peach/40 hover:ring-peach/60 mb-2 flex w-full items-start gap-3 rounded-2xl bg-gradient-to-br px-3 py-3.5 text-left shadow-sm ring-1 transition-[box-shadow,transform] hover:scale-[1.01]"
      >
        <span className="bg-peach/40 text-foreground flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Landmark className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-foreground text-sm font-bold">{title}</span>
            {kind === "connect" ? (
              <span className="bg-peach/30 text-foreground rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                {copy.badge}
              </span>
            ) : null}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-xs leading-snug">
            {body}
          </span>
        </span>
      </Link>
    );
  }

  return (
    <div
      data-testid="open-banking-cta"
      className={cn(
        "from-peach/20 via-card to-lime/10 ring-peach/30 w-full rounded-3xl bg-gradient-to-br p-4 text-left shadow-sm ring-1",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="bg-peach/40 text-foreground flex size-10 shrink-0 items-center justify-center rounded-2xl">
          <Landmark className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <p className="text-sm font-bold">{title}</p>
            <p className="text-muted-foreground text-xs leading-snug">{body}</p>
          </div>
          <Button size="sm" render={<Link href={OPEN_BANKING_SETTINGS_HREF} />}>
            {action}
          </Button>
        </div>
      </div>
    </div>
  );
}
