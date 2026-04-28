"use client";

import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
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
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/banks", label: "Bancos", icon: Landmark },
  { href: "/expenses", label: "Plantillas", icon: ListChecks },
  { href: "/settings", label: "Configuración", icon: Settings },
  { href: "/about", label: "Sobre Clara", icon: Sparkles },
];

const ADMIN_LINK = { href: "/admin", label: "Administración", icon: Shield };

function shortMonthLabel(monthKey: string): string {
  const date = parse(monthKey, "yyyy-MM", new Date());
  // Spanish abbreviated month + 2-digit year, lowercase ("abr '26").
  const month = format(date, "MMM", { locale: es }).toLowerCase().replace(".", "");
  const year = format(date, "yy");
  return `${month} '${year}`;
}

export function AppHeader({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const balance = useBalance();
  const drawer = useMonthDrawer();
  const [menuOpen, setMenuOpen] = useState(false);
  const navLinks = isAdmin ? [...NAV_LINKS, ADMIN_LINK] : NAV_LINKS;

  const monthLabel = shortMonthLabel(balance.month);
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
          aria-label="Clara home"
          className="flex shrink-0 items-center gap-2.5 focus-visible:outline-none"
        >
          <Image
            src="/ada-avatar.png"
            alt="Clara"
            width={40}
            height={40}
            className="avatar-cleo size-10 shrink-0 rounded-full object-cover"
          />
          <span className="hidden flex-col leading-none sm:flex">
            <span className="display text-base font-bold">Clara</span>
            <span className="text-muted-foreground text-[11px] font-medium">
              tu asistente financiera
            </span>
          </span>
        </Link>

        <button
          type="button"
          onClick={() => drawer.setOpen(true)}
          aria-label="Abrir balance del mes"
          data-testid="balance-pill"
          className="ink-card group ml-1 flex flex-1 items-center gap-3 rounded-full px-4 py-2 text-left transition-transform hover:scale-[1.01]"
        >
          <span className="flex flex-col leading-tight">
            <span className="text-lime text-[10px] font-bold uppercase tracking-[0.2em]">
              balance · {monthLabel}
            </span>
            <span
              className={cn(
                "num text-base sm:text-xl",
                balancePositive ? "text-lime" : "text-hotpink",
              )}
            >
              {balance.loading && !balance.hasRecord ? (
                <span className="text-white/50">—</span>
              ) : (
                formatCurrency(balance.balance, balance.primaryCurrency)
              )}
            </span>
          </span>
          <span className="ml-auto hidden items-center gap-3 sm:flex">
            <span className="h-7 w-px bg-white/15" />
            <span className="flex flex-col text-[11px] leading-tight text-white/70">
              <span>
                pend.{" "}
                <span className="num text-peach">
                  {formatCurrency(balance.remaining, balance.primaryCurrency)}
                </span>
              </span>
              <span>
                ingreso{" "}
                <span className="num text-white/85">
                  {formatCurrency(balance.income, balance.primaryCurrency)}
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
            aria-label="Abrir panel del mes"
          >
            <CalendarDays className="size-4 text-cleo-violet" />
            <span className="ml-1.5 text-xs font-bold">Mes</span>
          </Button>
          {!isHome ? (
            <Link
              href="/app"
              aria-label="Abrir asistente"
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
                  aria-label="Abrir menú"
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
                <DialogTitle className="display">Menú</DialogTitle>
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
                  <CalendarDays className="size-4 text-cleo-violet" /> Panel del mes
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
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 w-full justify-center rounded-2xl"
                  onClick={() => {
                    setMenuOpen(false);
                    void signOut({ callbackUrl: "/login" });
                  }}
                >
                  <LogOut className="size-4" /> Sign out
                </Button>
              </nav>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </header>
  );
}
