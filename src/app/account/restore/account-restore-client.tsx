"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { signOut } from "next-auth/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Server-resolved copy bundle. The page (a Server Component) reads the
 * dictionary, formats every string, and hands a flat record down — that
 * way this client component never imports the dictionary directly and
 * the `no-spanish-in-tsx` test passes without `LocaleProvider` plumbing.
 */
export type AccountRestoreCopy = {
  title: string;
  intro: string;
  scheduledLine: string;
  daysRemainingLine: string | null;
  graceElapsedLine: string | null;
  whatNowTitle: string;
  bulletRestore: string;
  bulletWait: string;
  bulletSignOut: string;
  restore: string;
  restoring: string;
  signOut: string;
  signingOut: string;
  restoreError: string;
  signOutCallbackUrl: string;
};

type AccountRestoreClientProps = {
  copy: AccountRestoreCopy;
};

/**
 * Restore screen rendered when a soft-deleted user signs back in. Two
 * affirmative buttons (restore / sign out) plus a quiet "do nothing" path
 * — closing the tab leaves the account in the purge queue.
 */
export function AccountRestoreClient({ copy }: AccountRestoreClientProps) {
  const [restoring, setRestoring] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onRestore() {
    setError(null);
    setRestoring(true);
    try {
      const res = await fetch("/api/account/restore", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? copy.restoreError);
        return;
      }
      // Hard navigate so the (app) layout re-evaluates the (now cleared)
      // `deletedAt` flag from a fresh DB read instead of a cached RSC tree.
      window.location.assign("/app");
    } catch {
      setError(copy.restoreError);
    } finally {
      setRestoring(false);
    }
  }

  async function onSignOut() {
    setSigningOut(true);
    await signOut({ callbackUrl: copy.signOutCallbackUrl });
  }

  return (
    <Card className="w-full border-destructive/40">
      <CardHeader>
        <CardTitle>
          <span className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" aria-hidden />
            {copy.title}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2 text-sm">
          <p>{copy.intro}</p>
          <p className="text-muted-foreground">{copy.scheduledLine}</p>
          {copy.daysRemainingLine ? (
            <p className="font-medium">{copy.daysRemainingLine}</p>
          ) : null}
          {copy.graceElapsedLine ? (
            <p className="text-destructive font-medium">
              {copy.graceElapsedLine}
            </p>
          ) : null}
        </div>

        <div className="space-y-2 text-sm">
          <p className="font-medium">{copy.whatNowTitle}</p>
          <ul className="text-muted-foreground list-disc space-y-1 pl-5">
            <li>{copy.bulletRestore}</li>
            <li>{copy.bulletWait}</li>
            <li>{copy.bulletSignOut}</li>
          </ul>
        </div>

        {error ? <p className="text-destructive text-sm">{error}</p> : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            onClick={onRestore}
            disabled={restoring || signingOut}
          >
            <RotateCcw className="size-4" aria-hidden />
            {restoring ? copy.restoring : copy.restore}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onSignOut}
            disabled={restoring || signingOut}
          >
            {signingOut ? copy.signingOut : copy.signOut}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
