"use client";

import { format } from "date-fns";
import { Menu, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { signOut } from "next-auth/react";

import { cn } from "@/lib/utils";

import { Logo } from "@/components/logo";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type NavLink = {
  href: string;
  label: string;
  isActive?: (pathname: string) => boolean;
};

export function AppNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const monthKey = format(new Date(), "yyyy-MM");

  const links: NavLink[] = [
    {
      href: `/m/${monthKey}`,
      label: "Dashboard",
      isActive: (p) => p.startsWith("/m/"),
    },
    { href: "/banks", label: "Banks" },
    { href: "/expenses", label: "Expenses" },
    { href: "/settings", label: "Configuración" },
  ];

  const chatHref = useMemo(() => {
    const m = pathname.match(/^\/m\/(\d{4}-\d{2})(?:\/|$)/);
    return m?.[1] ? `/chat?month=${encodeURIComponent(m[1])}` : "/chat";
  }, [pathname]);

  const linkClass = (link: NavLink) => {
    const isActive = link.isActive
      ? link.isActive(pathname)
      : pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
    return cn(
      "text-muted-foreground hover:bg-muted hover:text-foreground rounded-md px-3 py-2 text-sm md:px-3 md:py-1.5",
      isActive && "bg-muted text-foreground",
    );
  };

  return (
    <header className="bg-background border-b">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl items-center justify-between gap-2 px-4 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
          <Link
            href="/"
            className="focus-visible:ring-ring focus-visible:ring-offset-background shrink-0 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            aria-label="eTracker home"
          >
            <Logo size="md" />
          </Link>
          <nav className="text-muted-foreground hidden min-w-0 items-center gap-1 md:flex md:gap-2">
            {links.map((link) => (
              <Link key={link.label} href={link.href} className={linkClass(link)}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={chatHref}
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              pathname.startsWith("/chat") && "bg-muted ring-ring/50 ring-2",
            )}
            aria-label="Asistente de gastos"
            title="Asistente de gastos"
          >
            <Sparkles className="size-4" />
          </Link>
          <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open menu"
                />
              }
            >
              <Menu className="size-4" />
            </DialogTrigger>
            <DialogContent className="w-[min(100vw-2rem,20rem)]" showCloseButton>
              <DialogHeader>
                <DialogTitle>Menu</DialogTitle>
              </DialogHeader>
              <nav className="flex flex-col gap-1">
                {links.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={linkClass(link)}
                    onClick={() => setMobileOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2 w-full"
                  onClick={() => {
                    setMobileOpen(false);
                    void signOut({ callbackUrl: "/login" });
                  }}
                >
                  Sign out
                </Button>
              </nav>
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="sm"
            className="hidden md:inline-flex"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
