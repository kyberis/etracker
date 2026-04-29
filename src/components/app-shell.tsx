"use client";

import { Suspense, type ReactNode } from "react";

import { AppHeader } from "@/components/app-header";
import { BalanceProvider } from "@/components/balance-provider";
import { DevTools } from "@/components/dev-tools";
import { MonthDrawerProvider } from "@/components/month-drawer";

/**
 * Shared shell for every authenticated route. Mounts the balance provider,
 * the month drawer (sheet on mobile, side panel on desktop) and the sticky
 * header showing the active-month balance.
 *
 * `useSearchParams` inside `BalanceProvider` requires a Suspense boundary in
 * Next 16 to keep static optimization happy.
 */
export function AppShell({
  children,
  isAdmin = false,
}: {
  children: ReactNode;
  isAdmin?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <BalanceProvider>
        <MonthDrawerProvider>
          <div className="flex min-h-dvh flex-col">
            <AppHeader isAdmin={isAdmin} />
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </div>
          <DevTools />
        </MonthDrawerProvider>
      </BalanceProvider>
    </Suspense>
  );
}
