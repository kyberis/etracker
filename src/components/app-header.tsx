"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { format, parse } from "date-fns";
import {
  CalendarDays,
  Landmark,
  ListChecks,
  LogOut,
  Menu,
  PiggyBank,
  Settings,
  Shield,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";

import { useBalance } from "@/components/balance-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useMonthDrawer } from "@/components/month-drawer";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { useLocale, useT } from "@/lib/i18n/client";
import { dateLocale } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

function shortMonthLabel(monthKey: string, locale: ReturnType<typeof useLocale>): string {
  const date = parse(monthKey, "yyyy-MM", new Date());
  // Locale-aware abbreviated month + 2-digit year, lowercase ("abr '26" / "apr '26").
  const month = format(date, "MMM", { locale: dateLocale(locale) })
    .toLowerCase()
    .replace(".", "");
  const year = format(date, "yy");
  return `${month} '${year}`;
}

export function AppHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const balance = useBalance();
  const drawer = useMonthDrawer();
  const t = useT();
  const locale = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);

  const NAV_LINKS = [
    {
      href: "/app",
      label: t.header.nav.assistant,
      icon: Sparkles,
      // The assistant home also "owns" /chat and the dedicated month pages —
      // they're all surfaces of the same monthly experience.
      match: (p: string) =>
        p === "/app" || p === "/chat" || p.startsWith("/m/") || p.startsWith("/app/"),
    },
    {
      href: "/banks",
      label: t.header.nav.banks,
      icon: Landmark,
      match: (p: string) => p === "/banks" || p.startsWith("/banks/"),
    },
    {
      href: "/expenses",
      label: t.header.nav.expenses,
      icon: ListChecks,
      match: (p: string) => p === "/expenses" || p.startsWith("/expenses/"),
    },
    {
      href: "/savings",
      label: t.header.nav.savings,
      icon: PiggyBank,
      match: (p: string) => p === "/savings" || p.startsWith("/savings/"),
    },
    {
      href: "/settings",
      label: t.header.nav.settings,
      icon: Settings,
      match: (p: string) => p === "/settings" || p.startsWith("/settings/"),
    },
  ];
  if (isAdmin) {
    NAV_LINKS.push({
      href: "/admin",
      label: t.header.nav.admin,
      icon: Shield,
      match: (p: string) => p === "/admin" || p.startsWith("/admin/"),
    });
  }

  const monthLabel = shortMonthLabel(balance.month, locale);
  const balancePositive = balance.balance >= 0;
  const balanceText =
    balance.loading && !balance.hasRecord
      ? t.header.placeholderDash
      : formatCurrency(balance.balance, balance.primaryCurrency, locale);

  return (
    <header
      className="bg-background/80 supports-backdrop-filter:bg-background/55 sticky top-0 z-30 backdrop-blur-xl"
      data-testid="app-header"
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-5">
        <Link
          href="/app"
          aria-label={t.brand.homeLabel}
          className="flex shrink-0 items-center gap-2.5 focus-visible:outline-none"
        >
          <Image
            src="/ada-avatar.png"
            alt={t.brand.avatarAlt}
            width={40}
            height={40}
            className="avatar-clara size-10 shrink-0 rounded-full object-cover"
          />
          <span className="hidden flex-col leading-none sm:flex lg:flex">
            <span className="display text-base font-bold">{t.brand.name}</span>
            <span className="text-muted-foreground text-[11px] font-medium">
              {t.brand.tagline}
            </span>
          </span>
        </Link>

        {/* Mobile-only balance pill (visible <md). On desktop the inline nav
            takes this slot and the compact balance chip moves to the right. */}
        <button
          type="button"
          onClick={() => drawer.setOpen(true)}
          aria-label={t.header.balancePillLabel}
          data-testid="balance-pill"
          className="ink-card group ml-1 flex flex-1 items-center gap-3 rounded-full px-4 py-2 text-left transition-transform hover:scale-[1.01] md:hidden"
        >
          <span className="flex flex-col leading-tight">
            <span className="text-lime text-[10px] font-bold uppercase tracking-[0.2em]">
              {t.header.balancePrefix} · {monthLabel}
            </span>
            <span
              className={cn(
                "num text-base",
                balancePositive ? "text-lime" : "text-hotpink",
              )}
            >
              {balance.loading && !balance.hasRecord ? (
                <span className="text-white/50">{t.header.placeholderDash}</span>
              ) : (
                balanceText
              )}
            </span>
          </span>
        </button>

        {/* Desktop spacer — pushes the right cluster (balance + menu) to
            the edge now that nav links live inside the hamburger menu. */}
        <div className="hidden flex-1 md:block" />

        <div className="flex shrink-0 items-center gap-1.5">
          {/* Desktop balance pill (md+). Two-line layout matches the mobile
              pill but stays compact: small uppercase prefix on top, primary
              amount underneath, with optional pending/income context on lg+. */}
          <button
            type="button"
            onClick={() => drawer.setOpen(true)}
            aria-label={t.header.balancePillLabel}
            data-testid="balance-pill-compact"
            className="ink-card group hidden h-12 items-center gap-3 rounded-full px-4 text-left transition-transform hover:scale-[1.01] md:inline-flex"
          >
            <span className="flex flex-col leading-tight">
              <span className="text-lime text-[10px] font-bold uppercase tracking-[0.2em]">
                {t.header.balancePrefix} · {monthLabel}
              </span>
              <span
                className={cn(
                  "num text-base",
                  balancePositive ? "text-lime" : "text-hotpink",
                )}
              >
                {balanceText}
              </span>
            </span>
            <span className="hidden h-7 w-px bg-white/15 lg:block" aria-hidden />
            <span className="hidden text-[11px] leading-tight text-white/70 lg:flex lg:flex-col lg:items-end">
              <span>
                {t.header.pendingShort}{" "}
                <span className="num text-peach">
                  {formatCurrency(balance.remaining, balance.primaryCurrency, locale)}
                </span>
              </span>
              <span>
                {t.header.incomeShort}{" "}
                <span className="num text-white/85">
                  {formatCurrency(balance.income, balance.primaryCurrency, locale)}
                </span>
              </span>
            </span>
          </button>

          {/* Mobile: kept-from-before "Mes" quick button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden h-10 rounded-full border-transparent bg-card px-4 shadow-sm hover:bg-card sm:inline-flex md:hidden"
            onClick={() => drawer.setOpen(true)}
            aria-label={t.header.monthPanelLabel}
          >
            <CalendarDays className="size-4 text-lilac" />
            <span className="ml-1.5 text-xs font-bold">{t.header.monthButton}</span>
          </Button>

          {/* Hamburger menu (used on every breakpoint — desktop nav links
              live here for a cleaner header). Renders as a full-height
              side sheet sliding in from the right corner where the
              hamburger sits, instead of a centered modal. */}
          <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogPrimitive.Trigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  className="rounded-full border-transparent bg-card shadow-sm hover:bg-card"
                  aria-label={t.header.openMenu}
                />
              }
            >
              <Menu className="size-4" />
            </DialogPrimitive.Trigger>
            <DialogPrimitive.Portal>
              <DialogPrimitive.Backdrop
                className="data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 z-50 bg-black/40 backdrop-blur-sm duration-200"
              />
              <DialogPrimitive.Popup
                className="bg-popover text-popover-foreground data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right ring-foreground/10 fixed top-0 right-0 z-50 flex h-dvh w-full max-w-sm flex-col gap-0 overflow-hidden rounded-l-3xl shadow-2xl ring-1 outline-none duration-200 ease-out"
              >
                <header className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
                  <div className="flex items-center gap-3">
                    <Image
                      src="/clara-avatar-simple.png"
                      alt=""
                      width={40}
                      height={40}
                      className="avatar-clara size-10 rounded-full object-cover"
                      aria-hidden
                    />
                    <div className="flex flex-col leading-tight">
                      <DialogPrimitive.Title className="display text-lg font-bold">
                        {t.header.menuTitle}
                      </DialogPrimitive.Title>
                      <span className="text-muted-foreground text-xs">
                        {t.brand.tagline}
                      </span>
                    </div>
                  </div>
                  <DialogPrimitive.Close
                    render={
                      <Button
                        variant="ghost"
                        size="icon-lg"
                        className="rounded-full"
                        aria-label={t.common.close}
                      />
                    }
                  >
                    <X className="size-4" />
                  </DialogPrimitive.Close>
                </header>

                <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
                  <p className="text-muted-foreground/80 px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-[0.18em]">
                    {t.header.menuTitle}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      drawer.setOpen(true);
                    }}
                    className="text-foreground hover:bg-muted/70 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-semibold transition-colors"
                  >
                    <span className="bg-lilac/15 text-lilac flex size-9 items-center justify-center rounded-xl">
                      <CalendarDays className="size-4" />
                    </span>
                    {t.header.monthPanelMobile}
                  </button>
                  {NAV_LINKS.map((link) => {
                    const Icon = link.icon;
                    const active = link.match(pathname);
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition-colors",
                          active
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-9 items-center justify-center rounded-xl",
                            active
                              ? "bg-lime/25 text-lime"
                              : "bg-muted/60 text-muted-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        {link.label}
                      </Link>
                    );
                  })}
                  <Link
                    href={`/${locale}/about`}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition-colors",
                      pathname.startsWith(`/${locale}/about`)
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 items-center justify-center rounded-xl",
                        pathname.startsWith(`/${locale}/about`)
                          ? "bg-lime/25 text-lime"
                          : "bg-muted/60 text-muted-foreground",
                      )}
                    >
                      <Sparkles className="size-4" />
                    </span>
                    {t.header.nav.about}
                  </Link>
                </nav>

                <footer className="bg-muted/30 border-foreground/5 flex flex-col gap-3 border-t px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-[0.18em]">
                      {t.header.languageLabel}
                    </span>
                    <LanguageSwitcher variant="app" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-center rounded-2xl"
                    onClick={() => {
                      setMenuOpen(false);
                      void signOut({ callbackUrl: "/login" });
                    }}
                  >
                    <LogOut className="size-4" /> {t.header.signOut}
                  </Button>
                </footer>
              </DialogPrimitive.Popup>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>
        </div>
      </div>
    </header>
  );
}
