import { redirect } from "next/navigation";

import { db } from "@/lib/db";
import { CURRENT_TERMS_VERSION, hasCurrentConsent } from "@/lib/legal";
import { requireUserId } from "@/lib/session";

import { AcceptTermsForm } from "./form";

type PageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

/**
 * Re-acceptance gate for users who lack `acceptedTermsAt` (Google sign-in
 * first time, legacy accounts) or whose `acceptedTermsVersion` no longer
 * matches `CURRENT_TERMS_VERSION` (we bumped the legal docs).
 *
 * The `?next` query param controls where to bounce after acceptance. It must
 * start with a `/` and not contain `://`, otherwise we fall back to `/app` —
 * a defensive measure against open-redirect oracle attempts.
 */
export default async function AcceptTermsPage({ searchParams }: PageProps) {
  const userId = await requireUserId();
  const params = await searchParams;
  const rawNext = Array.isArray(params.next) ? params.next[0] : params.next;
  const next = sanitiseNext(rawNext);

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { acceptedTermsAt: true, acceptedTermsVersion: true },
  });

  // Already on the current version — bounce straight to the next destination.
  if (user && hasCurrentConsent(user.acceptedTermsAt, user.acceptedTermsVersion)) {
    redirect(next);
  }

  return (
    <AcceptTermsForm
      currentVersion={CURRENT_TERMS_VERSION}
      next={next}
      previousVersion={user?.acceptedTermsVersion ?? null}
    />
  );
}

function sanitiseNext(value: string | undefined): string {
  if (!value) return "/app";
  if (!value.startsWith("/")) return "/app";
  if (value.startsWith("//")) return "/app";
  if (value.includes("://")) return "/app";
  return value;
}
