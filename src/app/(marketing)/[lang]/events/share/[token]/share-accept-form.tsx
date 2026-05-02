"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Locale } from "@/lib/i18n/locale";

type Copy = {
  sectionGuestTitle: string;
  sectionGuestBody: string;
  sectionRegisteredTitle: string;
  sectionRegisteredBody: string;
  nameLabel: string;
  namePlaceholder: string;
  submitGuest: string;
  submitRegistered: string;
  legalNote: string;
  termsLink: string;
  privacyLink: string;
  or: string;
  signInPrompt: string;
  signInLink: string;
  errorGeneric: string;
};

type Props = {
  token: string;
  locale: Locale;
  eventId: string;
  isAuthenticated: boolean;
  copy: Copy;
};

type AcceptOk =
  | {
      mode: "guest";
      eventId: string;
      guestUserId: string;
      telegramDeepLink: string;
    }
  | {
      mode: "registered";
      eventId: string;
      alreadyJoined: boolean;
    };

/**
 * Two-branch accept form rendered below the event preview:
 *
 *  - When the visitor IS authenticated, we only show the "registered"
 *    branch (a single CTA). We don't allow logged-in users to create a
 *    second guest account by mistake.
 *  - When the visitor is anonymous, we show the guest branch (always)
 *    and a small footer pointing to /login for users who already have
 *    a Clara account.
 */
export function ShareAcceptForm({
  token,
  locale,
  eventId,
  isAuthenticated,
  copy,
}: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(mode: "guest" | "registered") {
    setError(null);
    if (mode === "guest" && displayName.trim().length === 0) {
      setError(
        locale === "en"
          ? "Tell us what to call you."
          : "Decinos cómo querés que te llamen.",
      );
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/events/share/${encodeURIComponent(token)}/accept`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "guest"
              ? {
                  mode,
                  displayName: displayName.trim(),
                  locale,
                }
              : {
                  mode,
                  // Optional override; let the API fall back to user.name.
                  ...(displayName.trim().length > 0
                    ? { displayName: displayName.trim() }
                    : {}),
                },
          ),
        },
      );
      const data = (await res.json().catch(() => null)) as
        | AcceptOk
        | { error: string }
        | null;
      if (!res.ok || !data || "error" in data) {
        setError((data && "error" in data && data.error) || copy.errorGeneric);
        setSubmitting(false);
        return;
      }
      if (data.mode === "guest") {
        // Hard navigate — tapping a t.me/... URL via router.push won't
        // open the Telegram app on mobile.
        window.location.href = data.telegramDeepLink;
        return;
      }
      router.push(`/events/${data.eventId}`);
    } catch {
      setError(copy.errorGeneric);
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-6 space-y-6">
      {!isAuthenticated && (
        <div className="border-border/60 bg-card text-card-foreground rounded-2xl border p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold">{copy.sectionGuestTitle}</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {copy.sectionGuestBody}
          </p>
          <div className="mt-5 space-y-3">
            <label
              htmlFor="display-name"
              className="text-foreground block text-sm font-medium"
            >
              {copy.nameLabel}
            </label>
            <input
              id="display-name"
              type="text"
              autoComplete="given-name"
              maxLength={80}
              placeholder={copy.namePlaceholder}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={submitting}
              className="border-border/60 bg-background block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 disabled:opacity-60"
            />
          </div>

          <p className="text-muted-foreground mt-4 text-xs leading-relaxed">
            {copy.legalNote}{" "}
            <Link
              href={`/${locale}/terms`}
              className="text-foreground underline underline-offset-2"
            >
              {copy.termsLink}
            </Link>{" "}
            ·{" "}
            <Link
              href={`/${locale}/privacy`}
              className="text-foreground underline underline-offset-2"
            >
              {copy.privacyLink}
            </Link>
            .
          </p>

          <button
            type="button"
            onClick={() => submit("guest")}
            disabled={submitting}
            className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60 mt-5 inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors"
          >
            {submitting ? "…" : copy.submitGuest}
          </button>
        </div>
      )}

      {isAuthenticated && (
        <div className="border-border/60 bg-card text-card-foreground rounded-2xl border p-6 shadow-sm sm:p-8">
          <h2 className="text-lg font-semibold">
            {copy.sectionRegisteredTitle}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {copy.sectionRegisteredBody}
          </p>
          <button
            type="button"
            onClick={() => submit("registered")}
            disabled={submitting}
            className="bg-foreground text-background hover:bg-foreground/90 disabled:opacity-60 mt-5 inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors"
          >
            {submitting ? "…" : copy.submitRegistered}
          </button>
        </div>
      )}

      {!isAuthenticated && (
        <p className="text-muted-foreground text-center text-sm">
          {copy.signInPrompt}
          <Link
            href={`/login?next=${encodeURIComponent(`/${locale}/events/share/${token}`)}`}
            className="text-foreground font-medium underline underline-offset-2"
          >
            {copy.signInLink}
          </Link>
          .
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {/* The `eventId` prop is currently unused at render time but kept
          on the type so the form can be re-used for a "Already a guest?
          Continue" branch later without breaking the API. */}
      {/* eslint-disable-next-line @typescript-eslint/no-unused-vars */}
      <span className="hidden" aria-hidden data-event-id={eventId} />
    </section>
  );
}
