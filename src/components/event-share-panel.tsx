"use client";

import {
  Check,
  Copy as CopyIcon,
  Crown,
  Link2,
  Smartphone,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTx } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/**
 * "Compartir" panel for event-detail. Renders three pieces:
 *
 *   1. A toolbar button that opens the Compartir dialog (mint + copy
 *      share link). OWNER-only.
 *   2. The active participants list with role pills and a remove
 *      button on each non-OWNER row (also OWNER-only).
 *   3. A settlement preview card — visible to anyone in the event,
 *      shown when participants ≥ 2.
 *
 * The component is intentionally self-contained so the existing
 * `event-detail.tsx` only needs to include `<EventSharePanel ... />`
 * once and pass the data; no other refactor needed.
 */

export type ParticipantPayload = {
  userId: string;
  role: "OWNER" | "GUEST";
  displayName: string;
  joinedAt: string;
  removedAt: string | null;
  telegramLinked: boolean;
  userKind: "REGULAR" | "GUEST";
};

export type SettlementParticipantPayload = {
  userId: string;
  displayName: string;
  paid: number;
  balance: number;
};

export type SettlementTransferPayload = {
  fromUserId: string;
  fromDisplayName: string;
  toUserId: string;
  toDisplayName: string;
  amount: number;
};

export type SettlementPayload = {
  eventId: string;
  currency: string;
  total: number;
  fairShare: number;
  participants: SettlementParticipantPayload[];
  transfers: SettlementTransferPayload[];
};

type Props = {
  eventId: string;
  eventStatus: "OPEN" | "CLOSED";
  isOwner: boolean;
  currentUserId: string;
  participants: ParticipantPayload[];
  settlement: SettlementPayload | null;
  /** Callback to refresh after participant remove or share-link mint. */
  onRefresh: () => void;
};

