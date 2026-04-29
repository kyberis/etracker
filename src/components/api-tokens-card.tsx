"use client";

import { format } from "date-fns";
import { Copy, KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dateLocale } from "@/lib/i18n/format";
import { useLocale, useTx } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/locale";

type Token = {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type CreateResponse = {
  token: { id: string; name: string; prefix: string; createdAt: string };
  plaintext: string;
};

const MCP_URL_HINT = "/api/mcp/user";

function formatTokenDate(value: string | null, locale: Locale): string {
  if (!value) return "—";
  try {
    return format(new Date(value), "PPp", { locale: dateLocale(locale) });
  } catch {
    return value;
  }
}

export function ApiTokensCard({ initialTokens }: { initialTokens: Token[] }) {
  const locale = useLocale();
  const tr = useTx();
  const [tokens, setTokens] = useState<Token[]>(initialTokens);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freshToken, setFreshToken] = useState<{ name: string; plaintext: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const res = await fetch("/api/settings/api-tokens");
    if (!res.ok) return;
    const data = (await res.json()) as { tokens: Token[] };
    setTokens(data.tokens);
  }

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/settings/api-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? tr({ es: "No se pudo crear el token.", en: "Could not create the token." }));
        return;
      }
      const data = (await res.json()) as CreateResponse;
      setFreshToken({ name: data.token.name, plaintext: data.plaintext });
      setName("");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: Token) {
    if (
      !confirm(
        tr({
          es: `¿Revocar el token "${token.name}"? Esta acción no se puede deshacer.`,
          en: `Revoke token "${token.name}"? This cannot be undone.`,
        }),
      )
    ) {
      return;
    }
    const res = await fetch(`/api/settings/api-tokens/${token.id}`, { method: "DELETE" });
    if (res.ok) {
      await refresh();
    }
  }

  async function copyToClipboard(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setError(tr({ es: "No se pudo copiar al portapapeles.", en: "Could not copy to clipboard." }));
    }
  }

  const activeTokens = tokens.filter((t) => !t.revokedAt);
  const revokedTokens = tokens.filter((t) => t.revokedAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="text-primary size-5" />
          {tr({ es: "Acceso para AI (MCP)", en: "AI access (MCP)" })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="text-muted-foreground space-y-2 text-sm leading-relaxed">
          <p>
            {tr({
              es: "Generá un token para que tu propio AI assistant (Claude Desktop, Cursor, ChatGPT custom GPT, cualquier cliente MCP) pueda consultar y modificar tus finanzas en Clara con tu permiso.",
              en: "Create a token so your own AI assistant (Claude Desktop, Cursor, a custom ChatGPT GPT, any MCP client) can read and update your finances in Clara with your permission.",
            })}
          </p>
          <p>
            {tr({ es: "El servidor MCP autenticado vive en", en: "The authenticated MCP server lives at" })}{" "}
            <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs">
              {MCP_URL_HINT}
            </code>
            . {tr({ es: "Usá el token como header", en: "Use the token as header" })}{" "}
            <code className="bg-muted text-foreground rounded px-1.5 py-0.5 font-mono text-xs">
              Authorization: Bearer ada_pat_…
            </code>
            .
          </p>
        </div>

        <form className="flex flex-wrap items-end gap-3" onSubmit={onCreate}>
          <div className="flex-1 space-y-1.5">
            <label htmlFor="tokenName" className="text-sm font-medium">
              {tr({ es: "Nombre del token", en: "Token name" })}
            </label>
            <Input
              id="tokenName"
              placeholder={tr({
                es: "Ej.: «Claude Desktop», «Cursor», «iPhone»",
                en: 'e.g. "Claude Desktop", "Cursor", "iPhone"',
              })}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              required
            />
          </div>
          <Button type="submit" disabled={busy || !name.trim()}>
            <KeyRound className="size-4" />
            {busy ? tr({ es: "Generando…", en: "Generating…" }) : tr({ es: "Crear token", en: "Create token" })}
          </Button>
        </form>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        {freshToken ? (
          <div className="border-primary/50 bg-primary/5 space-y-3 rounded-lg border p-4">
            <div className="flex items-start gap-2">
              <ShieldCheck className="text-primary mt-0.5 size-4 shrink-0" />
              <div className="space-y-1">
                <p className="text-sm font-semibold">
                  {tr({ es: "Token generado:", en: "Token created:" })} {freshToken.name}
                </p>
                <p className="text-muted-foreground text-xs">
                  {tr({
                    es: "Copialo ahora — no lo vamos a mostrar de nuevo. Si lo perdés, revocá este token y creá uno nuevo.",
                    en: "Copy it now — we will not show it again. If you lose it, revoke this token and create a new one.",
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="bg-background border-border flex-1 overflow-x-auto rounded border px-3 py-2 font-mono text-xs">
                {freshToken.plaintext}
              </code>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(freshToken.plaintext)}
              >
                <Copy className="size-3.5" />
                {copied ? tr({ es: "Copiado", en: "Copied" }) : tr({ es: "Copiar", en: "Copy" })}
              </Button>
            </div>
            <details className="text-xs">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
                {tr({
                  es: "Ver configuración para Claude Desktop / Cursor",
                  en: "View Claude Desktop / Cursor configuration",
                })}
              </summary>
              <pre className="bg-background border-border mt-2 overflow-x-auto rounded border p-3 font-mono">
{`{
  "mcpServers": {
    "ada": {
      "url": "${typeof window !== "undefined" ? window.location.origin : ""}${MCP_URL_HINT}",
      "headers": { "Authorization": "Bearer ${freshToken.plaintext}" }
    }
  }
}`}
              </pre>
            </details>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFreshToken(null)}
              className="text-muted-foreground"
            >
              {tr({ es: "Ya lo guardé", en: "I have saved it" })}
            </Button>
          </div>
        ) : null}

        {activeTokens.length > 0 ? (
          <div className="space-y-2">
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              {tr({ es: "Tokens activos", en: "Active tokens" })} ({activeTokens.length})
            </p>
            <ul className="divide-border divide-y rounded-lg border">
              {activeTokens.map((token) => (
                <li key={token.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-sm font-medium">{token.name}</p>
                    <p className="text-muted-foreground font-mono text-xs">
                      {token.prefix}…
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {tr({ es: "Creado", en: "Created" })}{" "}
                      {formatTokenDate(token.createdAt, locale)} · {tr({ es: "Último uso", en: "Last used" })}{" "}
                      {formatTokenDate(token.lastUsedAt, locale)}
                      {token.expiresAt
                        ? ` · ${tr({ es: "Expira", en: "Expires" })} ${formatTokenDate(token.expiresAt, locale)}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => revoke(token)}
                    className="text-destructive hover:text-destructive shrink-0"
                  >
                    <Trash2 className="size-4" />
                    <span className="sr-only">{tr({ es: "Revocar", en: "Revoke" })}</span>
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">
            {tr({ es: "Todavía no creaste ningún token.", en: "You have not created any tokens yet." })}
          </p>
        )}

        {revokedTokens.length > 0 ? (
          <details className="text-xs">
            <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
              {tr({ es: "Tokens revocados", en: "Revoked tokens" })} ({revokedTokens.length})
            </summary>
            <ul className="text-muted-foreground mt-2 space-y-1">
              {revokedTokens.map((token) => (
                <li key={token.id} className="font-mono">
                  {token.name} · {token.prefix}… ({tr({ es: "revocado", en: "revoked" })}{" "}
                  {formatTokenDate(token.revokedAt, locale)})
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}
