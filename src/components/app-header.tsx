"use client";

import { format, parse } from "date-fns";
import {
  CalendarDays,
  Landmark,
  ListChecks,
  LogOut,
  Menu,
  Settings,
  Shield,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";

import { useBalance } from "@/components/balance-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useMonthDrawer } from "@/components/month-drawer";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
    { href: "/banks", label: t.header.nav.banks, icon: Landmark },
    { href: "/expenses", label: t.header.nav.expenses, icon: ListChecks },
    { href: "/settings", label: t.header.nav.settings, icon: Settings },
    { href: `/${locale}/about`, label: t.header.nav.about, icon: Sparkles },
  ];
  const ADMIN_LINK = { href: "/admin", label: t.header.nav.admin, icon: Shield };
  const navLinks = isAdmin ? [...NAV_LINKS, ADMIN_LINK] : NAV_LINKS;

  const monthLabel = shortMonthLabel(balance.month, locale);
  const balancePositive = balance.balance >= 0;
  const isHome = pathname === "/app" || pathname === "/chat";

  return (
    <header
      className="bg-background/80 supports-backdrop-filter:bg-background/55 sticky top-0 z-30 backdrop-blur-xl"
      data-testid="app-header"
    >
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-5">
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
          <span className="hidden flex-col leading-none sm:flex">
            <span className="display text-base font-bold">{t.brand.name}</span>
            <span className="text-muted-foreground text-[11px] font-medium">
              {t.brand.tagline}
            </span>
          </span>
        </Link>

        <button
          type="button"
          onClick={() => drawer.setOpen(true)}
          aria-label={t.header.balancePillLabel}
          data-testid="balance-pill"
          className="ink-card group ml-1 flex flex-1 items-center gap-3 rounded-full px-4 py-2 text-left transition-transform hover:scale-[1.01]"
        >
          <span className="flex flex-col leading-tight">
            <span className="text-lime text-[10px] font-bold uppercase tracking-[0.2em]">
              {t.header.balancePrefix} · {monthLabel}
            </span>
            <span
              className={cn(
                "num text-base sm:text-xl",
                balancePositive ? "text-lime" : "text-hotpink",
              )}
            >
              {balance.loading && !balance.hasRecord ? (
                <span className="text-white/50">{t.header.placeholderDash}</span>
              ) : (
                formatCurrency(balance.balance, balance.primaryCurrency, locale)
              )}
            </span>
          </span>
          <span className="ml-auto hidden items-center gap-3 sm:flex">
            <span className="h-7 w-px bg-white/15" />
            <span className="flex flex-col text-[11px] leading-tight text-white/70">
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
          </span>
        </button>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden h-10 rounded-full border-transparent bg-card px-4 shadow-sm hover:bg-card sm:inline-flex"
            onClick={() => drawer.setOpen(true)}
            aria-label={t.header.monthPanelLabel}
          >
            <CalendarDays className="size-4 text-lilac" />
            <span className="ml-1.5 text-xs font-bold">{t.header.monthButton}</span>
          </Button>
          {!isHome ? (
            <Link
              href="/app"
              aria-label={t.header.nav.assistant}
              className={cn(
                buttonVariants({ variant: "outline", size: "icon-lg" }),
                "rounded-full border-transparent bg-card shadow-sm hover:bg-card",
              )}
            >
              <Sparkles className="size-4 text-lime-deep" />
            </Link>
          ) : null}

          <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
            <DialogTrigger
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
            </DialogTrigger>
            <DialogContent
              className="w-[min(100vw-2rem,22rem)] rounded-3xl"
              showCloseButton
            >
              <DialogHeader>
                <DialogTitle className="display">{t.header.menuTitle}</DialogTitle>
              </DialogHeader>
              <nav className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    drawer.setOpen(true);
                  }}
                  className="text-foreground hover:bg-muted flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm sm:hidden"
                >
                  <CalendarDays className="size-4 text-lilac" /> {t.header.monthPanelMobile}
                </button>
                {navLinks.map((link) => {
                  const Icon = link.icon;
                  const active =
                    pathname === link.href || pathname.startsWith(`${link.href}/`);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                        active && "bg-muted text-foreground",
                      )}
                    >
                      <Icon className="size-4" /> {link.label}
                    </Link>
                  );
                })}
                <div className="mt-1 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
                  <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                    {t.header.languageLabel}
                  </span>
                  <LanguageSwitcher variant="app" />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 w-full justify-center rounded-2xl"
                  onClick={() => {
                    setMenuOpen(false);
                    void signOut({ callbackUrl: "/login" });
                  }}
                >
                  <LogOut className="size-4" /> {t.header.signOut}
                </Button>
              </nav>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
