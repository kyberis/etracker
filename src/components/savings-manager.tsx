"use client";

import { format, parse } from "date-fns";
import { ArrowDownToLine, ArrowUpFromLine, Trash2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/format";
import { useLocale, useTx } from "@/lib/i18n/client";
import { dateLocale } from "@/lib/i18n/format";

type Movement = {
  id: string;
  kind:
    | "MONTHLY_CONTRIBUTION"
    | "CARRYOVER_DEPOSIT"
    | "DEBT_COVERAGE"
    | "MANUAL_DEPOSIT"
    | "MANUAL_WITHDRAWAL";
  amount: number;
  currency: string;
  note: string | null;
  monthRecordId: string | null;
  monthKey: string | null;
  occurredOn: string;
  createdAt: string;
};

type Initial = {
  balance: number;
  currency: string;
  movements: Movement[];
};

type DialogMode = "deposit" | "withdraw" | null;

export function SavingsManager({ initial }: { initial: Initial }) {
  const locale = useLocale();
  const tx = useTx();

  const [balance, setBalance] = useState(initial.balance);
  const [movements, setMovements] = useState(initial.movements);
  const [dialog, setDialog] = useState<DialogMode>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fmt = (value: number) => formatCurrency(value, initial.currency, locale);

  const kindLabels = useMemo(
    () => ({
      MONTHLY_CONTRIBUTION: tx({ es: "Aporte mensual", en: "Monthly contribution" }),
      CARRYOVER_DEPOSIT: tx({ es: "Sobrante del mes", en: "Month leftover" }),
      DEBT_COVERAGE: tx({ es: "Cobertura de deuda", en: "Debt coverage" }),
      MANUAL_DEPOSIT: tx({ es: "Depósito manual", en: "Manual deposit" }),
      MANUAL_WITHDRAWAL: tx({ es: "Retiro manual", en: "Manual withdrawal" }),
    }),
    [tx],
  );

  function isMutable(kind: Movement["kind"]) {
    return kind === "MANUAL_DEPOSIT" || kind === "MANUAL_WITHDRAWAL";
  }

  function openDialog(mode: "deposit" | "withdraw") {
    setError(null);
    setAmount("");
    setNote("");
    setDialog(mode);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError(tx({ es: "Monto inválido.", en: "Invalid amount." }));
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/savings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: dialog === "deposit" ? "MANUAL_DEPOSIT" : "MANUAL_WITHDRAWAL",
        amount: parsed,
        note: note.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? tx({ es: "No se pudo guardar.", en: "Could not save." }));
      return;
    }
    const payload = (await res.json()) as { movement: Movement; balance: number };
    setMovements((current) => [payload.movement, ...current]);
    setBalance(payload.balance);
    setDialog(null);
  }

  async function onDelete(id: string) {
    if (
      !window.confirm(
        tx({ es: "¿Borrar este movimiento?", en: "Delete this movement?" }),
      )
    ) {
      return;
    }
    setDeletingId(id);
    const res = await fetch(`/api/savings/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      setError(payload.error ?? tx({ es: "No se pudo borrar.", en: "Could not delete." }));
      return;
    }
    const payload = (await res.json()) as { balance: number };
    setMovements((current) => current.filter((m) => m.id !== id));
    setBalance(payload.balance);
  }

  return (
    <div className="space-y-6">
      <Card className="border-lilac/40 bg-lilac/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-muted-foreground text-sm">
            {tx({ es: "Pila de ahorros", en: "Savings pile" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-lilac num text-3xl">{fmt(balance)}</p>
          <p className="text-muted-foreground text-xs">
            {tx({
              es: "Es la pila global de ahorros. No es por mes: cada movimiento queda registrado abajo.",
              en: "Global savings pile (not per-month). Every movement is logged below.",
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => openDialog("deposit")}>
              <ArrowDownToLine className="size-4" />{" "}
              {tx({ es: "Depositar", en: "Deposit" })}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => openDialog("withdraw")}
              disabled={balance <= 0}
            >
              <ArrowUpFromLine className="size-4" />{" "}
              {tx({ es: "Retirar", en: "Withdraw" })}
            </Button>
          </div>
          {error && !dialog ? (
            <p className="text-destructive text-sm">{error}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tx({ es: "Movimientos", en: "Movements" })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {movements.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {tx({
                es: "Todavía no hay movimientos. Cuando dejes aparte un sobrante o cargues un aporte, aparece acá.",
                en: "No movements yet. They show up here when you set aside leftovers or log contributions.",
              })}
            </p>
          ) : (
            <ul className="divide-foreground/10 divide-y">
              {movements.map((m) => {
                const isPositive = m.amount >= 0;
                return (
                  <li
                    key={m.id}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-semibold">
                        {kindLabels[m.kind]}
                        {m.note ? (
                          <span className="text-muted-foreground font-normal">
                            {" "}· {m.note}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {format(parse(m.occurredOn, "yyyy-MM-dd", new Date()), "dd MMM yyyy", {
                          locale: dateLocale(locale),
                        })}
                        {m.monthKey ? (
                          <>
                            {" · "}
                            <Link
                              href={`/m/${m.monthKey}`}
                              className="underline hover:no-underline"
                            >
                              {m.monthKey}
                            </Link>
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={
                          "num text-sm tabular-nums " +
                          (isPositive ? "text-good" : "text-bad")
                        }
                      >
                        {isPositive ? "+" : ""}
                        {formatCurrency(m.amount, m.currency, locale)}
                      </span>
                      {isMutable(m.kind) ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={tx({ es: "Borrar movimiento", en: "Delete movement" })}
                          onClick={() => void onDelete(m.id)}
                          disabled={deletingId === m.id}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialog !== null} onOpenChange={(open) => (open ? null : setDialog(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === "deposit"
                ? tx({ es: "Depositar a ahorro", en: "Deposit to savings" })
                : tx({ es: "Retirar de ahorro", en: "Withdraw from savings" })}
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="savings-amount">
                {tx({ es: "Monto", en: "Amount" })} ({initial.currency})
              </Label>
              <Input
                id="savings-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="savings-note">
                {tx({ es: "Nota (opcional)", en: "Note (optional)" })}
              </Label>
              <Input
                id="savings-note"
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder={
                  dialog === "deposit"
                    ? tx({ es: "Aguinaldo", en: "Bonus" })
                    : tx({ es: "Vacaciones", en: "Vacation" })
                }
              />
            </div>
            {error ? <p className="text-destructive text-sm">{error}</p> : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialog(null)}
                disabled={busy}
              >
                {tx({ es: "Cancelar", en: "Cancel" })}
              </Button>
              <Button type="submit" disabled={busy}>
                {busy
                  ? tx({ es: "Guardando…", en: "Saving…" })
                  : tx({ es: "Guardar", en: "Save" })}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
