"use client";

import { Bug, ChevronDown, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import { useTx } from "@/lib/i18n/client";

/**
 * Floating dev-only widget. Shows up only when `NODE_ENV !== "production"`
 * (Next inlines the value into the client bundle, so production builds
 * tree-shake the panel out entirely).
 *
 * Two destructive shortcuts hit dev-only API routes:
 *  - Revert last: removes the most recent expense-y mutation.
 *  - Reset account: wipes the user's data (banks, months, lines, templates,
 *    chat history, quotas, instructions) and clears `welcomedAt` so the
 *    welcome flow runs again on next visit. After reset we full-reload so
 *    the in-memory `useChat` state goes back to 0 too.
 */
export function DevTools() {
  if (process.env.NODE_ENV === "production") return null;
  return <DevToolsPanel />;
}

type Status =
  | { kind: "idle" }
  | { kind: "loading"; action: "revert" | "reset" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

function DevToolsPanel() {
  const tx = useTx();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function revertLast() {
    setStatus({ kind: "loading", action: "revert" });
    try {
      const res = await fetch("/api/dev/revert-last", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as
        | { ok: true; nothingToRevert?: true; reverted?: { name: string; amount: string; type: string } }
        | { error: string };
      if (!res.ok || "error" in data) {
        setStatus({
          kind: "error",
          message: "error" in data ? data.error : `HTTP ${res.status}`,
        });
        return;
      }
      if (data.nothingToRevert) {
        setStatus({ kind: "ok", message: tx({ es: "Nada para revertir.", en: "Nothing to revert." }) });
        return;
      }
      const { name, amount, type } = data.reverted ?? {};
      setStatus({
        kind: "ok",
        message: tx({
          es: `Borrado ${type === "expenseTemplate" ? "template" : "línea"}: ${name} (${amount}).`,
          en: `Deleted ${type === "expenseTemplate" ? "template" : "line"}: ${name} (${amount}).`,
        }),
      });
      // Reflect the deletion in the rest of the UI (balance pill, month
      // dashboard, etc.). Chat is in-memory and stays as-is on purpose.
      window.location.reload();
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : tx({ es: "Falló la request.", en: "Request failed." }),
      });
    }
  }

  async function resetAccount() {
    if (
      !window.confirm(
        tx({
          es: "¿Resetear la cuenta como recién registrada? Esto borra bancos, meses, gastos, plantillas y el historial de chat.",
          en: "Reset the account as if just registered? This deletes banks, months, expenses, templates, and chat history.",
        }),
      )
    ) {
      return;
    }
    setStatus({ kind: "loading", action: "reset" });
    try {
      const res = await fetch("/api/dev/reset-account", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = (await res.json()) as { ok?: true } | { error: string };
      if (!res.ok || "error" in data) {
        setStatus({
          kind: "error",
          message: "error" in data ? data.error : `HTTP ${res.status}`,
        });
        return;
      }
      // Hard reload to /app so the chat's in-memory `useChat` history
      // resets to zero and the (eventual) welcome flow runs from a clean
      // server state.
      window.location.assign("/app");
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : tx({ es: "Falló la request.", en: "Request failed." }),
      });
    }
  }

  const loading = status.kind === "loading";

  return (
    <div className="fixed bottom-4 left-4 z-50 print:hidden">
      {open ? (
        <div className="w-72 rounded-2xl bg-card p-3 text-sm shadow-2xl ring-1 ring-foreground/10 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
              <Bug className="size-3.5" /> dev tools
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={tx({ es: "Cerrar", en: "Close" })}
              className="text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className="size-4" />
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <DevAction
              icon={<RotateCcw className="size-4" />}
              label={tx({ es: "Revertir última op", en: "Revert last op" })}
              hint={tx({
                es: "Borra la última línea o plantilla creada.",
                en: "Deletes the most recent line or template.",
              })}
              loading={loading && status.action === "revert"}
              disabled={loading}
              onClick={revertLast}
            />
            <DevAction
              icon={<Trash2 className="size-4" />}
              label={tx({ es: "Resetear cuenta", en: "Reset account" })}
              hint={tx({
                es: "Cuenta como recién registrada. Chat vuelve a 0.",
                en: "Fresh-account state. Chat counter back to 0.",
              })}
              tone="danger"
              loading={loading && status.action === "reset"}
              disabled={loading}
              onClick={resetAccount}
            />
          </div>

          {status.kind === "ok" || status.kind === "error" ? (
            <p
              className={cn(
                "mt-2 rounded-md px-2 py-1 text-xs",
                status.kind === "ok"
                  ? "bg-lime/15 text-foreground"
                  : "bg-hotpink/15 text-hotpink",
              )}
            >
              {status.message}
            </p>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={tx({ es: "Abrir dev tools", en: "Open dev tools" })}
          className="bg-card text-foreground flex size-11 items-center justify-center rounded-full shadow-lg ring-1 ring-foreground/10 transition hover:scale-105"
        >
          <Bug className="size-4" />
        </button>
      )}
    </div>
  );
}

function DevAction({
  icon,
  label,
  hint,
  tone = "default",
  loading,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  tone?: "default" | "danger";
  loading: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition disabled:opacity-50",
        tone === "danger"
          ? "hover:bg-hotpink/10"
          : "hover:bg-foreground/5",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
          tone === "danger" ? "bg-hotpink/15 text-hotpink" : "bg-foreground/5",
        )}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">
          {loading ? "…" : label}
        </span>
        <span className="text-muted-foreground text-[11px]">{hint}</span>
      </span>
    </button>
  );
}
