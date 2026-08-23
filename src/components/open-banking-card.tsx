"use client";

import { Landmark } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { PublicBankConnection } from "@/lib/bank-sync/public-connection";
import { useT, useTx } from "@/lib/i18n/client";

type Aspsp = { name: string; country: string };

const CALLBACK_FLAGS = [
  "connected",
  "denied",
  "empty",
  "failed",
  "invalid",
  "unavailable",
] as const;

type CallbackFlag = (typeof CALLBACK_FLAGS)[number];

function isCallbackFlag(value: string): value is CallbackFlag {
  return (CALLBACK_FLAGS as readonly string[]).includes(value);
}

export function OpenBankingCard({
  enabled,
  initialConnections,
  callbackFlag = null,
}: {
  enabled: boolean;
  initialConnections: PublicBankConnection[];
  callbackFlag?: string | null;
}) {
  const t = useT();
  const tx = useTx();
  const [connections, setConnections] = useState(initialConnections);
  const [country, setCountry] = useState("ES");
  const [aspsps, setAspsps] = useState<Aspsp[]>([]);
  const [institution, setInstitution] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const callbackNotice =
    callbackFlag && isCallbackFlag(callbackFlag)
      ? t.openBanking.callback[callbackFlag]
      : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#open-banking") return;
    document.getElementById("open-banking")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  if (!enabled) return null;

  const expiring = connections.some((connection) => connection.expiresSoon);

  async function refresh() {
    const res = await fetch("/api/open-banking/connections");
    if (!res.ok) return;
    const data = (await res.json()) as { connections: PublicBankConnection[] };
    setConnections(data.connections);
  }

  async function loadAspsps(nextCountry: string) {
    const res = await fetch(
      `/api/open-banking/aspsps?country=${encodeURIComponent(nextCountry)}`,
    );
    if (!res.ok) {
      setAspsps([]);
      setInstitution("");
      return;
    }
    const data = (await res.json()) as { aspsps: Aspsp[] };
    setAspsps(data.aspsps);
    setInstitution(data.aspsps[0]?.name ?? "");
  }

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/open-banking/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionName: institution, country }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(
          data.error ??
            tx({ es: "No pude arrancar la conexión.", en: "Could not start the connection." }),
        );
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy(false);
    }
  }

  async function sync(connectionId?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/open-banking/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(connectionId ? { connectionId } : {}),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? tx({ es: "Falló la sync.", en: "Sync failed." }));
        return;
      }
      setNotice(tx({ es: "Sincronicé los movimientos.", en: "Movements synced." }));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(id: string) {
    if (
      !window.confirm(
        tx({
          es: "¿Desconectar este banco? Los movimientos ya importados se quedan.",
          en: "Disconnect this bank? Already imported movements stay.",
        }),
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/open-banking/connections/${id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="open-banking">
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Landmark className="size-4" aria-hidden />
            {tx({ es: "Open Banking", en: "Open Banking" })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {tx({
            es: "Conectá tu banco europeo. Clara trae cuentas, saldos y movimientos sola. Es de solo lectura: nunca mueve plata.",
            en: "Connect your European bank. Clara pulls accounts, balances and movements on her own. Read-only: she never moves money.",
          })}
        </p>

        {callbackNotice ? (
          <p className="text-sm" role="status">
            {callbackNotice}
          </p>
        ) : null}
        {expiring ? (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {tx({
              es: "Hay un consentimiento que vence en menos de 7 días. Reconectá para no perder la sync.",
              en: "A consent expires in less than 7 days. Reconnect so sync does not stop.",
            })}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ob-country">
              {tx({ es: "País", en: "Country" })}
            </Label>
            <input
              id="ob-country"
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              value={country}
              maxLength={2}
              onChange={(event) => {
                const next = event.target.value.toUpperCase();
                setCountry(next);
                if (next.length === 2) void loadAspsps(next);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-bank">{tx({ es: "Banco", en: "Bank" })}</Label>
            <select
              id="ob-bank"
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
              value={institution}
              onFocus={() => {
                if (aspsps.length === 0 && country.length === 2) void loadAspsps(country);
              }}
              onChange={(event) => setInstitution(event.target.value)}
            >
              {aspsps.length === 0 ? (
                <option value="">
                  {tx({
                    es: "Tocá para listar bancos de este país",
                    en: "Open to list banks for this country",
                  })}
                </option>
              ) : (
                aspsps.map((aspsp) => (
                  <option key={`${aspsp.country}-${aspsp.name}`} value={aspsp.name}>
                    {aspsp.name}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <Button onClick={() => void connect()} disabled={busy || !institution}>
          {busy
            ? tx({ es: "Abriendo el banco…", en: "Opening the bank…" })
            : tx({ es: "Conectar banco", en: "Connect bank" })}
        </Button>

        <div className="space-y-3">
          {connections.map((connection) => (
            <div key={connection.id} className="rounded-md border p-3 space-y-2">
              <p className="text-sm font-medium">
                {connection.institutionName}{" "}
                <span className="text-muted-foreground">
                  · {connection.institutionCountry}
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                {connection.status}
                {connection.validUntil
                  ? ` · ${tx({ es: "vence", en: "expires" })} ${connection.validUntil.slice(0, 10)}`
                  : ""}
                {connection.lastSyncAt
                  ? ` · ${tx({ es: "última sync", en: "last sync" })} ${connection.lastSyncAt.slice(0, 16).replace("T", " ")}`
                  : ""}
              </p>
              {connection.lastSyncError ? (
                <p className="text-destructive text-xs">{connection.lastSyncError}</p>
              ) : null}
              <ul className="text-muted-foreground text-xs">
                {connection.accounts.map((account) => (
                  <li key={account.id}>
                    {account.bankName ?? account.name ?? account.currency}{" "}
                    {account.ibanMasked ? `· ${account.ibanMasked}` : ""}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void sync(connection.id)}
                >
                  {tx({ es: "Sincronizar ahora", en: "Sync now" })}
                </Button>
                {connection.status === "NEEDS_REAUTH" ? (
                  <Button size="sm" disabled={busy} onClick={() => void connect()}>
                    {tx({ es: "Reconectar", en: "Reconnect" })}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void disconnect(connection.id)}
                >
                  {tx({ es: "Desconectar", en: "Disconnect" })}
                </Button>
              </div>
            </div>
          ))}
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {notice ? <p className="text-sm">{notice}</p> : null}
      </CardContent>
    </Card>
  );
}
