"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type UserSettings = {
  email: string;
};

type WhatsappStatus = {
  phone: string | null;
  verifiedAt: string | null;
  pendingCode: string | null;
  pendingExpiresAt: string | null;
};

type SettingsManagerProps = {
  initialUser: UserSettings;
  initialWhatsapp: WhatsappStatus;
};

export function SettingsManager({ initialUser, initialWhatsapp }: SettingsManagerProps) {
  const [settings, setSettings] = useState<UserSettings | null>(initialUser);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSettings() {
    const response = await fetch("/api/settings");
    const data = (await response.json()) as { user: UserSettings };
    setSettings(data.user);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Unable to save settings.");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setMessage("Settings saved.");
    await loadSettings();
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile settings</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">Email</p>
              <p className="font-medium">{settings?.email ?? "..."}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="currentPassword">
                Current password (only needed to change password)
              </label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="newPassword">
                New password
              </label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {message ? <p className="text-sm text-green-600">{message}</p> : null}

            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      <WhatsappLinkCard initial={initialWhatsapp} />
    </div>
  );
}

function WhatsappLinkCard({ initial }: { initial: WhatsappStatus }) {
  const [status, setStatus] = useState<WhatsappStatus>(initial);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/settings/whatsapp");
    if (res.ok) {
      const data = (await res.json()) as WhatsappStatus;
      setStatus(data);
    }
  }

  async function startLink(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setFeedback(null);
    setBusy(true);
    try {
      const res = await fetch("/api/settings/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "No se pudo iniciar la vinculación.");
        return;
      }
      setFeedback(
        "Te generamos un código. Mandalo por WhatsApp al asistente para terminar la vinculación.",
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!confirm("¿Desvincular el número de WhatsApp?")) return;
    setBusy(true);
    try {
      await fetch("/api/settings/whatsapp", { method: "DELETE" });
      setFeedback("Número desvinculado.");
      setPhone("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const linked = Boolean(status.phone && status.verifiedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp Assistant</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          Vinculá tu número para usar el asistente de eTracker en WhatsApp:
          consultá tu mes, agregá gastos y mandá fotos de movimientos para que
          los registremos automáticamente.
        </p>

        {linked ? (
          <div className="space-y-2">
            <p className="text-sm">
              Vinculado a <span className="font-medium">{status.phone}</span>
            </p>
            <Button variant="destructive" onClick={unlink} disabled={busy}>
              Desvincular
            </Button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={startLink}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="whatsappPhone">
                Número de WhatsApp (formato internacional, p. ej. +5491112345678)
              </label>
              <Input
                id="whatsappPhone"
                type="tel"
                placeholder="+5491112345678"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                required
              />
            </div>
            <Button type="submit" disabled={busy}>
              Generar código
            </Button>
          </form>
        )}

        {status.pendingCode ? (
          <div className="bg-muted/50 rounded-md border p-3 text-sm">
            <p className="font-medium">Tu código: {status.pendingCode}</p>
            <p className="text-muted-foreground mt-1">
              Abrí WhatsApp y mandale al asistente:{" "}
              <span className="font-mono">LINK {status.pendingCode}</span>. El
              código expira en unos minutos.
            </p>
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {feedback ? <p className="text-sm text-green-600">{feedback}</p> : null}
      </CardContent>
    </Card>
  );
}
