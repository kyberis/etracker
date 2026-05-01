"use client";

import { Fingerprint } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  FormEvent,
  Suspense,
  useCallback,
  useState,
  useSyncExternalStore,
} from "react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { useLocale, useT } from "@/lib/i18n/client";
import { loginErrorMessage } from "@/lib/login-errors";

type LoginFormProps = {
  googleEnabled: boolean;
};

const noopSubscribe = () => () => undefined;

function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

function LoginFormInner({ googleEnabled }: LoginFormProps) {
  const t = useT();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryError = loginErrorMessage(searchParams.get("error"), locale);
  const verifiedSuccess = searchParams.get("verified") === "1";

  // Hydration-safe probe — same pattern as TurnstileWidget. Older Safari
  // / in-app webviews don't expose `PublicKeyCredential` and we hide the
  // button entirely there.
  const passkeySupported = useSyncExternalStore(
    noopSubscribe,
    isWebAuthnSupported,
    () => false,
  );

  async function onPasskeyLogin() {
    setPasskeyLoading(true);
    setError(null);
    try {
      const optsRes = await fetch("/api/auth/passkey/login-options", {
        method: "POST",
      });
      if (!optsRes.ok) throw new Error("options");
      const options = await optsRes.json();

      // Lazy-import the browser helper so the bundle stays small for users
      // who never click the passkey button.
      const { startAuthentication } = await import("@simplewebauthn/browser");
      const credential = await startAuthentication(options);

      const result = await signIn("passkey", {
        credential: JSON.stringify(credential),
        redirect: false,
      });

      if (result?.error) {
        setError(t.auth.passkeySignInError);
        return;
      }
      if (result?.ok) {
        router.push("/app");
        router.refresh();
      }
    } catch {
      setError(t.auth.passkeySignInError);
    } finally {
      setPasskeyLoading(false);
    }
  }

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
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      turnstileToken: turnstileToken ?? "",
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(t.auth.errorInvalid);
      return;
    }

    if (result?.ok) {
      router.push("/app");
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.auth.loginTitle}</CardTitle>
        <CardDescription>{t.auth.loginSubtitle}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {googleEnabled || passkeySupported ? (
          <div className="space-y-3">
            {passkeySupported ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={onPasskeyLogin}
                disabled={passkeyLoading}
              >
                <Fingerprint className="size-4" aria-hidden />
                {passkeyLoading
                  ? t.auth.passkeyVerifying
                  : t.auth.passkeySignIn}
              </Button>
            ) : null}
            {googleEnabled ? <GoogleSignInButton callbackUrl="/app" /> : null}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="border-border w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card text-muted-foreground px-2">
                  {t.auth.or}
                </span>
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
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="password">{t.auth.password}</Label>
              <Link
                href="/register"
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
              >
                {t.auth.noAccount}
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              toggleLabel={t.auth.showPassword}
            />
          </div>

          <TurnstileWidget
            onToken={onTurnstileToken}
            onError={onTurnstileError}
          />

          {verifiedSuccess ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              {t.auth.verifyEmailSuccess}
            </p>
          ) : null}
          {queryError ? <p className="text-destructive text-sm">{queryError}</p> : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t.auth.submittingLogin : t.auth.submitLogin}
          </Button>

          <p className="text-muted-foreground text-center text-sm">
            {t.auth.noAccount}{" "}
            <Link
              href="/register"
              className="text-primary underline-offset-4 hover:underline"
            >
              {t.auth.goToRegister}
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export function LoginForm(props: LoginFormProps) {
  return (
    <Suspense fallback={null}>
      <LoginFormInner {...props} />
    </Suspense>
  );
}
