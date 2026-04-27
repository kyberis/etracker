"use client";

import { FormEvent, useState } from "react";

import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { RevolutConnectionCard } from "@/components/revolut-connection-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type UserSettings = {
  email: string;
  expenseImportInstructions: string | null;
  hasPassword: boolean;
  linkedProviders: string[];
};

type WhatsappStatus = {
  phone: string | null;
  verifiedAt: string | null;
  pendingCode: string | null;
  pendingExpiresAt: string | null;
};

type BankOption = { id: string; name: string };

type RevolutInitial =
  | { connected: false }
  | {
      connected: true;
      linked: boolean;
      pending: boolean;
      institutionId: string;
      lastSyncAt: string | null;
      defaultImportBankId: string | null;
    };

type SettingsManagerProps = {
  initialUser: UserSettings;
  initialWhatsapp: WhatsappStatus;
  initialBanks: BankOption[];
  initialRevolut: RevolutInitial;
  googleAuthConfigured: boolean;
};

export function SettingsManager({
  initialUser,
  initialWhatsapp,
  initialBanks,
  initialRevolut,
  googleAuthConfigured,
}: SettingsManagerProps) {
  const [settings, setSettings] = useState<UserSettings | null>(initialUser);
  const [importInstructions, setImportInstructions] = useState(
    initialUser.expenseImportInstructions ?? "",
  );
  const [instructionsMessage, setInstructionsMessage] = useState<string | null>(null);
  const [instructionsError, setInstructionsError] = useState<string | null>(null);
  const [instructionsSaving, setInstructionsSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSettings() {
    const response = await fetch("/api/settings");
    const data = (await response.json()) as { user: UserSettings };
    setSettings(data.user);
    setImportInstructions(data.user.expenseImportInstructions ?? "");
  }

  async function onSaveInstructions(event: FormEvent) {
    event.preventDefault();
    setInstructionsError(null);
    setInstructionsMessage(null);
    setInstructionsSaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expenseImportInstructions: importInstructions.trim() ? importInstructions.trim() : null,
        }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setInstructionsError(data.error ?? "No se pudo guardar.");
        return;
      }
      setInstructionsMessage("Instrucciones guardadas.");
      await loadSettings();
    } finally {
      setInstructionsSaving(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const hasPassword = settings?.hasPassword ?? initialUser.hasPassword;
    const body: Record<string, string | undefined> = {};
    if (newPassword) {
      body.newPassword = newPassword;
      if (hasPassword) {
        body.currentPassword = currentPassword || undefined;
      }
    }

    const response = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

  const hasPassword = settings?.hasPassword ?? initialUser.hasPassword;
  const googleLinked = (settings?.linkedProviders ?? initialUser.linkedProviders).includes(
    "google",
  );

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

            {hasPassword ? (
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="currentPassword">
                  Current password {newPassword ? "(required to change password)" : "(optional)"}
                </label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="newPassword">
                {hasPassword ? "New password" : "Set a password (optional)"}
              </label>
              <Input
                id="newPassword"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
              />
              {!hasPassword ? (
                <p className="text-muted-foreground text-xs">
                  You signed in with Google. Add a password if you also want to sign in with email.
                </p>
              ) : null}
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {message ? <p className="text-sm text-green-600">{message}</p> : null}

            <Button type="submit">Save</Button>
          </form>
        </CardContent>
      </Card>

      {googleAuthConfigured ? (
        <Card>
          <CardHeader>
            <CardTitle>Sign-in methods</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-muted-foreground text-sm">
              Link Google to sign in with one click. Use the same email as this account so we merge
              your profile.
            </p>
            {googleLinked ? (
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Google is connected to this account.
              </p>
            ) : (
              <GoogleSignInButton callbackUrl="/settings" label="Connect Google" />
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Instrucciones para el asistente e importaciones</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSaveInstructions}>
            <p className="text-muted-foreground text-sm">
              Definí reglas en lenguaje natural: qué movimientos <strong>no</strong> importar desde
              Revolut (transferencias entre cuentas, recargas, etc.), cómo categorizar ciertos
              comercios, o convenciones que use el asistente en el chat y con fotos del banco.
            </p>
            <Textarea
              id="expenseImportInstructions"
              value={importInstructions}
              onChange={(e) => setImportInstructions(e.target.value)}
              placeholder='Ej.: No importar transferencias a mi cuenta USD ni movimientos con "Top up". Supermercados siempre ALIMENTACION. Spotify y Netflix → SUSCRIPCIONES.'
              rows={8}
              maxLength={12000}
              className="min-h-[140px] resize-y font-mono text-sm"
            />
            <p className="text-muted-foreground text-xs">
              Máximo 12.000 caracteres. Requiere <code className="text-foreground">OPENAI_API_KEY</code>{" "}
              en el servidor para aplicar reglas al sincronizar Revolut.
            </p>
            {instructionsError ? (
              <p className="text-destructive text-sm">{instructionsError}</p>
            ) : null}
            {instructionsMessage ? (
              <p className="text-green-600 text-sm dark:text-green-400">{instructionsMessage}</p>
            ) : null}
            <Button type="submit" disabled={instructionsSaving}>
              {instructionsSaving ? "Guardando…" : "Guardar instrucciones"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <WhatsappLinkCard initial={initialWhatsapp} />

      <RevolutConnectionCard initialBanks={initialBanks} initialStatus={initialRevolut} />
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
