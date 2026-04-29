"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyPicker } from "@/components/ui/currency-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  COUNTRY_OPTIONS,
  type CountryOption,
  currencyForCountry,
  getCountryOption,
} from "@/lib/i18n/country-currency";
import { cn } from "@/lib/utils";
import { type UsageReason, usageReasonValues } from "@/lib/validators";

export type OnboardingInitial = {
  name: string | null;
  country: string | null;
  usageReasons: string[];
  primaryCurrency: string;
  primaryCurrencyConfirmedAt: string | null;
  whatsapp: {
    phone: string | null;
    verifiedAt: string | null;
    pendingCode: string | null;
    pendingExpiresAt: string | null;
  };
  whatsappLinkTtlMinutes: number;
};

type Step = 0 | 1 | 2 | 3 | 4;
const TOTAL_STEPS = 5;

const REASON_LABELS: Record<UsageReason, { label: string; emoji: string }> = {
  personal: { label: "Personal", emoji: "🧍" },
  couple_family: { label: "Pareja / Familia", emoji: "👫" },
  freelance: { label: "Freelance", emoji: "💼" },
  business: { label: "Negocio", emoji: "🏢" },
  other: { label: "Otro", emoji: "✨" },
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
        setError(data.error ?? "No se pudo guardar.");
        return false;
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
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
      <ProgressDots step={step} />

      {error ? (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <Card className="mt-6 shadow-sm">
        <CardContent className="p-6 sm:p-8">
          {step === 0 ? (
            <StepWelcome onContinue={goNext} onSkipAll={skipAll} disabled={submitting} />
          ) : null}
          {step === 1 ? (
            <StepIdentity
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
            <StepWhatsapp
              initial={initial.whatsapp}
              ttlMinutes={initial.whatsappLinkTtlMinutes}
              onBack={goBack}
              onSkip={skipAll}
              onContinue={goNext}
              disabled={submitting}
            />
          ) : null}
          {step === 4 ? (
            <StepDone
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

function ProgressDots({ step }: { step: Step }) {
  return (
    <div className="flex items-center gap-1.5" aria-label={`Paso ${step + 1} de ${TOTAL_STEPS}`}>
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
      <span className="ml-2 text-xs text-muted-foreground">
        Paso {step + 1} de {TOTAL_STEPS}
      </span>
    </div>
  );
}

function StepHeader({
  index,
  title,
  description,
}: {
  index: number;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
        Paso {index} de {TOTAL_STEPS}
      </p>
      <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      {description ? (
        <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
      ) : null}
    </div>
  );
}

function StepFooter({
  onBack,
  onSkip,
  onContinue,
  continueLabel = "Continuar",
  skipLabel = "Saltar",
  disabled,
  hint,
}: {
  onBack?: () => void;
  onSkip: () => void;
  onContinue: () => void;
  continueLabel?: string;
  skipLabel?: string;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div className="border-border/60 mt-8 flex items-center justify-between border-t pt-5">
      <div className="flex items-center gap-2">
        {onBack ? (
          <Button variant="ghost" size="sm" onClick={onBack} disabled={disabled}>
            ← Atrás
          </Button>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onSkip} disabled={disabled}>
          {skipLabel}
        </Button>
      </div>
      <div className="flex items-center gap-3">
        {hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
        <Button onClick={onContinue} disabled={disabled} size="lg">
          {continueLabel} →
        </Button>
      </div>
    </div>
  );
}

function StepWelcome({
  onContinue,
  onSkipAll,
  disabled,
}: {
  onContinue: () => void;
  onSkipAll: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-6">
      <StepHeader
        index={1}
        title="¡Hola! Soy Clara."
        description="Tu asistente financiera. Te ayudo a planificar gastos fijos y puntuales, ver en qué se te va la plata y cuánto te sobra al cierre del mes."
      />

      <div className="grid gap-3">
        <FeatureRow
          emoji="🗓️"
          title="Mes a mes"
          description="Cargás tus gastos fijos una vez y los copiamos cada mes nuevo."
        />
        <FeatureRow
          emoji="💬"
          title="Chateá conmigo"
          description="Mandame fotos del banco, CSV de Revolut o describime gastos en lenguaje natural. Si me linkeás WhatsApp, también desde ahí."
        />
        <FeatureRow
          emoji="🌎"
          title="Multi-moneda, sin sermones"
          description="Cargá gastos en cualquier moneda; los convierto al toque a tu moneda principal usando el tipo de cambio del momento."
        />
      </div>

      <div className="border-border/60 mt-8 flex items-center justify-between border-t pt-5">
        <Button variant="ghost" size="sm" onClick={onSkipAll} disabled={disabled}>
          Saltar todo
        </Button>
        <Button onClick={onContinue} disabled={disabled} size="lg">
          Empezar →
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
  name,
  setName,
  reasons,
  setReasons,
  onBack,
  onSkip,
  onContinue,
  disabled,
}: {
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

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <StepHeader
        index={2}
        title="Contame quién sos"
        description="Te llamo por tu nombre y entiendo mejor el contexto. Todo opcional."
      />

      <div className="space-y-2">
        <Label htmlFor="onboarding-name">¿Cómo te llamás?</Label>
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
          <Label>¿Para qué la vas a usar?</Label>
          <p className="text-muted-foreground text-xs">Podés elegir más de uno.</p>
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
                <span className="font-medium">{meta.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <StepFooter
        onBack={onBack}
        onSkip={onSkip}
        onContinue={onContinue}
        disabled={disabled}
        hint={reasons.size > 0 ? `${reasons.size} seleccionado${reasons.size === 1 ? "" : "s"}` : undefined}
      />
    </form>
  );
}

function StepCountryCurrency({
  country,
  setCountry,
  currency,
  setCurrency,
  onBack,
  onSkip,
  onContinue,
  disabled,
}: {
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
        index={3}
        title="¿Dónde vivís?"
        description="Lo usamos para sugerir tu moneda principal. La podés cambiar siempre desde Configuración."
      />

      <div className="space-y-2">
        <Label htmlFor="country-search">País de residencia</Label>
        <Input
          id="country-search"
          placeholder="Buscar país…"
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
              No encontramos ese país. Elegí la moneda manualmente abajo.
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
            Moneda principal
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
        onBack={onBack}
        onSkip={onSkip}
        onContinue={onContinue}
        disabled={disabled}
      />
    </div>
  );
}

type WhatsappStatus = OnboardingInitial["whatsapp"];

function StepWhatsapp({
  initial,
  ttlMinutes,
  onBack,
  onSkip,
  onContinue,
  disabled,
}: {
  initial: WhatsappStatus;
  ttlMinutes: number;
  onBack: () => void;
  onSkip: () => void;
  onContinue: () => void;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<WhatsappStatus>(initial);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const linked = Boolean(status.phone && status.verifiedAt);

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
      setFeedback("Te generamos un código. Mandalo por WhatsApp para terminar la vinculación.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <StepHeader
        index={4}
        title="Linkeá WhatsApp (opcional)"
        description="Chateá conmigo desde WhatsApp: mandá fotos del banco, dictá gastos por audio o consultá tu mes sin abrir la app."
      />

      {linked ? (
        <div className="border-good/40 bg-good/10 flex items-center justify-between rounded-xl border p-4">
          <div>
            <p className="text-sm font-medium">Vinculado</p>
            <p className="text-muted-foreground text-xs">{status.phone}</p>
          </div>
          <span className="text-good text-sm" aria-hidden>
            ✓
          </span>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={startLink}>
          <div className="space-y-2">
            <Label htmlFor="whatsapp-phone">
              Tu número (formato internacional, ej. +5491112345678)
            </Label>
            <Input
              id="whatsapp-phone"
              type="tel"
              placeholder="+5491112345678"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              autoComplete="tel"
            />
          </div>
          <Button type="submit" disabled={busy || !phone.trim()} size="sm">
            {busy ? "Generando…" : "Generar código"}
          </Button>
        </form>
      )}

      {status.pendingCode ? (
        <div className="border-border/60 bg-muted/30 space-y-2 rounded-xl border p-4 text-sm">
          <div className="flex items-baseline justify-between">
            <p className="text-muted-foreground text-xs uppercase tracking-[0.18em]">
              Tu código
            </p>
            <p className="text-muted-foreground text-xs">expira en ~{ttlMinutes} min</p>
          </div>
          <p className="font-display text-3xl font-bold tracking-widest">{status.pendingCode}</p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Abrí WhatsApp y mandale al asistente{" "}
            <span className="bg-background rounded px-1.5 py-0.5 font-mono text-xs">
              LINK {status.pendingCode}
            </span>
            .
          </p>
        </div>
      ) : null}

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {feedback ? <p className="text-good text-sm">{feedback}</p> : null}

      <p className="text-muted-foreground text-xs text-center">
        Lo podés hacer más tarde desde Configuración.
      </p>

      <StepFooter
        onBack={onBack}
        onSkip={onSkip}
        onContinue={onContinue}
        skipLabel="Más tarde"
        continueLabel="Listo"
        disabled={disabled}
      />
    </div>
  );
}

function StepDone({
  name,
  currency,
  onFinish,
  disabled,
}: {
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
          Listo{name ? `, ${name}` : ""}
        </p>
        <h1 className="font-display text-3xl font-bold tracking-tight">Hablamos en el chat.</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Decime tu ingreso del mes o tirame una foto del banco para arrancar.
          <br />
          Tu moneda principal es{" "}
          <span className="text-foreground font-semibold">{currency}</span>.
        </p>
      </div>

      <div className="grid w-full grid-cols-3 gap-2">
        <DoneTile emoji="💬" label="Chat" />
        <DoneTile emoji="📅" label="Mes" />
        <DoneTile emoji="📊" label="Año" />
      </div>

      <Button onClick={onFinish} disabled={disabled} size="lg" className="w-full">
        Ir al chat →
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
