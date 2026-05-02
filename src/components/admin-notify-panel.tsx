"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, Send } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useTx } from "@/lib/i18n/client";

type NotifyResult = {
  channel: "telegram" | "email" | "none";
  sent: boolean;
  reason?: string;
};

/**
 * Operator-only widget on `/admin` to send a one-off notice to a single user.
 * Posts to `POST /api/admin/notify`, which prefers Telegram when the user is
 * linked and falls back to Resend email.
 *
 * Copy is inlined via `tx({ es, en })` because this widget is operator-only
 * and adding ~10 keys to the global dictionaries is overkill.
 */
export function AdminNotifyPanel() {
  const tx = useTx();

  const defaultSubject = tx({
    es: "Clara ya esta funcionando",
    en: "Clara is back online",
  });
  const defaultMessage = tx({
    es: "Hola, soy Clara. Tuvimos un problema tecnico que no me dejaba responder por Telegram. Ya quedo resuelto: podes volver a hablarme cuando quieras. Gracias por la paciencia.",
    en: "Hi, this is Clara. We had a technical issue that stopped me from replying on Telegram. It is resolved now: you can talk to me again whenever you want. Thanks for the patience.",
  });

  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState(defaultMessage);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NotifyResult | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          subject: subject.trim() || undefined,
          message: message.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | (NotifyResult & { error?: string })
        | { error?: string };
      if (!res.ok) {
        setError(
          ("error" in data && data.error) ||
            tx({ es: "No se pudo enviar.", en: "Could not send." }),
        );
        return;
      }
      setResult(data as NotifyResult);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tx({ es: "Error de red.", en: "Network error." }),
      );
    } finally {
      setPending(false);
    }
  }

  function describeResult(r: NotifyResult): string {
    if (r.channel === "telegram" && r.sent) {
      return tx({
        es: "Enviado por Telegram. El usuario lo recibe en su chat.",
        en: "Sent via Telegram. The user gets it in their chat.",
      });
    }
    if (r.channel === "email" && r.sent) {
      return tx({
        es: "Enviado por email (el usuario no tiene Telegram vinculado).",
        en: "Sent via email (the user has no Telegram linked).",
      });
    }
    if (r.channel === "none") {
      return tx({
        es: "El usuario no tiene Telegram vinculado y Resend no esta configurado. No se envio nada.",
        en: "The user has no Telegram linked and Resend is not configured. Nothing was sent.",
      });
    }
    return tx({
      es: `No se pudo entregar el mensaje (${r.reason ?? "motivo desconocido"}).`,
      en: `Could not deliver the message (${r.reason ?? "unknown reason"}).`,
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-2">
        <Label htmlFor="notify-email">
          {tx({ es: "Email del usuario", en: "User email" })}
        </Label>
        <Input
          id="notify-email"
          type="email"
          placeholder="usuario@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="off"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notify-subject">
          {tx({ es: "Asunto (solo email)", en: "Subject (email only)" })}
        </Label>
        <Input
          id="notify-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={120}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="notify-message">
          {tx({ es: "Mensaje", en: "Message" })}
        </Label>
        <Textarea
          id="notify-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={5}
          maxLength={4000}
          required
        />
        <p className="text-muted-foreground text-xs">
          {tx({
            es: "Si el usuario tiene Telegram vinculado, lo recibe ahi. Si no, le llega por email (Resend).",
            en: "If the user has Telegram linked, they get it there. Otherwise it goes by email (Resend).",
          })}
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending || !email || !message}>
          <Send className="mr-2 size-4" aria-hidden />
          {pending
            ? tx({ es: "Enviando...", en: "Sending..." })
            : tx({ es: "Enviar", en: "Send" })}
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {result ? (
        <Alert
          variant={result.sent ? "default" : "destructive"}
          className={
            result.sent ? "border-emerald-500/40 bg-emerald-500/10" : undefined
          }
        >
          {result.sent ? (
            <CheckCircle2 className="size-4" aria-hidden />
          ) : (
            <AlertTriangle className="size-4" aria-hidden />
          )}
          <AlertDescription>{describeResult(result)}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}
