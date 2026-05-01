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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { incomeCategoryOptions } from "@/lib/validators";
import { pick, useLocale, useT, useTx } from "@/lib/i18n/client";

type Bank = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  banks: Bank[];
  name: string;
  amount: string;
  /** Empty string = no bank selected. */
  bankId: string;
  category: string;
  /** Currency the user is receiving the income in (3-letter ISO). */
  currency: string;
  /** Optional manual rate override. Empty string when the user wants live FX. */
  fxRateDraft: string;
  /** Whether the income is already received (default true). */
  received: boolean;
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
  onChangeReceived: (v: boolean) => void;
  onSubmit: (e: FormEvent) => void | Promise<void>;
};

/**
 * Diálogo de alta de un cobro al mes en curso. Espejo de
 * `MonthAddLineDialog` con `received` reemplazando a `paid` y `bankId`
 * opcional (los cobros pueden no estar atados a una cuenta concreta).
 */
export function MonthAddIncomeDialog({
  open,
  onOpenChange,
  banks,
  name,
  amount,
  bankId,
  category,
  currency,
  fxRateDraft,
  received,
  primaryCurrency,
  adding,
  error,
  onChangeName,
  onChangeAmount,
  onChangeBankId,
  onChangeCategory,
  onChangeCurrency,
  onChangeFxRateDraft,
  onChangeReceived,
  onSubmit,
}: Props) {
  const t = useT();
  const tx = useTx();
  const locale = useLocale();

  const isForeignCurrency =
    currency.length === 3 && currency.toUpperCase() !== primaryCurrency.toUpperCase();

  const [fetchedRate, setFetchedRate] = useState<{
    pair: string;
    rate: number;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const trimmedFx = fxRateDraft.trim();
  const manualRate = trimmedFx.length > 0 ? Number(trimmedFx) : NaN;

  useEffect(() => {
    if (!open || !isForeignCurrency) return;
    if (trimmedFx.length > 0) return;
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
        if (!Number.isFinite(rate))
          throw new Error(
            pick(locale, { es: "Tipo de cambio inválido.", en: "Invalid exchange rate." }),
          );
        setFetchedRate({ pair, rate });
        setPreviewError(null);
      })
      .catch((err) => {
        if ((err as { name?: string }).name === "AbortError") return;
        setFetchedRate(null);
        setPreviewError(
          err instanceof Error
            ? err.message
            : pick(locale, {
                es: "No pudimos obtener el tipo de cambio.",
                en: "Could not fetch the exchange rate.",
              }),
        );
      });
    return () => controller.abort();
  }, [open, isForeignCurrency, trimmedFx.length, currency, primaryCurrency, locale]);

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
          <DialogTitle>
            {t.month.addIncomeDialogTitle}
            {tx({ es: " (este mes)", en: " (this month)" })}
          </DialogTitle>
          <DialogDescription>
            {tx({
              es: "Solo aplica al mes en curso. No modifica las plantillas de ingreso.",
              en: "Only applies to the current month. Does not change income templates.",
            })}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1">
            <Label className="text-muted-foreground text-xs" htmlFor="add-income-name">
              {t.common.name}
            </Label>
            <Input
              id="add-income-name"
              value={name}
              onChange={(ev) => onChangeName(ev.target.value)}
              required
              placeholder={t.month.addIncomePlaceholderName}
            />
          </div>
          <div className="grid grid-cols-[1fr_5rem] gap-2">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs" htmlFor="add-income-amount">
                {t.common.amount}
              </Label>
              <Input
                id="add-income-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(ev) => onChangeAmount(ev.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-xs" htmlFor="add-income-currency">
                {t.common.currency}
              </Label>
              <CurrencyPicker
                id="add-income-currency"
                value={currency}
                onChange={onChangeCurrency}
              />
            </div>
          </div>
          {isForeignCurrency ? (
            <div className="bg-muted/40 space-y-2 rounded-md border p-2 text-xs">
              <p className="text-muted-foreground">
                {tx({
                  es: (
                    <>
                      Convertimos a <strong>{primaryCurrency}</strong> con el tipo de cambio del
                      momento. Lo guardamos junto al cobro, así los totales no se mueven después.
                    </>
                  ),
                  en: (
                    <>
                      We convert to <strong>{primaryCurrency}</strong> at the current rate. It is
                      stored with the income so totals do not shift later.
                    </>
                  ),
                })}
              </p>
              <div className="flex items-center gap-2">
                <Label className="text-muted-foreground" htmlFor="add-income-fx-rate">
                  {tx({ es: "Tipo de cambio (opcional)", en: "FX rate (optional)" })}
                </Label>
                <Input
                  id="add-income-fx-rate"
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
                  {tx({
                    es: `(tipo ${livePreview.rate.toFixed(4)}).`,
                    en: `(rate ${livePreview.rate.toFixed(4)}).`,
                  })}
                </p>
              ) : null}
              {previewError ? (
                <p className="text-destructive">{previewError}</p>
              ) : null}
            </div>
          ) : null}
          <div className="space-y-1">
            <span className="text-muted-foreground text-xs">
              {tx({ es: "Banco (opcional)", en: "Bank (optional)" })}
            </span>
            <Select
              value={bankId || "__none__"}
              onValueChange={(v) => onChangeBankId(v === "__none__" ? "" : (v ?? ""))}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {bankId
                    ? (banks.find((b) => b.id === bankId)?.name ?? t.common.bank)
                    : tx({ es: "Sin banco", en: "No bank" })}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {tx({ es: "Sin banco", en: "No bank" })}
                </SelectItem>
                {banks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground text-xs">{t.common.category}</span>
            <Select value={category} onValueChange={(v) => onChangeCategory(v ?? "OTROS")}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {category ? category.toLowerCase() : t.common.category}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {incomeCategoryOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c.toLowerCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={received}
              onChange={(ev) => onChangeReceived(ev.target.checked)}
            />
            <span>
              {tx({
                es: "Ya entró la plata (recibido)",
                en: "Money already received",
              })}
            </span>
          </label>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={adding}>
              {adding ? tx({ es: "Agregando…", en: "Adding…" }) : t.common.add}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
