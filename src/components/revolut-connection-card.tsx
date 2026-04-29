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
import { pick, useLocale, useTx } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/i18n/format";

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

type RevolutConnectionCardProps = {
  initialBanks: BankOption[];
  initialStatus: RevolutStatus;
};

export function RevolutConnectionCard({ initialBanks, initialStatus }: RevolutConnectionCardProps) {
  const locale = useLocale();
  const tr = useTx();
  const countryOptions = useMemo(
    () => [
      { code: "ES", label: pick(locale, { es: "España", en: "Spain" }) },
      { code: "GB", label: pick(locale, { es: "Reino Unido", en: "United Kingdom" }) },
      { code: "FR", label: pick(locale, { es: "Francia", en: "France" }) },
      { code: "DE", label: pick(locale, { es: "Alemania", en: "Germany" }) },
      { code: "PT", label: pick(locale, { es: "Portugal", en: "Portugal" }) },
      { code: "IT", label: pick(locale, { es: "Italia", en: "Italy" }) },
      { code: "IE", label: pick(locale, { es: "Irlanda", en: "Ireland" }) },
      { code: "NL", label: pick(locale, { es: "Países Bajos", en: "Netherlands" }) },
      { code: "AT", label: pick(locale, { es: "Austria", en: "Austria" }) },
      { code: "BE", label: pick(locale, { es: "Bélgica", en: "Belgium" }) },
    ],
    [locale],
  );

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
        setError(p.error ?? tr({ es: "No se pudo cargar Revolut para ese país.", en: "Could not load Revolut for that country." }));
        return;
      }
      const instData = (await instRes.json()) as {
        institutions: Array<{ id: string; name: string }>;
      };
      const revolut = instData.institutions[0];
      if (!revolut) {
        setError(tr({ es: "No hay Revolut disponible para ese país.", en: "Revolut is not available for that country." }));
        return;
      }

      const connectRes = await fetch("/api/revolut/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ institutionId: revolut.id }),
      });
      if (!connectRes.ok) {
        const p = (await connectRes.json()) as { error?: string };
        setError(p.error ?? tr({ es: "No se pudo iniciar la vinculación.", en: "Could not start linking." }));
        return;
      }
      const payload = (await connectRes.json()) as { link: string };
      window.location.href = payload.link;
    } finally {
      setBusy(false);
    }
  }

  async function onDisconnect() {
    if (
      !confirm(
        tr({
          es: "¿Desvincular Revolut? Se borrarán también las transacciones ignoradas.",
          en: "Disconnect Revolut? Ignored transactions will be cleared too.",
        }),
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/revolut/disconnect", { method: "DELETE" });
      if (!res.ok) {
        const p = (await res.json()) as { error?: string };
        setError(p.error ?? tr({ es: "No se pudo desvincular.", en: "Could not disconnect." }));
        return;
      }
      setFeedback(tr({ es: "Revolut desvinculado.", en: "Revolut disconnected." }));
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
      setError(p.error ?? tr({ es: "No se pudo guardar el banco.", en: "Could not save bank." }));
      return;
    }
    setFeedback(tr({ es: "Banco de importación guardado.", en: "Import bank saved." }));
    await refreshStatus();
  }

  const lastSyncLabel = useMemo(() => {
    if (!status || !status.connected) return null;
    if (!status.lastSyncAt) return tr({ es: "Nunca", en: "Never" });
    try {
      return new Date(status.lastSyncAt).toLocaleString(intlLocale(locale));
    } catch {
      return status.lastSyncAt;
    }
  }, [status, locale]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revolut (Open Banking)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {tr({
            es: (
              <>
                Conectá tu cuenta Revolut vía Open Banking para sincronizar movimientos con el mes en
                curso: marcar gastos como pagados e importar gastos nuevos. La conexión es de{" "}
                <span className="font-medium">solo lectura</span> — Clara nunca tiene acceso a tu
                dinero.
              </>
            ),
            en: (
              <>
                Connect your Revolut account via Open Banking to sync transactions with the current
                month: mark expenses paid and import new ones. The link is{" "}
                <span className="font-medium">read-only</span> — Clara never has access to your money.
              </>
            ),
          })}
        </p>

        {status && !status.connected ? (
          <form className="space-y-3" onSubmit={onConnect}>
            <div className="space-y-2">
              <span className="text-sm font-medium">
                {tr({ es: "País del banco Revolut", en: "Revolut bank country" })}
              </span>
              <Select
                value={country}
                onValueChange={(v) => setCountry(v ?? "ES")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tr({ es: "País", en: "Country" })} />
                </SelectTrigger>
                <SelectContent>
                  {countryOptions.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.label} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? tr({ es: "Abriendo…", en: "Opening…" }) : tr({ es: "Conectar Revolut", en: "Connect Revolut" })}
            </Button>
          </form>
        ) : null}

        {status && status.connected ? (
          <div className="space-y-3 text-sm">
            {status.pending ? (
              <p className="text-warn">
                {tr({
                  es: "Vinculación pendiente: abrí el enlace del banco y autorizá el acceso. Luego volvé acá o abrí el mes en curso para sincronizar.",
                  en: "Link pending: open the bank link and authorize access. Then return here or open the current month to sync.",
                })}
              </p>
            ) : (
              <p>
                {tr({ es: "Estado:", en: "Status:" })}{" "}
                <span className="text-good font-bold">
                  {tr({ es: "Conectado", en: "Connected" })}
                </span>
              </p>
            )}
            <p className="text-muted-foreground">
              {tr({ es: "Última sincronización:", en: "Last sync:" })}{" "}
              <span className="text-foreground">{lastSyncLabel}</span>
            </p>

            {linked ? (
              <div className="space-y-2">
                <span className="text-sm font-medium">
                  {tr({ es: "Banco local para importar gastos", en: "Local bank for imports" })}
                </span>
                <p className="text-muted-foreground text-xs">
                  {tr({
                    es: "Los movimientos importados se asignan a este banco (ej. la “cuenta” Revolut que creaste en Clara).",
                    en: 'Imported movements are assigned to this bank (e.g. the Revolut “account” you created in Clara).',
                  })}
                </p>
                <Select
                  value={status.defaultImportBankId ?? ""}
                  onValueChange={(v) => {
                    if (v) void onDefaultBankChange(v);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tr({ es: "Elegir banco", en: "Choose bank" })} />
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
                    {tr({
                      es: "Creá primero un banco en Clara para poder importar.",
                      en: "Create a bank in Clara first to import.",
                    })}
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {status.pending ? (
                <Button type="button" variant="secondary" disabled={busy} onClick={() => void refreshStatus()}>
                  {tr({
                    es: "Ya autoricé — actualizar estado",
                    en: "I authorized — refresh status",
                  })}
                </Button>
              ) : null}
              <Button type="button" variant="destructive" disabled={busy} onClick={onDisconnect}>
                {tr({ es: "Desvincular", en: "Disconnect" })}
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
