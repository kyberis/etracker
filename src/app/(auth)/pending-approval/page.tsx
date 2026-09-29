import Link from "next/link";

import { getAuthSession } from "@/lib/auth";
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
  const es = locale === "es";

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>
            {es ? "Tu cuenta está en espera" : "Your account is waiting"}
          </CardTitle>
          <CardDescription>
            {session?.user?.email ? session.user.email : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            {es
              ? "Recibimos tu registro. Un administrador tiene que habilitarla antes de que puedas usar Clara. Te avisamos por email cuando esté lista."
              : "We received your signup. An administrator has to enable the account before you can use Clara. We will email you when it is ready."}
          </p>
          <Link
            href="/api/auth/signout"
            className="inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-sm"
          >
            {es ? "Salir" : "Sign out"}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
