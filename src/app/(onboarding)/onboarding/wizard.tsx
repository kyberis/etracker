"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyPicker } from "@/components/ui/currency-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { pick, useLocale } from "@/lib/i18n/client";
import {
  COUNTRY_OPTIONS,
  type CountryOption,
  currencyForCountry,
  getCountryOption,
} from "@/lib/i18n/country-currency";
import type { Locale } from "@/lib/i18n/locale";
import { cn } from "@/lib/utils";
import { type UsageReason, usageReasonValues } from "@/lib/validators";

export type OnboardingInitial = {
  name: string | null;
  country: string | null;
  usageReasons: string[];
  primaryCurrency: string;
  primaryCurrencyConfirmedAt: string | null;
};

type Step = 0 | 1 | 2 | 3 | 4;
const TOTAL_STEPS = 5;

const REASON_LABELS: Record<UsageReason, { label: Record<Locale, string>; emoji: string }> = {
  personal: { label: { es: "Personal", en: "Personal" }, emoji: "🧍" },
  couple_family: { label: { es: "Pareja / Familia", en: "Couple / Family" }, emoji: "👫" },
  freelance: { label: { es: "Freelance", en: "Freelance" }, emoji: "💼" },
  business: { label: { es: "Negocio", en: "Business" }, emoji: "🏢" },
  other: { label: { es: "Otro", en: "Other" }, emoji: "✨" },
};

type OnboardingPatchBody = {
  name?: string;
  usageReasons?: UsageReason[];
  country?: string;
  primaryCurrency?: string;
  complete?: boolean;
};

