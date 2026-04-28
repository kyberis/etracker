import Link from "next/link";

import { getAuthSession } from "@/lib/auth";
import { Logo } from "@/components/logo";
import { SOURCE_URL, SITE_NAME, SITE_TAGLINE } from "@/lib/seo";

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/about", label: "Sobre Clara" },
  { href: "/faq", label: "FAQ" },
  { href: "/changelog", label: "Changelog" },
];

export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAuthSession();
  const isLoggedIn = Boolean(session?.user?.id);

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <header className="border-border/40 sticky top-0 z-30 border-b backdrop-blur-xl supports-backdrop-filter:bg-background/70">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
          <Link
            href="/"
            aria-label={`${SITE_NAME} — ${SITE_TAGLINE}`}
            className="flex shrink-0 items-center gap-2.5"
          >
            <Logo size="md" />
          </Link>
          <nav
            aria-label="Navegación principal"
            className="text-muted-foreground hidden items-center gap-5 text-sm md:flex"
          >
            {NAV_LINKS.map(({ href, label }) => (
              <Link key={href} href={href} className="hover:text-foreground transition-colors">
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={SOURCE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground hidden text-sm transition-colors sm:inline-flex"
            >
              GitHub
            </Link>
            {isLoggedIn ? (
              <Link
                href="/app"
                className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold shadow-sm transition-colors"
              >
                Abrir Clara
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-foreground hover:text-foreground/80 hidden h-9 items-center rounded-full px-4 text-sm font-medium sm:inline-flex"
                >
                  Iniciar sesión
                </Link>
                <Link
                  href="/register"
                  className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold shadow-sm transition-colors"
                >
                  Crear cuenta
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-border/40 mt-16 border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
          <div className="grid gap-8 md:grid-cols-4">
            <div className="md:col-span-2">
              <Logo size="md" />
              <p className="text-muted-foreground mt-3 max-w-xs text-sm">
                Tu asistente financiera con IA. Open source, MIT, self-hostable.
              </p>
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-semibold">Producto</p>
              <ul className="text-muted-foreground space-y-1.5">
                <li>
                  <Link href="/features" className="hover:text-foreground">
                    Features
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="hover:text-foreground">
                    Sobre Clara
                  </Link>
                </li>
                <li>
                  <Link href="/faq" className="hover:text-foreground">
                    FAQ
                  </Link>
                </li>
                <li>
                  <Link href="/changelog" className="hover:text-foreground">
                    Changelog
                  </Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-foreground">
                    Privacidad
                  </Link>
                </li>
              </ul>
            </div>
            <div className="space-y-2 text-sm">
              <p className="font-semibold">Para AIs</p>
              <ul className="text-muted-foreground space-y-1.5">
                <li>
                  <Link href="/llms.txt" className="hover:text-foreground">
                    /llms.txt
                  </Link>
                </li>
                <li>
                  <Link href="/llms-full.txt" className="hover:text-foreground">
                    /llms-full.txt
                  </Link>
                </li>
                <li>
                  <Link href="/api/mcp" className="hover:text-foreground">
                    /api/mcp (público)
                  </Link>
                </li>
                <li>
                  <Link href="/.well-known/mcp.json" className="hover:text-foreground">
                    /.well-known/mcp.json
                  </Link>
                </li>
                <li>
                  <Link href="/openapi.json" className="hover:text-foreground">
                    /openapi.json
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-border/40 text-muted-foreground mt-10 flex flex-col items-center justify-between gap-3 border-t pt-6 text-xs sm:flex-row">
            <p>© {new Date().getFullYear()} Trefolio · MIT License</p>
            <div className="flex gap-4">
              <Link href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">
                GitHub
              </Link>
              <Link
                href="https://trefolio.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground"
              >
                trefolio.com
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
