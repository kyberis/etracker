"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { FormEvent, Suspense, useState } from "react";

import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginErrorMessage } from "@/lib/login-errors";

type LoginFormProps = {
  googleEnabled: boolean;
};

function LoginFormInner({ googleEnabled }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryError = loginErrorMessage(searchParams.get("error"));

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    setLoading(false);

    if (result?.error) {
      setError(
        "Correo o contraseña incorrectos. Si entraste con Google antes, usá «Continuar con Google».",
      );
      return;
    }

    if (result?.ok) {
      router.push("/");
      router.refresh();
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>Planificá tus gastos mensuales por banco.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {googleEnabled ? (
          <div className="space-y-3">
            <GoogleSignInButton callbackUrl="/" />
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="border-border w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card text-muted-foreground px-2">o</span>
              </div>
            </div>
          </div>
        ) : null}

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
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
              <Label htmlFor="password">Contraseña</Label>
              <Link
                href="/register"
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
              >
                ¿Primera vez?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {queryError ? <p className="text-destructive text-sm">{queryError}</p> : null}
          {error ? <p className="text-destructive text-sm">{error}</p> : null}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Iniciando sesión…" : "Iniciar sesión"}
          </Button>

          <p className="text-muted-foreground text-center text-sm">
            ¿No tenés cuenta?{" "}
            <Link href="/register" className="text-primary underline-offset-4 hover:underline">
              Creá una
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export function LoginForm(props: LoginFormProps) {
  return (
    <Suspense
      fallback={
        <Card>
          <CardHeader>
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>Cargando…</CardDescription>
          </CardHeader>
        </Card>
      }
    >
      <LoginFormInner {...props} />
    </Suspense>
  );
}