export function OnboardingWizard({ initial }: { initial: OnboardingInitial }) {
  const router = useRouter();
  const locale = useLocale();
  const [step, setStep] = useState<Step>(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 2 state
  const [name, setName] = useState(initial.name ?? "");
  const [reasons, setReasons] = useState<Set<UsageReason>>(
    () => new Set(initial.usageReasons.filter(isUsageReason)),
  );

  // Step 3 state
  const [country, setCountry] = useState<string | null>(initial.country);
  const [currency, setCurrency] = useState<string>(initial.primaryCurrency);

  async function patchOnboarding(body: OnboardingPatchBody) {
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? pick(locale, { es: "No se pudo guardar.", en: "Could not save." }));
        return false;
      }
      return true;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : pick(locale, { es: "No se pudo guardar.", en: "Could not save." }),
      );
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  function goNext() {
    setStep((s) => (Math.min(TOTAL_STEPS - 1, s + 1) as Step));
  }
  function goBack() {
    setStep((s) => (Math.max(0, s - 1) as Step));
  }

  async function finish() {
    const ok = await patchOnboarding({ complete: true });
    if (ok) {
      router.push("/app");
      router.refresh();
    }
  }

  async function skipAll() {
    await finish();
  }

  // Step 2 commit
  async function commitStep2() {
    const trimmed = name.trim();
    const body: OnboardingPatchBody = {};
    if (trimmed) body.name = trimmed;
    body.usageReasons = Array.from(reasons);
    if (!body.name && body.usageReasons.length === 0) {
      // Nothing to save, just advance.
      goNext();
      return;
    }
    const ok = await patchOnboarding(body);
    if (ok) goNext();
  }

  // Step 3 commit
  async function commitStep3() {
    const body: OnboardingPatchBody = {};
    if (country) body.country = country;
    const next = currency.trim().toUpperCase();
    if (/^[A-Z]{3}$/.test(next) && next !== initial.primaryCurrency) {
      body.primaryCurrency = next;
    }
    if (!body.country && !body.primaryCurrency) {
      goNext();
      return;
    }
    const ok = await patchOnboarding(body);
    if (ok) goNext();
  }

  return (
    <div className="w-full max-w-xl">
      <ProgressDots step={step} locale={locale} />

      {error ? (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Card className="mt-6 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          {step === 0 ? (
            <StepWelcome
              locale={locale}
              onContinue={goNext}
              onSkipAll={skipAll}
              disabled={submitting}
            />
          ) : null}
          {step === 1 ? (
            <StepIdentity
              locale={locale}
              name={name}
              setName={setName}
              reasons={reasons}
              setReasons={setReasons}
              onBack={goBack}
              onSkip={skipAll}
              onContinue={commitStep2}
              disabled={submitting}
            />
          ) : null}
          {step === 2 ? (
            <StepCountryCurrency
              locale={locale}
              country={country}
              setCountry={setCountry}
              currency={currency}
              setCurrency={setCurrency}
              onBack={goBack}
              onSkip={skipAll}
              onContinue={commitStep3}
              disabled={submitting}
            />
          ) : null}
          {step === 3 ? (
            <StepTelegram
              locale={locale}
              onBack={goBack}
              onSkip={skipAll}
              onContinue={goNext}
              disabled={submitting}
            />
          ) : null}
          {step === 4 ? (
            <StepDone
              locale={locale}
              name={name.trim() || initial.name}
              currency={currency || initial.primaryCurrency}
              onFinish={finish}
              disabled={submitting}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ProgressDots({ step, locale }: { step: Step; locale: Locale }) {
  const stepLabel = pick(locale, {
    es: `Paso ${step + 1} de ${TOTAL_STEPS}`,
    en: `Step ${step + 1} of ${TOTAL_STEPS}`,
  });
  return (
    <div className="flex items-center gap-1.5" aria-label={stepLabel}>
      {Array.from({ length: TOTAL_STEPS }).map((_, idx) => {
        const state = idx < step ? "done" : idx === step ? "active" : "pending";
        return (
          <span
            key={idx}
            aria-hidden
            className={cn(
              "h-1 rounded-full transition-all",
              state === "pending" && "w-5 bg-muted",
              state === "done" && "w-5 bg-primary",
              state === "active" && "w-9 bg-gradient-to-r from-primary to-primary/60",
            )}
          />
        );
      })}
      <span className="ml-2 text-xs text-muted-foreground">{stepLabel}</span>
    </div>
  );
}

function StepHeader({
  index,
  title,
  description,
  locale,
}: {
  index: number;
  title: string;
  description?: string;
  locale: Locale;
}) {
  const stepLabel = pick(locale, {
    es: `Paso ${index} de ${TOTAL_STEPS}`,
    en: `Step ${index} of ${TOTAL_STEPS}`,
  });
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
        {stepLabel}
      </p>
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {description ? (
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      ) : null}
    </div>
  );
}

function StepFooter({
  locale,
  onBack,
  onSkip,
  onContinue,
  continueLabel,
  skipLabel,
  disabled,
  hint,
}: {
  locale: Locale;
  onBack?: () => void;
  onSkip: () => void;
  onContinue: () => void;
  continueLabel?: string;
  skipLabel?: string;
  disabled?: boolean;
  hint?: string;
}) {
  const back = pick(locale, { es: "← Atrás", en: "← Back" });
  const skip = skipLabel ?? pick(locale, { es: "Saltar", en: "Skip" });
  const cont = continueLabel ?? pick(locale, { es: "Continuar", en: "Continue" });
  return (
    <div className="border-border/60 mt-8 flex items-center justify-between border-t pt-5">
      <div className="flex items-center gap-2">
        {onBack ? (
          <Button variant="ghost" size="sm" onClick={onBack} disabled={disabled}>
            {back}
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onSkip} disabled={disabled}>
          {skip}
        </Button>
      </div>
      <div className="flex items-center gap-3">
        {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
        <Button onClick={onContinue} disabled={disabled} size="lg">
          {cont} →
        </Button>
      </div>
    </div>
  );
}

function StepWelcome({
  locale,
  onContinue,
  onSkipAll,
  disabled,
}: {
  locale: Locale;
  onContinue: () => void;
  onSkipAll: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-6">
      <StepHeader
        locale={locale}
        index={1}
        title={pick(locale, { es: "¡Hola! Soy Clara.", en: "Hi! I'm Clara." })}
        description={pick(locale, {
          es: "Tu asistente financiera. Te ayudo a planificar gastos fijos y puntuales, ver en qué se te va la plata y cuánto te sobra al cierre del mes.",
          en: "Your financial assistant. I help you plan recurring and one-off expenses, see where your money goes and how much is left at month end.",
        })}
      />

      <div className="grid gap-3">
        <FeatureRow
          emoji="🗓️"
          title={pick(locale, { es: "Mes a mes", en: "Month by month" })}
          description={pick(locale, {
            es: "Cargás tus gastos fijos una vez y los copiamos cada mes nuevo.",
            en: "Set up your recurring expenses once and we copy them into every new month.",
          })}
        />
        <FeatureRow
          emoji="💬"
          title={pick(locale, { es: "Chateá conmigo", en: "Chat with me" })}
          description={pick(locale, {
            es: "Mandame fotos del banco, CSV de tu home banking o describime gastos en lenguaje natural. Si vinculás Telegram, también desde ahí.",
            en: "Send me bank screenshots, CSVs from your home banking or describe expenses in plain language. If you link Telegram, also from there.",
          })}
        />
        <FeatureRow
          emoji="🌎"
          title={pick(locale, { es: "Multi-moneda, sin sermones", en: "Multi-currency, no lectures" })}
          description={pick(locale, {
            es: "Cargá gastos en cualquier moneda; los convierto al toque a tu moneda principal usando el tipo de cambio del momento.",
            en: "Log expenses in any currency; I convert them on the fly to your primary currency using the exchange rate at the time.",
          })}
        />
      </div>

      <div className="border-border/60 mt-8 flex items-center justify-between border-t pt-5">
        <Button variant="ghost" size="sm" onClick={onSkipAll} disabled={disabled}>
          {pick(locale, { es: "Saltar todo", en: "Skip all" })}
        </Button>
        <Button onClick={onContinue} disabled={disabled} size="lg">
          {pick(locale, { es: "Empezar", en: "Start" })} →
        </Button>
      </div>
    </div>
  );
}

function FeatureRow({
  emoji,
  title,
  description,
}: {
  emoji: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border-border/60 bg-muted/30 flex items-start gap-3 rounded-xl border p-4">
      <span className="text-xl leading-none">{emoji}</span>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
      </div>
    </div>
  );
}

function StepIdentity({
  locale,
  name,
  setName,
  reasons,
  setReasons,
  onBack,
  onSkip,
  onContinue,
  disabled,
}: {
  locale: Locale;
  name: string;
  setName: (value: string) => void;
  reasons: Set<UsageReason>;
  setReasons: (next: Set<UsageReason>) => void;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  disabled?: boolean;
}) {
  function toggleReason(value: UsageReason) {
    const next = new Set(reasons);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setReasons(next);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onContinue();
  }

  const selectedHint =
    reasons.size > 0
      ? pick(locale, {
          es: `${reasons.size} seleccionado${reasons.size === 1 ? "" : "s"}`,
          en: `${reasons.size} selected`,
        })
      : undefined;

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <StepHeader
        locale={locale}
        index={2}
        title={pick(locale, { es: "Contame quién sos", en: "Tell me about you" })}
        description={pick(locale, {
          es: "Te llamo por tu nombre y entiendo mejor el contexto. Todo opcional.",
          en: "I call you by name and understand the context better. All optional.",
        })}
      />

      <div className="space-y-2">
        <Label htmlFor="onboarding-name">
          {pick(locale, { es: "¿Cómo te llamás?", en: "What's your name?" })}
        </Label>
        <Input
          id="onboarding-name"
          autoComplete="given-name"
          autoFocus
          placeholder="Marcos"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
        />
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label>{pick(locale, { es: "¿Para qué la vas a usar?", en: "What will you use it for?" })}</Label>
          <p className="text-muted-foreground text-xs">
            {pick(locale, { es: "Podés elegir más de uno.", en: "You can pick more than one." })}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {usageReasonValues.map((value) => {
            const meta = REASON_LABELS[value];
            const active = reasons.has(value);
            return (
              <button
                key={value}
                type="button"
                onClick={() => toggleReason(value)}
                className={cn(
                  "flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all",
                  active
                    ? "border-primary/60 bg-primary/10 text-foreground shadow-sm"
                    : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60",
                )}
                aria-pressed={active}
              >
                <span className="text-base leading-none">{meta.emoji}</span>
                <span className="font-medium">{pick(locale, meta.label)}</span>
              </button>
            );
          })}
        </div>
      </div>

      <StepFooter
        locale={locale}
        onBack={onBack}
        onSkip={onSkip}
        onContinue={onContinue}
        disabled={disabled}
        hint={selectedHint}
      />
    </form>
  );
}

function StepCountryCurrency({
  locale,
  country,
  setCountry,
  currency,
  setCurrency,
  onBack,
  onSkip,
  onContinue,
  disabled,
}: {
  locale: Locale;
  country: string | null;
  setCountry: (value: string | null) => void;
  currency: string;
  setCurrency: (value: string) => void;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.currency.toLowerCase().includes(q),
    );
  }, [search]);

  function selectCountry(option: CountryOption) {
    setCountry(option.code);
    setCurrency(option.currency);
  }

  const selectedOption = country ? getCountryOption(country) : null;

  return (
    <div className="space-y-6">
      <StepHeader
        locale={locale}
        index={3}
        title={pick(locale, { es: "¿Dónde vivís?", en: "Where do you live?" })}
        description={pick(locale, {
          es: "Lo usamos para sugerir tu moneda principal. La podés cambiar siempre desde Configuración.",
          en: "We use it to suggest your primary currency. You can change it any time from Settings.",
        })}
      />

      <div className="space-y-2">
        <Label htmlFor="country-search">
          {pick(locale, { es: "País de residencia", en: "Country of residence" })}
        </Label>
        <Input
          id="country-search"
          placeholder={pick(locale, { es: "Buscar país…", en: "Search country…" })}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="border-border/60 max-h-72 overflow-auto rounded-xl border">
        <ul className="divide-border/40 divide-y">
          {filtered.map((option) => {
            const active = country === option.code;
            return (
              <li key={option.code}>
                <button
                  type="button"
                  onClick={() => selectCountry(option)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                    active ? "bg-primary/10" : "hover:bg-muted/50",
                  )}
                  aria-pressed={active}
                >
                  <span className="text-xl leading-none">{option.flag}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-tight">{option.name}</p>
                    <p className="text-muted-foreground truncate text-xs">
                      {option.currencyLabel} · {option.currency}
                    </p>
                  </div>
                  {active ? (
                    <span className="text-primary text-sm" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
          {filtered.length === 0 ? (
            <li className="text-muted-foreground px-3 py-4 text-center text-sm">
              {pick(locale, {
                es: "No encontramos ese país. Elegí la moneda manualmente abajo.",
                en: "We couldn't find that country. Pick the currency manually below.",
              })}
            </li>
          ) : null}
        </ul>
      </div>

      <div className="border-border/60 bg-muted/30 flex items-center gap-4 rounded-xl border p-4">
        <div className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg font-display text-base font-bold">
          $
        </div>
        <div className="flex-1">
          <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
            {pick(locale, { es: "Moneda principal", en: "Primary currency" })}
          </p>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg font-semibold">{currency || "USD"}</span>
            {selectedOption ? (
              <span className="text-muted-foreground text-xs">{selectedOption.currencyLabel}</span>
            ) : null}
          </div>
        </div>
        <CurrencyPicker
          value={currency}
          onChange={(value) => {
            setCurrency(value);
            if (country && currencyForCountry(country) !== value) {
              // User overrode the suggested currency; keep country but
              // show that currency was customised.
            }
          }}
          className="w-20"
        />
      </div>

      <StepFooter
        locale={locale}
        onBack={onBack}
        onSkip={onSkip}
        onContinue={onContinue}
        disabled={disabled}
      />
    </div>
  );
}

/**
 * Optional Telegram step — generates a signed deep-link token and opens
 * `t.me/<bot>?start=<token>` in a new tab. Users that want Telegram as their
 * primary channel can also link it later from Settings.
 */
function StepTelegram({
  locale,
  onBack,
  onSkip,
  onContinue,
  disabled,
}: {
  locale: Locale;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setError(null);
    setFeedback(null);
    setBusy(true);
    try {
      const res = await fetch("/api/settings/telegram", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(
          data.error ??
            pick(locale, {
              es: "No se pudo iniciar Telegram.",
              en: "Could not start Telegram.",
            }),
        );
        return;
      }
      const data = (await res.json()) as { url: string };
      window.open(data.url, "_blank", "noopener,noreferrer");
      setFeedback(
        pick(locale, {
          es: "Abrí Telegram y tocá Iniciar para terminar.",
          en: "Open Telegram and tap Start to finish.",
        }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <StepHeader
        locale={locale}
        index={4}
        title={pick(locale, { es: "Vinculá Telegram (opcional)", en: "Link Telegram (optional)" })}
        description={pick(locale, {
          es: "Chateá conmigo desde Telegram: mandá fotos del banco, dictá gastos por audio o consultá tu mes sin abrir la app.",
          en: "Chat with me on Telegram: send bank photos, dictate expenses by voice, or check your month without opening the app.",
        })}
      />

      <div className="border-border/60 bg-muted/20 space-y-3 rounded-xl border p-4 text-center">
        <p className="text-muted-foreground text-sm">
          {pick(locale, {
            es: "Te abrimos el bot en una pestaña nueva con un código de un solo uso.",
            en: "We'll open the bot in a new tab with a one-time code.",
          })}
        </p>
        <Button onClick={start} disabled={busy} size="lg">
          {busy
            ? pick(locale, { es: "Generando…", en: "Generating…" })
            : pick(locale, { es: "Conectar Telegram", en: "Connect Telegram" })}
        </Button>
        {error ? <p className="text-destructive text-xs">{error}</p> : null}
        {feedback ? <p className="text-good text-xs">{feedback}</p> : null}
      </div>

      <p className="text-muted-foreground text-xs text-center">
        {pick(locale, {
          es: "Lo podés hacer más tarde desde Configuración.",
          en: "You can do it later from Settings.",
        })}
      </p>

      <StepFooter
        locale={locale}
        onBack={onBack}
        onSkip={onSkip}
        onContinue={onContinue}
        skipLabel={pick(locale, { es: "Más tarde", en: "Later" })}
        continueLabel={pick(locale, { es: "Listo", en: "Done" })}
        disabled={disabled}
      />
    </div>
  );
}

function StepDone({
  locale,
  name,
  currency,
  onFinish,
  disabled,
}: {
  locale: Locale;
  name: string | null;
  currency: string;
  onFinish: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col items-center text-center space-y-6">
      <div className="bg-primary/15 text-primary flex size-20 items-center justify-center rounded-full">
        <svg
          className="size-10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M5 12l5 5 9-11" />
        </svg>
      </div>

      <div className="space-y-2">
        <p className="text-muted-foreground text-xs uppercase tracking-[0.2em]">
          {pick(locale, { es: "Listo", en: "Ready" })}
          {name ? `, ${name}` : ""}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">
          {pick(locale, { es: "Hablamos en el chat.", en: "See you in the chat." })}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {pick(locale, {
            es: "Decime tu ingreso del mes o tirame una foto del banco para arrancar.",
            en: "Tell me your monthly income or send me a bank screenshot to get started.",
          })}
          <br />
          {pick(locale, { es: "Tu moneda principal es", en: "Your primary currency is" })}{" "}
          <span className="text-foreground font-semibold">{currency}</span>.
        </p>
      </div>

      <div className="grid w-full grid-cols-3 gap-2">
        <DoneTile emoji="💬" label={pick(locale, { es: "Chat", en: "Chat" })} />
        <DoneTile emoji="📅" label={pick(locale, { es: "Mes", en: "Month" })} />
        <DoneTile emoji="📊" label={pick(locale, { es: "Año", en: "Year" })} />
      </div>

      <Button onClick={onFinish} disabled={disabled} size="lg" className="w-full">
        {pick(locale, { es: "Ir al chat", en: "Go to chat" })} →
      </Button>
    </div>
  );
}

function DoneTile({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="border-border/60 bg-muted/30 rounded-xl border px-3 py-3 text-center">
      <p className="text-2xl leading-none">{emoji}</p>
      <p className="text-muted-foreground mt-1 text-xs">{label}</p>
    </div>
  );
}

function isUsageReason(value: string): value is UsageReason {
  return (usageReasonValues as readonly string[]).includes(value);
}
