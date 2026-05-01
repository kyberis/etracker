"use client";

import Link from "next/link";
import { FormEvent, useCallback, useState } from "react";

import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useLocale, useT, useTx } from "@/lib/i18n/client";
import { CURRENT_TERMS_VERSION } from "@/lib/legal";

type RegisterFormProps = {
  googleEnabled: boolean;
};

export function RegisterForm({ googleEnabled }: RegisterFormProps) {
  const t = useT();
  const tx = useTx();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  // After a successful POST we leave the form behind and show a "check your
  // email" panel instead of auto-signing-in: credentials sign-in now requires
  // a verified email.
  const [submitted, setSubmitted] = useState<{
    email: string;
    emailDelivered: boolean;
  } | null>(null);

  const onTurnstileToken = useCallback(
    (token: string) => setTurnstileToken(token),
    [],
  );
  const onTurnstileError = useCallback(
    () => setTurnstileToken(null),
    [],
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t.auth.errorPasswordMismatch);
      return;
    }

    if (!accepted) {
      setError(
        tx({
          es: "Tenés que aceptar los Términos y la Política de Privacidad para continuar.",
          en: "You need to accept the Terms and the Privacy Policy to continue.",
        }),
      );
      return;
    }

    setLoading(true);
    const normalizedEmail = email.trim().toLowerCase();
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: normalizedEmail,
        password,
        turnstileToken: turnstileToken ?? undefined,
        acceptedTermsVersion: CURRENT_TERMS_VERSION,
      }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? t.auth.errorRegisterFailed);
      setLoading(false);
      return;
    }

    const data = (await response.json()) as {
      ok: boolean;
      needsVerification?: boolean;
      emailDelivered?: boolean;
    };
    setLoading(false);
    setSubmitted({
      email: normalizedEmail,
      emailDelivered: data.emailDelivered ?? false,
    });
  }

  if (submitted) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t.auth.verifyEmailTitle}</CardTitle>
          <CardDescription>
            {t.auth.verifyEmailBody(submitted.email)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!submitted.emailDelivered ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-3 text-sm">
              {t.auth.verifyEmailMissingResend}
            </p>
          ) : null}
          <Link
            href="/login"
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 w-full items-center justify-center rounded-lg px-3 text-sm font-medium transition-colors"
          >
            {t.auth.goToLogin}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.auth.registerTitle}</CardTitle>
        <CardDescription>{t.auth.registerSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {googleEnabled ? (
          <div className="space-y-3">
            <GoogleSignInButton callbackUrl="/onboarding" label={t.auth.googleContinue} />
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="border-border w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card text-muted-foreground px-2">{t.auth.or}</span>
              </div>
            </div>
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t.auth.password}</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              toggleLabel={t.auth.showPassword}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t.auth.confirmPassword}</Label>
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
              toggleLabel={t.auth.showPassword}
            />
          </div>

          <TurnstileWidget
            onToken={onTurnstileToken}
            onError={onTurnstileError}
          />

          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              id="register-accept-terms"
              checked={accepted}
              onCheckedChange={(value) => setAccepted(value === true)}
              required
              aria-required="true"
              className="mt-0.5"
            />
            <span className="text-muted-foreground leading-relaxed">
              {tx({ es: "Acepto los", en: "I accept the" })}{" "}
              <Link
                href={`/${locale}/terms`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {tx({ es: "Términos", en: "Terms" })}
              </Link>{" "}
              {tx({ es: "y la", en: "and the" })}{" "}
              <Link
                href={`/${locale}/privacy`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {tx({ es: "Política de Privacidad", en: "Privacy Policy" })}
              </Link>{" "}
              ({tx({ es: "versión", en: "version" })} {CURRENT_TERMS_VERSION}).
            </span>
          </label>

          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={loading || !accepted}>
            {loading ? t.auth.submittingRegister : t.auth.submitRegister}
          </Button>

          <p className="text-muted-foreground text-center text-sm">
            {t.auth.haveAccount}{" "}
            <Link
              href="/login"
              className="text-primary underline-offset-4 hover:underline"
            >
              {t.auth.goToLogin}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
