import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { getDict } from "@/lib/i18n";
import { getLocaleFromRequest } from "@/lib/i18n/server";

export default async function NotFound() {
  const locale = await getLocaleFromRequest();
  const t = getDict(locale);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">{t.errors.notFoundTitle}</h1>
      <p className="text-muted-foreground max-w-md text-sm">{t.errors.notFoundBody}</p>
      <Link href={`/${locale}`} className={buttonVariants()}>
        {t.errors.notFoundCta}
      </Link>
    </div>
  );
}
