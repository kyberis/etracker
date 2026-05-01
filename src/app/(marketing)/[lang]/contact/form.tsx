"use client";

import { FormEvent, useCallback, useState } from "react";

import { TurnstileWidget } from "@/components/turnstile-widget";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ContactCopy } from "@/lib/marketing-content";

type Kind = "PRIVACY" | "ABUSE" | "BUG" | "GENERAL";

type Props = {
  copy: ContactCopy;
  prefill: { name: string; email: string } | null;
};

/**
 * Public contact form. Submits to `POST /api/contact` which handles:
 *  - rate-limit by IP,
 *  - Turnstile verification,
 *  - persistence to `ContactMessage`,
 *  - best-effort admin notification via Resend.
 *
 * The form is the *only* user-facing contact channel — Clara intentionally
 * does not expose a personal email address. The kind selector lets the
 * admin bandeja prioritise GDPR / abuse over feature requests.
 */
export function ContactForm({ copy, prefill }: Props) {
  const [kind, setKind] = useState<Kind>("GENERAL");
  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [body, setBody] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onTurnstileToken = useCallback(
    (token: string) => setTurnstileToken(token),
    [],
  );
  const onTurnstileError = useCallback(() => setTurnstileToken(null), []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          name: name.trim(),
          email: email.trim(),
          body: body.trim(),
          turnstileToken: turnstileToken ?? undefined,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? copy.errorGeneric);
        return;
      }
      setDone(true);
    } catch {
      setError(copy.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-good/40 bg-good/10 p-6">
        <h2 className="font-display text-2xl font-bold">{copy.successTitle}</h2>
        <p className="text-muted-foreground mt-2 leading-relaxed">
          {copy.successBody}
        </p>
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={onSubmit}>
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{copy.kindLabel}</legend>
        <div className="grid gap-2">
          {copy.kindOptions.map((option) => {
            const active = option.value === kind;
            return (
              <label
                key={option.value}
                className={
                  "border-border/60 flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors " +
                  (active ? "border-primary/60 bg-primary/5" : "hover:bg-muted/40")
                }
              >
                <input
                  type="radio"
                  name="kind"
                  value={option.value}
                  checked={active}
                  onChange={() => setKind(option.value)}
                  className="mt-1"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="text-muted-foreground block text-xs leading-relaxed">
                    {option.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-name">{copy.nameLabel}</Label>
          <Input
            id="contact-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            minLength={1}
            maxLength={80}
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-email">{copy.emailLabel}</Label>
          <Input
            id="contact-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact-body">{copy.bodyLabel}</Label>
        <Textarea
          id="contact-body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          required
          minLength={10}
          maxLength={5000}
          rows={6}
          placeholder={copy.bodyPlaceholder}
        />
        <p className="text-muted-foreground text-xs">{copy.privacyHint}</p>
      </div>

      <TurnstileWidget onToken={onTurnstileToken} onError={onTurnstileError} />

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Button
        type="submit"
        size="lg"
        className="w-full sm:w-auto"
        disabled={submitting}
      >
        {submitting ? copy.submitting : copy.submit}
      </Button>
    </form>
  );
}
