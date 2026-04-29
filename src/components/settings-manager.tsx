"use client";

import { CheckCircle2, Info, XCircle } from "lucide-react";
import { FormEvent, useState } from "react";

import { ApiTokensCard } from "@/components/api-tokens-card";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { RevolutConnectionCard } from "@/components/revolut-connection-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyPicker } from "@/components/ui/currency-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocale, useT, useTx } from "@/lib/i18n/client";
import { intlLocale } from "@/lib/i18n/format";
import { isLocale, LOCALE_LABELS } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";

type UserSettings = {
  email: string;
  expenseImportInstructions: string | null;
  hasPassword: boolean;
  primaryCurrency: string;
  primaryCurrencyConfirmedAt: string | null;
  locale: string;
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

type ApiTokenItem = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type SettingsManagerProps = {
  initialUser: UserSettings;
  initialWhatsapp: WhatsappStatus;
  initialBanks: BankOption[];
  initialRevolut: RevolutInitial;
  initialApiTokens: ApiTokenItem[];
  googleAuthConfigured: boolean;
};

/** Inline feedback for forms — consistent success/error/info styling. */
function FormStatus({
  tone,
  children,
}: {
  tone: "success" | "error" | "info";
  children: React.ReactNode;
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "error" ? XCircle : Info;
  const cls =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "error"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <p className={cn("flex items-center gap-1.5 text-sm", cls)} role="status">
      <Icon className="size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/**
 * Section heading for settings groups. Visually splits the page into
 * "Perfil & acceso", "Preferencias" and "Integraciones" so the long stack of
 * cards is easier to scan on desktop.
 */
function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
      {description ? (
        <p className="text-muted-foreground text-sm">{description}</p>
      ) : null}
    </div>
  );
}

export function SettingsManager({
  initialUser,
  initialWhatsapp,
  initialBanks,
  initialRevolut,
  initialApiTokens,
  googleAuthConfigured,
}: SettingsManagerProps) {
  const t = useT();
  const tx = useTx();
  const locale = useLocale();
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
  const [currencyDraft, setCurrencyDraft] = useState(initialUser.primaryCurrency);
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencyMessage, setCurrencyMessage] = useState<string | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  async function loadSettings() {
    const response = await fetch("/api/settings");
    const data = (await response.json()) as { user: UserSettings };
    setSettings(data.user);
    setImportInstructions(data.user.expenseImportInstructions ?? "");
    setCurrencyDraft(data.user.primaryCurrency);
  }

  async function onSaveCurrency(event: FormEvent) {
    event.preventDefault();
    setCurrencyError(null);
    setCurrencyMessage(null);
    const next = currencyDraft.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(next)) {
      setCurrencyError(t.settings.currencyInvalid);
      return;
    }
    setCurrencySaving(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryCurrency: next }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setCurrencyError(data.error ?? t.settings.currencyError);
        return;
      }
      setCurrencyMessage(t.settings.currencyUpdated);
      await loadSettings();
    } finally {
      setCurrencySaving(false);
    }
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
          expenseImportInstructions: importInstructions.trim()
            ? importInstructions.trim()
            : null,
        }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setInstructionsError(data.error ?? t.settings.instructionsError);
        return;
      }
      setInstructionsMessage(t.settings.instructionsSaved);
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
      setError(data.error ?? t.settings.cannotSave);
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setMessage(t.settings.saved);
    await loadSettings();
  }

  const hasPassword = settings?.hasPassword ?? initialUser.hasPassword;
  const googleLinked = (settings?.linkedProviders ?? initialUser.linkedProviders).includes(
    "google",
  );

  const formattedCurrencyConfirmedAt = settings?.primaryCurrencyConfirmedAt
    ? new Date(settings.primaryCurrencyConfirmedAt).toLocaleDateString(intlLocale(locale))
    : null;

  const showAccessCard = googleAuthConfigured;

  return (
    <div className="space-y-10">
      {/* SECTION 1 — Perfil & acceso */}
      <section className="space-y-4">
        <SectionHeader
          title={tx({ es: "Perfil y acceso", en: "Profile & access" })}
          description={tx({
            es: "Tus datos de cuenta y formas de iniciar sesión.",
            en: "Your account data and sign-in methods.",
          })}
        />
        <div
          className={cn(
            "grid grid-cols-1 gap-4",
            showAccessCard && "lg:grid-cols-2 lg:gap-6",
          )}
        >
          <Card>
            <CardHeader>
              <CardTitle>{t.settings.profileTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={onSubmit}>
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide">
                    {t.settings.emailLabel}
                  </p>
                  <p className="font-medium">{settings?.email ?? "..."}</p>
                </div>

                {hasPassword ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="currentPassword">
                      {t.settings.currentPassword}{" "}
                      <span className="text-muted-foreground text-xs font-normal">
                        {newPassword
                          ? t.settings.currentPasswordHintRequired
                          : t.settings.currentPasswordHintOptional}
                      </span>
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
                    {hasPassword ? t.settings.newPassword : t.settings.setPassword}
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
                      {t.settings.googleHint}
                    </p>
                  ) : null}
                </div>

                {error ? <FormStatus tone="error">{error}</FormStatus> : null}
                {message ? <FormStatus tone="success">{message}</FormStatus> : null}

                <Button type="submit">{t.settings.save}</Button>
              </form>
            </CardContent>
          </Card>

          {showAccessCard ? (
            <Card>
              <CardHeader>
                <CardTitle>{t.settings.accessTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-muted-foreground text-sm">
                  {t.settings.accessDescription}
                </p>
                {googleLinked ? (
                  <FormStatus tone="success">{t.settings.googleLinked}</FormStatus>
                ) : (
                  <GoogleSignInButton
                    callbackUrl="/settings"
                    label={t.settings.connectGoogle}
                  />
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </section>

      {/* SECTION 2 — Preferencias */}
      <section className="space-y-4">
        <SectionHeader
          title={tx({ es: "Preferencias", en: "Preferences" })}
          description={tx({
            es: "Idioma, moneda principal e instrucciones para el asistente.",
            en: "Language, primary currency and assistant instructions.",
          })}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <LanguageCard />

          <Card>
            <CardHeader>
              <CardTitle>{t.settings.currencyTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" onSubmit={onSaveCurrency}>
                <p className="text-muted-foreground text-sm">
                  {t.settings.currencyDescription}
                </p>
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <label
                      className="text-muted-foreground text-xs"
                      htmlFor="primary-currency"
                    >
                      {t.settings.currencyIsoLabel}
                    </label>
                    <CurrencyPicker
                      id="primary-currency"
                      value={currencyDraft}
                      onChange={setCurrencyDraft}
                      className="w-24"
                    />
                  </div>
                  <Button type="submit" disabled={currencySaving}>
                    {currencySaving ? t.common.saving : t.settings.currencySave}
                  </Button>
                </div>
                {formattedCurrencyConfirmedAt ? (
                  <p className="text-muted-foreground text-xs">
                    {t.settings.currencyConfirmed(formattedCurrencyConfirmedAt)}
                  </p>
                ) : (
                  <p className="text-warn text-xs">
                    {t.settings.currencyNotConfirmed}
                  </p>
                )}
                {currencyError ? (
                  <FormStatus tone="error">{currencyError}</FormStatus>
                ) : null}
                {currencyMessage ? (
                  <FormStatus tone="success">{currencyMessage}</FormStatus>
                ) : null}
              </form>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t.settings.instructionsTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSaveInstructions}>
              <p className="text-muted-foreground text-sm">
                {t.settings.instructionsDescription}
              </p>
              <Textarea
                id="expenseImportInstructions"
                value={importInstructions}
                onChange={(e) => setImportInstructions(e.target.value)}
                placeholder={t.settings.instructionsPlaceholder}
                rows={8}
                maxLength={12000}
                className="min-h-[140px] resize-y font-mono text-sm"
              />
              <p className="text-muted-foreground text-xs">
                {t.settings.instructionsHint}{" "}
                <code className="text-foreground">OPENAI_API_KEY</code>{" "}
                {t.settings.instructionsHintEnvSuffix}
              </p>
              {instructionsError ? (
                <FormStatus tone="error">{instructionsError}</FormStatus>
              ) : null}
              {instructionsMessage ? (
                <FormStatus tone="success">{instructionsMessage}</FormStatus>
              ) : null}
              <Button type="submit" disabled={instructionsSaving}>
                {instructionsSaving ? t.common.saving : t.settings.instructionsSaveBtn}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      {/* SECTION 3 — Integraciones */}
      <section className="space-y-4">
        <SectionHeader
          title={tx({ es: "Integraciones", en: "Integrations" })}
          description={tx({
            es: "Vinculá WhatsApp, tu banco y conectá clientes MCP.",
            en: "Link WhatsApp, your bank and connect MCP clients.",
          })}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <WhatsappLinkCard initial={initialWhatsapp} />
          <RevolutConnectionCard
            initialBanks={initialBanks}
            initialStatus={initialRevolut}
          />
        </div>
        <ApiTokensCard initialTokens={initialApiTokens} />
      </section>
    </div>
  );
}

function LanguageCard() {
  const t = useT();
  const locale = useLocale();
  const activeLabel = isLocale(locale) ? LOCALE_LABELS[locale] : LOCALE_LABELS.es;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.languageTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-muted-foreground text-sm">{t.settings.languageDescription}</p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">{activeLabel}</p>
          <LanguageSwitcher variant="app" />
        </div>
      </CardContent>
    </Card>
  );
}

function WhatsappLinkCard({ initial }: { initial: WhatsappStatus }) {
  const t = useT();
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
        setError(data.error ?? t.settings.whatsappStartError);
        return;
      }
      setFeedback(t.settings.whatsappCodeGenerated);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (!confirm(t.settings.whatsappUnlinkConfirm)) return;
    setBusy(true);
    try {
      await fetch("/api/settings/whatsapp", { method: "DELETE" });
      setFeedback(t.settings.whatsappUnlinkDone);
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
        <CardTitle>{t.settings.whatsappTitle}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">{t.settings.whatsappDescription}</p>

        {linked ? (
          <div className="space-y-2">
            <p className="text-sm">{t.settings.whatsappLinkedTo(status.phone ?? "")}</p>
            <Button variant="destructive" onClick={unlink} disabled={busy}>
              {t.settings.whatsappUnlinkBtn}
            </Button>
          </div>
        ) : (
          <form className="space-y-3" onSubmit={startLink}>
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="whatsappPhone">
                {t.settings.whatsappPhoneLabel}
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
              {t.settings.whatsappGenerateCode}
            </Button>
          </form>
        )}

        {status.pendingCode ? (
          <div className="bg-muted/50 rounded-md border p-3 text-sm">
            <p className="font-medium">
              {t.settings.whatsappPendingTitle(status.pendingCode)}
            </p>
            <p className="text-muted-foreground mt-1">
              {t.settings.whatsappPendingHelp(status.pendingCode)}
            </p>
          </div>
        ) : null}

        {error ? <FormStatus tone="error">{error}</FormStatus> : null}
        {feedback ? <FormStatus tone="success">{feedback}</FormStatus> : null}
      </CardContent>
    </Card>
  );
}
