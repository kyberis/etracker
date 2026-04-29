import Link from "next/link";

import { Logo } from "@/components/logo";
import { LocaleProvider } from "@/lib/i18n/client";
import { getLocaleFromRequest } from "@/lib/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocaleFromRequest();
  return (
    <LocaleProvider locale={locale}>
      <main className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <Link
          href={`/${locale}`}
          className="focus-visible:ring-ring focus-visible:ring-offset-background mb-8 rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-label="Clara"
        >
          <Logo size="lg" />
        </Link>
        <div className="w-full max-w-md">{children}</div>
      </main>
    </LocaleProvider>
  );
}
