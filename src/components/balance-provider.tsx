"use client";

import { format } from "date-fns";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { BalanceResponse } from "@/app/api/months/[month]/balance/route";

type BalanceState = {
  month: string;
  hasRecord: boolean;
  income: number;
  /** ISO 4217 currency for income/totals/balance — always the user's primary. */
  primaryCurrency: string;
  planned: number;
  paid: number;
  remaining: number;
  balance: number;
  loading: boolean;
};

type BalanceContextValue = BalanceState & {
  /** Re-fetch the active month. Call after any AI/manual mutation. */
  refresh: () => Promise<void>;
  /** Override the active month (otherwise inferred from URL). */
  setMonth: (month: string) => void;
};

const BalanceContext = createContext<BalanceContextValue | null>(null);

const MONTH_RE = /^\d{4}-\d{2}$/;

function currentMonthKey(): string {
  return format(new Date(), "yyyy-MM");
}

/**
 * Pick the month that should drive the balance:
 *   1. `?month=` query param (any page)
 *   2. `/m/<yyyy-MM>` segment in the pathname
 *   3. Current month (UTC, matches the API).
 */
function resolveActiveMonth(pathname: string, search: URLSearchParams): string {
  const fromQuery = search.get("month");
  if (fromQuery && MONTH_RE.test(fromQuery)) return fromQuery;
  const m = pathname.match(/^\/m\/(\d{4}-\d{2})(?:\/|$)/);
  if (m?.[1]) return m[1];
  return currentMonthKey();
}

const initialState = (month: string): BalanceState => ({
  month,
  hasRecord: false,
  income: 0,
  primaryCurrency: "USD",
  planned: 0,
  paid: 0,
  remaining: 0,
  balance: 0,
  loading: true,
});

export function BalanceProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const inferredMonth = useMemo(
    () => resolveActiveMonth(pathname, searchParams),
    [pathname, searchParams],
  );

  // Allow callers to override the active month (e.g. drawer showing another
  // month than the URL) via `setMonth`. URL changes still win until override.
  const [overrideMonth, setOverrideMonth] = useState<string | null>(null);
  const activeMonth = overrideMonth ?? inferredMonth;

  const [state, setState] = useState<BalanceState>(() => initialState(activeMonth));
  const inflightRef = useRef<AbortController | null>(null);

  // Pure side-effectful fetch: no synchronous setState before the network
  // call (React 19's `set-state-in-effect` lint forbids that). State is
  // mutated only after `await`, which runs after the effect completes.
  const fetchBalance = useCallback(async (month: string) => {
    inflightRef.current?.abort();
    const controller = new AbortController();
    inflightRef.current = controller;
    try {
      const res = await fetch(`/api/months/${month}/balance`, {
        signal: controller.signal,
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) {
        setState((s) => ({ ...s, month, loading: false }));
        return;
      }
      const payload = (await res.json()) as BalanceResponse;
      setState({
        month: payload.month,
        hasRecord: payload.hasRecord,
        income: payload.income,
        primaryCurrency: payload.primaryCurrency,
        planned: payload.totals.planned,
        paid: payload.totals.paid,
        remaining: payload.totals.remaining,
        balance: payload.balance,
        loading: false,
      });
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      setState((s) => ({ ...s, month, loading: false }));
    }
  }, []);

  // Re-fetch whenever the active month changes (URL nav or override).
  // The setState inside `fetchBalance` runs only after `await`, which the
  // React docs explicitly allow, but the React 19 lint can't trace it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch updates after await
    void fetchBalance(activeMonth);
  }, [activeMonth, fetchBalance]);

  const refresh = useCallback(async () => {
    await fetchBalance(activeMonth);
  }, [activeMonth, fetchBalance]);

  const setMonth = useCallback((month: string) => {
    if (!MONTH_RE.test(month)) return;
    setOverrideMonth(month);
  }, []);

  const value = useMemo<BalanceContextValue>(
    () => ({ ...state, refresh, setMonth }),
    [state, refresh, setMonth],
  );

  return <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>;
}

/** Read the current balance from the shell. Throws if used outside `BalanceProvider`. */
export function useBalance(): BalanceContextValue {
  const ctx = useContext(BalanceContext);
  if (!ctx) {
    throw new Error("useBalance must be used inside <BalanceProvider>.");
  }
  return ctx;
}
