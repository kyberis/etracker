"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Curated list of common currencies for the datalist suggestions. Users can
 * still type any 3-letter ISO code; the server validates with `currencySchema`.
 *
 * Order picks Latam-friendly codes first, then EUR/GBP, then majors.
 */
const SUGGESTED_CURRENCIES = [
  "USD",
  "ARS",
  "EUR",
  "BRL",
  "CLP",
  "MXN",
  "UYU",
  "PEN",
  "COP",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
];

type Props = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  id?: string;
  /** Disabled when the parent doesn't want the value to change. */
  disabled?: boolean;
};

/**
 * Three-letter ISO 4217 picker with a `<datalist>` of common codes. Free
 * text input is allowed because we want to support any currency the user
 * mentions; validation happens server-side via `currencySchema`.
 */
export function CurrencyPicker({ value, onChange, className, id, disabled }: Props) {
  const reactId = useId();
  const listId = `currency-picker-${id ?? reactId}`;
  return (
    <>
      <Input
        id={id}
        list={listId}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        maxLength={3}
        spellCheck={false}
        autoCapitalize="characters"
        autoComplete="off"
        placeholder="USD"
        className={cn("uppercase", className)}
      />
      <datalist id={listId}>
        {SUGGESTED_CURRENCIES.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
    </>
  );
}
