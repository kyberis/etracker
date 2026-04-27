"use client";

import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RevolutStatus =
  | { connected: false }
  | {
      connected: true;
      linked: boolean;
      pending: boolean;
      institutionId: string;
      lastSyncAt: string | null;
      defaultImportBankId: string | null;
    };

type BankOption = { id: string; name: string };

const COUNTRY_OPTIONS = [
  { code: "ES", label: "España" },
  { code: "GB", label: "Reino Unido" },
  { code: "FR", label: "Francia" },
  { code: "DE", label: "Alemania" },
  { code: "PT", label: "Portugal" },
  { code: "IT", label: "Italia" },
  { code: "IE", label: "Irlanda" },
  { code: "NL", label: "Países Bajos" },
  { code: "AT", label: "Austria" },
  { code: "BE", label: "Bélgica" },
] as const;

type RevolutConnectionCardProps = {
  initialBanks: BankOption[];
  initialStatus: RevolutStatus;
};

export function RevolutConnectionCard({ initialBanks, initialStatus }: RevolutConnectionCardProps) {
  const [status, setStatus] = useState<RevolutStatus>(initialStatus);
  const banks = initialBanks;
  const [country, setCountry] = useState<string>("ES");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const linked = status && status.connected && status.linked;

  async function refreshStatus() {
    const res = await fetch("/api/revolut/status");
    if (res.ok) {
      const data = (await res.json()) as RevolutStatus;
      setStatus(data);
    }
  }

  async function onConnect(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    setBusy(true);
    try {
      const instRes = await fetch(
        `/api/revolut/institutions?country=${encodeURIComponent(country)}`,
      );
      if (!instRes.ok) {
        const p = (await instRes.json()) as { error?: string };
        setError(p.error ?? "No se pudo cargar Revolut para ese país.");
        return;
      }
      const instData = (await instRes.json()) as {
        institutions: Array<{ id: string; name: string }>;
      };
      const revolut = instData.institutions[0];
      if (!revolut) {
        setError("No hay Revolut disponible para ese país en GoCardless.");
        return;
      }

      const connectRes = await fetch("/api/revolut/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: revolut.id }),
      });
      if (!connectRes.ok) {
        const p = (await connectRes.json()) as { error?: string };
        setError(p.error ?? "No se pudo iniciar la vinculación.");
        return;
      }
      const payload = (await connectRes.json()) as { link: string };
      window.location.href = payload.link;
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    if (!confirm("¿Desvincular Revolut? Se borrarán también las transacciones ignoradas.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/revolut/disconnect", { method: "DELETE" });
      if (!res.ok) {
        const p = (await res.json()) as { error?: string };
        setError(p.error ?? "No se pudo desvincular.");
        return;
      }
      setFeedback("Revolut desvinculado.");
      setStatus({ connected: false });
    } finally {
      setBusy(false);
    }
  }

  async function onDefaultBankChange(bankId: string) {
    setError(null);
    setFeedback(null);
    const res = await fetch("/api/revolut/connection", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bankId }),
    });
    if (!res.ok) {
      const p = (await res.json()) as { error?: string };
      setError(p.error ?? "No se pudo guardar el banco.");
      return;
    }
    setFeedback("Banco de importación guardado.");
    await refreshStatus();
  }

  const lastSyncLabel = useMemo(() => {
    if (!status || !status.connected) return null;
    if (!status.lastSyncAt) return "Nunca";
    try {
      return new Date(status.lastSyncAt).toLocaleString();
    } catch {
      return status.lastSyncAt;
    }
  }, [status]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revolut (Open Banking)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Conectá tu cuenta Revolut vía GoCardless para sincronizar movimientos con el mes en curso:
          marcar gastos como pagados e importar gastos nuevos. Necesitás credenciales{" "}
          <span className="font-medium">GOCARDLESS_SECRET_ID</span> y{" "}
          <span className="font-medium">GOCARDLESS_SECRET_KEY</span> en el servidor.
        </p>

        {status && !status.connected ? (
          <form className="space-y-3" onSubmit={onConnect}>
            <div className="space-y-2">
              <span className="text-sm font-medium">País del banco Revolut</span>
              <Select
                value={country}
                onValueChange={(v) => setCountry(v ?? "ES")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="País" />
                </SelectTrigger>
                <SelectContent>
                  {COUNTRY_OPTIONS.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Abriendo…" : "Conectar Revolut"}
            </Button>
          </form>
        ) : null}

        {status && status.connected ? (
          <div className="space-y-3 text-sm">
            {status.pending ? (
              <p className="text-amber-700 dark:text-amber-400">
                Vinculación pendiente: abrí el enlace del banco y autorizá el acceso. Luego volvé
                acá o abrí el mes en curso para sincronizar.
              </p>
            ) : (
              <p>
                Estado: <span className="font-medium text-emerald-700 dark:text-emerald-400">Conectado</span>
              </p>
            )}
            <p className="text-muted-foreground">
              Última sincronización: <span className="text-foreground">{lastSyncLabel}</span>
            </p>

            {linked ? (
              <div className="space-y-2">
                <span className="text-sm font-medium">Banco local para importar gastos</span>
                <p className="text-muted-foreground text-xs">
                  Los movimientos importados se asignan a este banco (ej. la “cuenta” Revolut que
                  creaste en eTracker).
                </p>
                <Select
                  value={status.defaultImportBankId ?? ""}
                  onValueChange={(v) => {
                    if (v) void onDefaultBankChange(v);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Elegir banco" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {banks.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    Creá primero un banco en eTracker para poder importar.
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {status.pending ? (
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void refreshStatus()}>
                  Ya autoricé — actualizar estado
                </Button>
              ) : null}
              <Button type="button" variant="destructive" disabled={busy} onClick={onDisconnect}>
                Desvincular
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {feedback ? <p className="text-green-600 text-sm dark:text-green-400">{feedback}</p> : null}
      </CardContent>
    </Card>
  );
}
