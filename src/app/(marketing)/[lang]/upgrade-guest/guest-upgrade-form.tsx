"use client";

import Link from "next/link";
import { useState } from "react";

import type { Locale } from "@/lib/i18n/locale";

type Copy = {
  emailLabel: string;
  passwordLabel: string;
  passwordHint: string;
  privacyLink: string;
  termsLink: string;
  submit: string;
  success: string;
  signInLink: string;
  errorGeneric: string;
};

type Props = {
  guestUserId: string;
  locale: Locale;
  termsVersion: string;
  copy: Copy;
};

export function GuestUpgradeForm({
  guestUserId,
  locale,
  termsVersion,
  copy,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!accepted) {
      setError(
        locale === "en"
          ? "You must accept the Terms and Privacy Policy."
          : "Tenés que aceptar los Términos y la Política de Privacidad.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/upgrade-guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestUserId,
          email,
          password,
          acceptedTermsVersion: termsVersion,
          locale,
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true }
        | { error: string }
        | null;
      if (!res.ok || !data || "error" in data) {
        setError((data && "error" in data && data.error) || copy.errorGeneric);
        setSubmitting(false);
        return;
      }
      setDone(true);
    } catch {
      setError(copy.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="mt-6 space-y-4">
        <p
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {copy.success}
        </p>
        <Link
          href="/login"
          className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors"
        >
          {copy.signInLink}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div>
        <label
          htmlFor="upgrade-email"
          className="text-foreground block text-sm font-medium"
        >
          {copy.emailLabel}
        </label>
        <input
          id="upgrade-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-border/60 bg-background mt-1.5 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
      </div>

      <div>
        <label
          htmlFor="upgrade-password"
          className="text-foreground block text-sm font-medium"
        >
          {copy.passwordLabel}
        </label>
        <input
          id="upgrade-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-border/60 bg-background mt-1.5 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
        />
        <p className="text-muted-foreground mt-1 text-xs">{copy.passwordHint}</p>
      </div>

      <label className="flex cursor-pointer items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5"
        />
        <span className="text-muted-foreground">
          {locale === "en" ? "I accept the " : "Acepto los "}
          <Link
            href={`/${locale}/terms`}
            className="text-foreground underline underline-offset-2"
          >
            {copy.termsLink}
          </Link>
          {locale === "en" ? " and the " : " y la "}
          <Link
            href={`/${locale}/privacy`}
            className="text-foreground underline underline-offset-2"
          >
            {copy.privacyLink}
          </Link>
          .
        </span>
      </label>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60 inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors"
      >
        {submitting ? "…" : copy.submit}
      </button>
    </form>
  );
}
