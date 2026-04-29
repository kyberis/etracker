import Link from "next/link";
import { notFound } from "next/navigation";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Logo } from "@/components/logo";
import { getAuthSession } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n/client";
import { getDict } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n/locale";
import { SITE_NAME, SOURCE_URL, siteTagline } from "@/lib/seo";

export function generateStaticParams() {
  return [{ lang: "es" }, { lang: "en" }];
}

export default async function MarketingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const locale: Locale = lang;
  const t = getDict(locale);
  const session = await getAuthSession();
  const isLoggedIn = Boolean(session?.user?.id);

  const home = `/${locale}`;

  const navLinks: { href: string; label: string }[] = [
    { href: `${home}/features`, label: t.marketingNav.features },
    { href: `${home}/about`, label: t.marketingNav.about },
    { href: `${home}/faq`, label: t.marketingNav.faq },
    { href: `${home}/changelog`, label: t.marketingNav.changelog },
  ];

  return (
    <LocaleProvider locale={locale}>
      <div className="bg-background text-foreground flex min-h-screen flex-col">
        <header className="border-border/40 sticky top-0 z-30 border-b backdrop-blur-xl supports-backdrop-filter:bg-background/70">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-6 px-4 py-3 sm:px-6">
            <Link
              href={home}
              aria-label={`${SITE_NAME} — ${siteTagline(locale)}`}
              className="flex shrink-0 items-center gap-2.5"
            >
              <Logo size="md" />
            </Link>
            <nav
              aria-label={t.marketingNav.primaryNavLabel}
              className="text-muted-foreground hidden items-center gap-5 text-sm md:flex"
            >
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="hover:text-foreground transition-colors"
                >
                  {label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <LanguageSwitcher
                variant="marketing"
                currentPath={`${home}`}
                authenticated={isLoggedIn}
              />
              <Link
                href={SOURCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground hidden text-sm transition-colors sm:inline-flex"
              >
                {t.marketingNav.github}
              </Link>
              {isLoggedIn ? (
                <Link
                  href="/app"
                  className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold shadow-sm transition-colors"
                >
                  {t.marketingNav.openClara}
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="text-foreground hover:text-foreground/80 hidden h-9 items-center rounded-full px-4 text-sm font-medium sm:inline-flex"
                  >
                    {t.marketingNav.signIn}
                  </Link>
                  <Link
                    href="/register"
                    className="bg-foreground text-background hover:bg-foreground/90 inline-flex h-9 items-center rounded-full px-4 text-sm font-semibold shadow-sm transition-colors"
                  >
                    {t.marketingNav.signUp}
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
                  {t.marketingNav.footerTagline}
                </p>
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-semibold">{t.marketingNav.footerProductTitle}</p>
                <ul className="text-muted-foreground space-y-1.5">
                  <li>
                    <Link href={`${home}/features`} className="hover:text-foreground">
                      {t.marketingNav.footerProductLinks.features}
                    </Link>
                  </li>
                  <li>
                    <Link href={`${home}/about`} className="hover:text-foreground">
                      {t.marketingNav.footerProductLinks.about}
                    </Link>
                  </li>
                  <li>
                    <Link href={`${home}/faq`} className="hover:text-foreground">
                      {t.marketingNav.footerProductLinks.faq}
                    </Link>
                  </li>
                  <li>
                    <Link href={`${home}/changelog`} className="hover:text-foreground">
                      {t.marketingNav.footerProductLinks.changelog}
                    </Link>
                  </li>
                  <li>
                    <Link href={`${home}/privacy`} className="hover:text-foreground">
                      {t.marketingNav.footerProductLinks.privacy}
                    </Link>
                  </li>
                </ul>
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-semibold">{t.marketingNav.footerForAisTitle}</p>
                <ul className="text-muted-foreground space-y-1.5">
                  <li>
                    <Link href="/llms.txt" className="hover:text-foreground">
                      {t.marketingNav.footerForAisLinks.llms}
                    </Link>
                  </li>
                  <li>
                    <Link href="/llms-full.txt" className="hover:text-foreground">
                      {t.marketingNav.footerForAisLinks.llmsFull}
                    </Link>
                  </li>
                  <li>
                    <Link href="/api/mcp" className="hover:text-foreground">
                      {t.marketingNav.footerForAisLinks.mcpPublic}
                    </Link>
                  </li>
                  <li>
                    <Link href="/.well-known/mcp.json" className="hover:text-foreground">
                      {t.marketingNav.footerForAisLinks.mcpDescriptor}
                    </Link>
                  </li>
                  <li>
                    <Link href="/openapi.json" className="hover:text-foreground">
                      {t.marketingNav.footerForAisLinks.openapi}
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
            <div className="border-border/40 text-muted-foreground mt-10 flex flex-col items-center justify-between gap-3 border-t pt-6 text-xs sm:flex-row">
              <p>{t.marketingNav.footerCopy(new Date().getFullYear())}</p>
              <div className="flex gap-4">
                <Link
                  href={SOURCE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground"
                >
                  {t.marketingNav.github}
                </Link>
                <Link
                  href="https://trefolio.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-foreground"
                >
                  {t.marketingNav.footerHomepage}
                </Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    </LocaleProvider>
  );
}
