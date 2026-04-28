"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { CurrencyPicker } from "@/components/ui/currency-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { expenseCategoryOptions } from "@/lib/validators";

type Bank = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  banks: Bank[];
  name: string;
  amount: string;
  bankId: string;
  category: string;
  /** Currency the user is charging the expense in (3-letter ISO). */
  currency: string;
  /** Optional manual rate override. Empty string when the user wants live FX. */
  fxRateDraft: string;
  /** User's primary currency — used to decide whether to surface FX inputs. */
  primaryCurrency: string;
  adding: boolean;
  error: string | null;
  onChangeName: (v: string) => void;
  onChangeAmount: (v: string) => void;
  onChangeBankId: (v: string) => void;
  onChangeCategory: (v: string) => void;
  onChangeCurrency: (v: string) => void;
  onChangeFxRateDraft: (v: string) => void;
  onSubmit: (e: FormEvent) => void | Promise<void>;
};

export function MonthAddLineDialog({
  open,
  onOpenChange,
  banks,
  name,
  amount,
  bankId,
  category,
  currency,
  fxRateDraft,
  primaryCurrency,
  adding,
  error,
  onChangeName,
  onChangeAmount,
  onChangeBankId,
  onChangeCategory,
  onChangeCurrency,
  onChangeFxRateDraft,
  onSubmit,
}: Props) {
  const isForeignCurrency =
    currency.length === 3 && currency.toUpperCase() !== primaryCurrency.toUpperCase();

  // Holds the live (server-fetched) rate for the current currency pair. We
  // only set it after the network resolves, so the React 19 lint never sees
  // a synchronous setState inside the effect body.
  const [fetchedRate, setFetchedRate] = useState<{
    pair: string;
    rate: number;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const trimmedFx = fxRateDraft.trim();
  const manualRate = trimmedFx.length > 0 ? Number(trimmedFx) : NaN;

  // Fetch a fresh rate whenever the user changes currency / primaryCurrency
  // and there's no manual override. Effect body is purely network → setState
  // after `await`, which the React 19 lint allows.
  useEffect(() => {
    if (!open || !isForeignCurrency) return;
    if (trimmedFx.length > 0) return; // manual override wins
    const pair = `${currency.toUpperCase()}->${primaryCurrency.toUpperCase()}`;
    const controller = new AbortController();
    const url = `/api/fx/rate?from=${encodeURIComponent(currency)}&to=${encodeURIComponent(primaryCurrency)}`;
    fetch(url, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const body = (await res.json()) as { fxRate: string };
        const rate = Number(body.fxRate);
        if (!Number.isFinite(rate)) throw new Error("Tipo de cambio inválido.");
        setFetchedRate({ pair, rate });
        setPreviewError(null);
      })
      .catch((err) => {
        if ((err as { name?: string }).name === "AbortError") return;
        setFetchedRate(null);
        setPreviewError(
          err instanceof Error ? err.message : "No pudimos obtener el tipo de cambio.",
        );
      });
    return () => controller.abort();
  }, [open, isForeignCurrency, trimmedFx.length, currency, primaryCurrency]);

  // Derived value: prefer the manual override; otherwise use the latest
  // fetched rate (only when the pair actually matches the current inputs).
  const livePreview = useMemo<{ rate: number; converted: number } | null>(() => {
    if (!isForeignCurrency) return null;
    const amt = Number(amount);
    if (Number.isFinite(manualRate) && manualRate > 0) {
      return {
        rate: manualRate,
        converted: Number.isFinite(amt) ? amt * manualRate : 0,
      };
    }
    const pair = `${currency.toUpperCase()}->${primaryCurrency.toUpperCase()}`;
    if (fetchedRate && fetchedRate.pair === pair) {
      return {
        rate: fetchedRate.rate,
        converted: Number.isFinite(amt) ? amt * fetchedRate.rate : 0,
      };
    }
    return null;
  }, [isForeignCurrency, amount, manualRate, currency, primaryCurrency, fetchedRate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(90vh,640px)] overflow-y-auto sm:max-w-md"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle>Nuevo gasto (este mes)</DialogTitle>
          <DialogDescription>
            Solo aplica al mes en curso. No modifica las definiciones.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-muted-foreground text-xs" htmlFor="add-name">
              Nombre
            </label>
            <Input
              id="add-name"
              value={name}
              onChange={(ev) => onChangeName(ev.target.value)}
              required
              placeholder="Ej. Regalo, extra…"
            />
          </div>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs" htmlFor="add-amount">
                Monto
              </label>
              <Input
                id="add-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(ev) => onChangeAmount(ev.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <label className="text-muted-foreground text-xs" htmlFor="add-currency">
                Moneda
              </label>
              <CurrencyPicker
                id="add-currency"
                value={currency}
                onChange={onChangeCurrency}
              />
            </div>
          </div>
          {isForeignCurrency ? (
            <div className="bg-muted/40 space-y-2 rounded-md border p-2 text-xs">
              <p className="text-muted-foreground">
                Convertimos a <strong>{primaryCurrency}</strong> con el tipo de cambio del
                momento. Lo guardamos junto al gasto, así los totales no se mueven después.
              </p>
              <div className="flex items-center gap-2">
                <label className="text-muted-foreground" htmlFor="add-fx-rate">
                  Rate (opcional)
                </label>
                <Input
                  id="add-fx-rate"
                  type="number"
                  min="0"
                  step="0.0001"
                  value={fxRateDraft}
                  placeholder={livePreview ? livePreview.rate.toFixed(4) : "auto"}
                  onChange={(ev) => onChangeFxRateDraft(ev.target.value)}
                  className="h-7 max-w-[8rem] text-xs"
                />
                <span className="text-muted-foreground">
                  1 {currency.toUpperCase()} →
                </span>
              </div>
              {livePreview ? (
                <p className="text-muted-foreground">
                  ≈{" "}
                  <strong className="text-foreground tabular-nums">
                    {livePreview.converted.toFixed(2)} {primaryCurrency}
                  </strong>{" "}
                  (rate {livePreview.rate.toFixed(4)}).
                </p>
              ) : null}
              {previewError ? (
                <p className="text-destructive">{previewError}</p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1">
            <span className="text-muted-foreground text-xs">Banco</span>
            <Select value={bankId} onValueChange={(v) => onChangeBankId(v ?? "")} required>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {bankId
                    ? (banks.find((b) => b.id === bankId)?.name ?? "Banco")
                    : "Elegir banco"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground text-xs">Categoría</span>
            <Select value={category} onValueChange={(v) => onChangeCategory(v ?? "OTROS")}>
              <SelectTrigger className="w-full">
                <SelectValue>{category ? category.toLowerCase() : "Categoría"}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {expenseCategoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={adding}>
              {adding ? "Agregando…" : "Agregar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