export function EventSharePanel({
  eventId,
  eventStatus,
  isOwner,
  currentUserId,
  participants,
  settlement,
  onRefresh,
}: Props) {
  const tx = useTx();
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" />
            {tx({ es: "Participantes", en: "Participants" })}
            <span className="text-muted-foreground text-sm font-normal">
              ({participants.length})
            </span>
          </CardTitle>
          {isOwner && eventStatus === "OPEN" ? (
            <Button
              size="sm"
              onClick={() => setShareDialogOpen(true)}
              className="gap-1.5"
            >
              <UserPlus className="size-4" />
              {tx({ es: "Compartir", en: "Share" })}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="divide-border/40 -mx-2 divide-y">
            {participants.map((p) => (
              <ParticipantRow
                key={p.userId}
                participant={p}
                eventId={eventId}
                isOwnerView={isOwner}
                isCurrentUser={p.userId === currentUserId}
                onRemoved={onRefresh}
              />
            ))}
          </ul>
        </CardContent>
      </Card>

      {settlement && settlement.participants.length >= 2 ? (
        <SettlementPreview settlement={settlement} currentUserId={currentUserId} />
      ) : null}

      <ShareLinkDialog
        eventId={eventId}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Participant row
// ---------------------------------------------------------------------------

function ParticipantRow({
  participant,
  eventId,
  isOwnerView,
  isCurrentUser,
  onRemoved,
}: {
  participant: ParticipantPayload;
  eventId: string;
  isOwnerView: boolean;
  isCurrentUser: boolean;
  onRemoved: () => void;
}) {
  const tx = useTx();
  const [pending, setPending] = useState(false);

  async function handleRemove() {
    if (
      !confirm(
        tx({
          es: `¿Quitar a ${participant.displayName} del evento? Las líneas que ya cargó quedan, pero no podrá seguir cargando más.`,
          en: `Remove ${participant.displayName} from the event? The lines they already logged will stay, but they won't be able to log more.`,
        }),
      )
    ) {
      return;
    }
    setPending(true);
    try {
      const res = await fetch(
        `/api/events/${eventId}/participants/${participant.userId}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(
          body.error ??
            tx({
              es: "No se pudo quitar al participante.",
              en: "Couldn't remove the participant.",
            }),
        );
        return;
      }
      onRemoved();
    } finally {
      setPending(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3 px-2 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground truncate text-sm font-medium">
            {participant.displayName}
            {isCurrentUser ? (
              <span className="text-muted-foreground ml-1.5 text-xs">
                · {tx({ es: "vos", en: "you" })}
              </span>
            ) : null}
          </span>
          {participant.role === "OWNER" ? (
            <span className="border-border/60 bg-muted/40 text-muted-foreground inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              <Crown className="size-3" />
              {tx({ es: "Organizador", en: "Owner" })}
            </span>
          ) : null}
          {participant.userKind === "GUEST" ? (
            <span className="border-border/60 bg-muted/40 text-muted-foreground inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
              {tx({ es: "Invitado", en: "Guest" })}
            </span>
          ) : null}
          {participant.telegramLinked ? (
            <span
              title="Telegram"
              className="text-muted-foreground inline-flex items-center"
            >
              <Smartphone className="size-3" />
            </span>
          ) : null}
        </div>
      </div>
      {isOwnerView && participant.role !== "OWNER" ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={tx({ es: "Quitar", en: "Remove" })}
          disabled={pending}
          onClick={handleRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : null}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Settlement preview card
// ---------------------------------------------------------------------------

function SettlementPreview({
  settlement,
  currentUserId,
}: {
  settlement: SettlementPayload;
  currentUserId: string;
}) {
  const tx = useTx();
  const me = settlement.participants.find((p) => p.userId === currentUserId);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          {tx({ es: "Vista previa del reparto", en: "Settlement preview" })}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-muted-foreground text-xs">
          {tx({
            es: "Lo que va a salir cuando cierres el viaje. Se actualiza con cada gasto que cargues.",
            en: "What will be sent when you close the trip. Updates with every expense you log.",
          })}
        </p>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">
            {tx({ es: "Total del viaje", en: "Trip total" })}
          </dt>
          <dd className="text-right font-medium">
            {formatMoney(settlement.total, settlement.currency)}
          </dd>
          <dt className="text-muted-foreground">
            {tx({ es: "Por cabeza", en: "Per person" })}
          </dt>
          <dd className="text-right font-medium">
            {formatMoney(settlement.fairShare, settlement.currency)}
          </dd>
          {me ? (
            <>
              <dt className="text-muted-foreground">
                {tx({ es: "Pagaste", en: "You paid" })}
              </dt>
              <dd className="text-right font-medium">
                {formatMoney(me.paid, settlement.currency)}
              </dd>
              <dt className="text-muted-foreground">
                {tx({ es: "Saldo", en: "Balance" })}
              </dt>
              <dd
                className={cn(
                  "text-right font-medium",
                  me.balance > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : me.balance < 0
                      ? "text-red-600 dark:text-red-400"
                      : "text-muted-foreground",
                )}
              >
                {me.balance > 0 ? "+" : ""}
                {formatMoney(me.balance, settlement.currency)}
              </dd>
            </>
          ) : null}
        </dl>

        {settlement.transfers.length > 0 ? (
          <div className="mt-4 space-y-1.5">
            <p className="text-muted-foreground text-xs uppercase tracking-wide">
              {tx({ es: "Transferencias sugeridas", en: "Suggested transfers" })}
            </p>
            <ul className="space-y-1">
              {settlement.transfers.map((t, i) => {
                const involvesMe =
                  t.fromUserId === currentUserId ||
                  t.toUserId === currentUserId;
                return (
                  <li
                    key={`${t.fromUserId}-${t.toUserId}-${i}`}
                    className={cn(
                      "flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm",
                      involvesMe
                        ? "bg-muted/40 border-border/40 border"
                        : "text-muted-foreground",
                    )}
                  >
                    <span className="truncate">
                      <span className="font-medium">{t.fromDisplayName}</span>
                      <span className="px-1.5">→</span>
                      <span className="font-medium">{t.toDisplayName}</span>
                    </span>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatMoney(t.amount, settlement.currency)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground mt-3 text-xs italic">
            {tx({
              es: "Por ahora no hace falta que nadie le transfiera a nadie. Cargá un gasto para ver el reparto.",
              en: "Nobody needs to transfer anything yet. Log an expense to see the split.",
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatMoney(value: number, currency: string): string {
  // Match the Telegram-side formatter for consistency: a fixed-2 plain
  // string keeps the chat and the dashboard visually aligned.
  return `${currency} ${Math.abs(value).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Share-link dialog
// ---------------------------------------------------------------------------

type ShareToken = {
  id: string;
  url: string;
  expiresAt: string;
  status: "active" | "expired" | "revoked";
  /** Only set on the freshly minted token — the API never returns plaintext otherwise. */
  freshPlaintextUrl?: string;
};

function ShareLinkDialog({
  eventId,
  open,
  onOpenChange,
}: {
  eventId: string;
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const tx = useTx();
  const [tokens, setTokens] = useState<ShareToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [minting, setMinting] = useState(false);
  const [freshUrl, setFreshUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadTokens();
    // Reset transient state when the dialog closes (or `eventId` switches)
    // so the next opening starts clean. Lives in the cleanup function so
    // we don't trip `react-hooks/set-state-in-effect`.
    return () => {
      setFreshUrl(null);
      setCopied(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId]);

  async function loadTokens() {
    setLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/share`);
      if (!res.ok) return;
      const body = (await res.json()) as { tokens: ShareToken[] };
      setTokens(body.tokens);
    } finally {
      setLoading(false);
    }
  }

  async function handleMint() {
    setMinting(true);
    try {
      const res = await fetch(`/api/events/${eventId}/share`, {
        method: "POST",
      });
      if (!res.ok) {
        alert(
          tx({
            es: "No se pudo generar el link.",
            en: "Couldn't generate the link.",
          }),
        );
        return;
      }
      const body = (await res.json()) as {
        tokenId: string;
        token: string;
        url: string;
        expiresAt: string;
      };
      setFreshUrl(body.url);
      setCopied(false);
      await loadTokens();
    } finally {
      setMinting(false);
    }
  }

  async function handleRevoke(tokenId: string) {
    if (
      !confirm(
        tx({
          es: "¿Desactivar este link? Quien lo abra no va a poder unirse.",
          en: "Revoke this link? Anyone who opens it after will not be able to join.",
        }),
      )
    ) {
      return;
    }
    const res = await fetch(`/api/events/${eventId}/share/${tokenId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      alert(
        tx({
          es: "No se pudo desactivar.",
          en: "Couldn't revoke.",
        }),
      );
      return;
    }
    if (freshUrl && tokens.find((t) => t.id === tokenId && t.url === freshUrl)) {
      setFreshUrl(null);
    }
    await loadTokens();
  }

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for browsers/contexts without clipboard access (rare):
      // just leave the input selected so the user can Cmd+C.
      const input = document.getElementById(
        "share-fresh-link",
      ) as HTMLInputElement | null;
      input?.select();
    }
  }

  const activeTokens = tokens.filter((t) => t.status === "active");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4" />
            {tx({ es: "Compartir el viaje", en: "Share this trip" })}
          </DialogTitle>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          {tx({
            es: "Generá un link y mandalo por WhatsApp / mail. Quien lo abra puede sumarse al viaje (con cuenta o como invitado por Telegram).",
            en: "Generate a link and share it via WhatsApp / email. Anyone who opens it can join the trip (with their account or as a Telegram-only guest).",
          })}
        </p>

        {freshUrl ? (
          <div className="border-border/60 bg-muted/30 mt-4 space-y-2 rounded-lg border p-3">
            <p className="text-foreground text-xs font-medium uppercase tracking-wide">
              {tx({ es: "Link nuevo", en: "Fresh link" })}
            </p>
            <div className="flex gap-2">
              <Input
                id="share-fresh-link"
                readOnly
                value={freshUrl}
                onClick={(e) => (e.currentTarget as HTMLInputElement).select()}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={tx({ es: "Copiar", en: "Copy" })}
                onClick={() => handleCopy(freshUrl)}
              >
                {copied ? (
                  <Check className="size-4" />
                ) : (
                  <CopyIcon className="size-4" />
                )}
              </Button>
            </div>
            <p className="text-muted-foreground text-[11px]">
              {tx({
                es: "Copialo ahora — por seguridad no lo vamos a volver a mostrar entero.",
                en: "Copy it now — for security we won't show it in full again.",
              })}
            </p>
            {/* TODO(qr): once `qrcode.react` (or similar) is installable
                in the npm registry available to this repo, render an SVG
                QR of `freshUrl` here so the dialog shows a scannable
                code on the same screen as the copy field. */}
          </div>
        ) : null}

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
              {tx({ es: "Links activos", en: "Active links" })}
              <span className="ml-1.5 normal-case">
                ({activeTokens.length})
              </span>
            </p>
            <Button
              type="button"
              size="sm"
              onClick={handleMint}
              disabled={minting}
              className="gap-1.5"
            >
              <Link2 className="size-4" />
              {minting
                ? "…"
                : tx({ es: "Generar link", en: "Generate link" })}
            </Button>
          </div>
          {loading ? (
            <p className="text-muted-foreground text-sm">…</p>
          ) : activeTokens.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">
              {tx({
                es: "Todavía no hay links activos. Generá uno arriba.",
                en: "No active links yet. Generate one above.",
              })}
            </p>
          ) : (
            <ul className="divide-border/40 divide-y">
              {activeTokens.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 py-2 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground font-mono text-xs">
                      {t.url ? maskUrl(t.url) : "•••"}
                    </p>
                    <p className="text-muted-foreground text-[11px]">
                      {tx({ es: "Expira", en: "Expires" })}{" "}
                      {new Date(t.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={tx({ es: "Desactivar", en: "Revoke" })}
                    onClick={() => handleRevoke(t.id)}
                  >
                    <X className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tx({ es: "Cerrar", en: "Close" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The list endpoint NEVER returns the plaintext token — that was only
 * surfaced once at mint time. So `t.url` is empty for older rows; we
 * show a masked placeholder so the user understands the row exists but
 * the full URL is no longer recoverable (they should mint a new one if
 * they need to reshare).
 */
function maskUrl(url: string): string {
  if (!url) return "";
  if (url.length <= 30) return url;
  return `${url.slice(0, 24)}…${url.slice(-6)}`;
}
