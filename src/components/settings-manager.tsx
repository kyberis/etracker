"use client";

import { CheckCircle2, Info, Send, XCircle } from "lucide-react";
import { FormEvent, useState } from "react";

import { ApiTokensCard } from "@/components/api-tokens-card";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { PasskeysCard } from "@/components/passkeys-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CurrencyPicker } from "@/components/ui/currency-picker";
import { PasswordInput } from "@/components/ui/password-input";
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

type ApiTokenItem = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type TelegramStatus = {
  linked: boolean;
  username: string | null;
  telegramUserId: string | null;
  verifiedAt: string | null;
  /** Short link code is active until this instant (user opened t.me but has not finished Start). */
  pendingCode: string | null;
  pendingExpiresAt: string | null;
};

type PasskeyItem = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceType: string;
  backedUp: boolean;
};

type SettingsManagerProps = {
  initialUser: UserSettings;
  initialTelegram: TelegramStatus;
  initialApiTokens: ApiTokenItem[];
  initialPasskeys: PasskeyItem[];
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
  initialTelegram,
  initialApiTokens,
  initialPasskeys,
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
                    <PasswordInput
                      id="currentPassword"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      toggleLabel={t.auth.showPassword}
                    />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="newPassword">
                    {hasPassword ? t.settings.newPassword : t.settings.setPassword}
                  </label>
                  <PasswordInput
                    id="newPassword"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    minLength={8}
                    toggleLabel={t.auth.showPassword}
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

          <PasskeysCard initialPasskeys={initialPasskeys} />
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
            es: "Vinculá Telegram y conectá clientes MCP.",
            en: "Link Telegram and connect MCP clients.",
          })}
        />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          <TelegramLinkCard initial={initialTelegram} />
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

/**
 * Telegram link card. Renders in the Integrations section. The user clicks
 * "Conectar Telegram" → we store a short `?start=` code and open
 * `t.me/<bot>?start=<code>` in a new tab. Telegram's `start` limit is 64
 * characters, so we cannot use long signed tokens in the URL.
 */
function TelegramLinkCard({ initial }: { initial: TelegramStatus }) {
  const tx = useTx();
  const [status, setStatus] = useState<TelegramStatus>(initial);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<TelegramStatus | null> {
    const res = await fetch("/api/settings/telegram");
    if (res.ok) {
      const data = (await res.json()) as TelegramStatus;
      setStatus(data);
      return data;
    }
    return null;
  }

  async function startLink() {
    setError(null);
    setFeedback(null);
    setBusy(true);
    try {
      const res = await fetch("/api/settings/telegram", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(
          data.error ??
            tx({
              es: "No se pudo iniciar la vinculación.",
              en: "Could not start the linking.",
            }),
        );
        return;
      }
      const data = (await res.json()) as { url: string };
      // We open in a new tab so the user can come back to settings without
      // losing the in-progress link if Telegram doesn't auto-confirm.
      window.open(data.url, "_blank", "noopener,noreferrer");
      setFeedback(
        tx({
          es: "Abrí Telegram y tocá Iniciar para terminar la vinculación.",
          en: "Open Telegram and tap Start to finish linking.",
        }),
      );
      // Re-poll a few times so the UI updates once the webhook completes.
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const next = await refresh();
        if (next?.linked) break;
      }
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (
      !confirm(
        tx({
          es: "¿Seguro que querés desvincular Telegram?",
          en: "Are you sure you want to unlink Telegram?",
        }),
      )
    )
      return;
    setBusy(true);
    try {
      await fetch("/api/settings/telegram", { method: "DELETE" });
      setFeedback(
        tx({
          es: "Listo, Telegram desvinculado.",
          en: "Done, Telegram unlinked.",
        }),
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const linked = status.linked;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2">
            <Send className="size-4" aria-hidden />
            Telegram
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {tx({
            es: "Chateá con Clara desde Telegram: mandá fotos del banco, dictá gastos por audio o consultá tu mes desde el celular.",
            en: "Chat with Clara from Telegram: send bank screenshots, dictate expenses by voice, or check your month from your phone.",
          })}
        </p>

        {linked ? (
          <div className="space-y-2">
            <p className="text-sm">
              {tx({ es: "Vinculado", en: "Linked" })}
              {status.username ? (
                <span className="text-muted-foreground"> · @{status.username}</span>
              ) : null}
            </p>
            <Button variant="destructive" onClick={unlink} disabled={busy}>
              {tx({ es: "Desvincular", en: "Unlink" })}
            </Button>
          </div>
        ) : (
          <Button onClick={startLink} disabled={busy}>
            {busy
              ? tx({ es: "Generando link…", en: "Generating link…" })
              : tx({ es: "Conectar Telegram", en: "Connect Telegram" })}
          </Button>
        )}

        {error ? <FormStatus tone="error">{error}</FormStatus> : null}
        {feedback ? <FormStatus tone="success">{feedback}</FormStatus> : null}
      </CardContent>
    </Card>
  );
}
