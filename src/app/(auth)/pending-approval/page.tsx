import Link from "next/link";

import { getAuthSession } from "@/lib/auth";
import { getDict } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function PendingApprovalPage() {
  const [session, locale] = await Promise.all([getAuthSession(), getLocale()]);
  const t = getDict(locale).auth;

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{t.pendingApprovalTitle}</CardTitle>
          <CardDescription>
            {session?.user?.email ? session.user.email : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>{t.pendingApprovalBody}</p>
          <Link
            href="/api/auth/signout"
            className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-sm"
          >
            {t.pendingApprovalSignOut}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
