"use client";

import { Fingerprint, KeyRound, Trash2 } from "lucide-react";
import { useCallback, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";

type Passkey = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  deviceType: string;
  backedUp: boolean;
};

const noopSubscribe = () => () => undefined;

function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined"
  );
}

/**
 * "Mis passkeys" — lets the user enrol a fresh credential and
 * rename/delete existing ones. Initial list comes from the server
 * (see `loadSettingsData()` in `/settings/page.tsx`); we only refetch
 * after a mutation, mirroring `ApiTokensCard`.
 */
export function PasskeysCard({ initialPasskeys }: { initialPasskeys: Passkey[] }) {
  const t = useT();
  // Hydration-safe: server snapshot is `false`, client snapshot reflects
  // `window.PublicKeyCredential`. Avoids the React 19 setState-in-effect
  // lint rule the same way `TurnstileWidget` does.
  const supported = useSyncExternalStore(
    noopSubscribe,
    isWebAuthnSupported,
    () => false,
  );
  const [passkeys, setPasskeys] = useState<Passkey[]>(initialPasskeys);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const refresh = useCallback(async () => {
    const res = await fetch("/api/auth/passkey/list");
    if (!res.ok) return;
    const data = (await res.json()) as { passkeys: Passkey[] };
    setPasskeys(data.passkeys);
  }, []);

  async function onAdd() {
    setAdding(true);
    setError(null);
    try {
      const optsRes = await fetch("/api/auth/passkey/register-options", {
        method: "POST",
      });
      if (!optsRes.ok) throw new Error("options");
      const options = await optsRes.json();

      const { startRegistration } = await import("@simplewebauthn/browser");
      const credential = await startRegistration(options);

      const verifyRes = await fetch("/api/auth/passkey/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      if (!verifyRes.ok) throw new Error("verify");
      await refresh();
    } catch {
      setError(t.auth.passkeyAddError);
    } finally {
      setAdding(false);
    }
  }

  async function onDelete(id: string) {
    await fetch(`/api/auth/passkey/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    await refresh();
  }

  async function onRename(id: string) {
    const name = renameDraft.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    await fetch(`/api/auth/passkey/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setRenamingId(null);
    await refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-4" aria-hidden />
          {t.auth.passkeyTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {t.auth.passkeyDescription}
        </p>

        {!supported ? (
          <p className="text-muted-foreground text-sm">
            {t.auth.passkeyUnsupported}
          </p>
        ) : (
          <>
            <Button type="button" onClick={onAdd} disabled={adding}>
              <Fingerprint className="size-4" aria-hidden />
              {adding ? t.auth.passkeyAdding : t.auth.passkeyAdd}
            </Button>

            {error ? <p className="text-destructive text-sm">{error}</p> : null}

            {passkeys.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t.auth.passkeyEmpty}
              </p>
            ) : (
              <ul className="divide-border divide-y rounded-md border">
                {passkeys.map((pk) => {
                  const isRenaming = renamingId === pk.id;
                  return (
                    <li
                      key={pk.id}
                      className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1">
                        {isRenaming ? (
                          <form
                            className="flex items-center gap-2"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void onRename(pk.id);
                            }}
                          >
                            <Input
                              value={renameDraft}
                              autoFocus
                              maxLength={80}
                              onChange={(event) =>
                                setRenameDraft(event.target.value)
                              }
                              placeholder={t.auth.passkeyRenamePlaceholder}
                              className="h-8"
                            />
                            <Button type="submit" size="sm">
                              OK
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setRenamingId(null)}
                            >
                              ×
                            </Button>
                          </form>
                        ) : (
                          <>
                            <p className="truncate font-medium">{pk.name}</p>
                            <p className="text-muted-foreground text-xs">
                              {t.auth.passkeyAddedAt(
                                new Date(pk.createdAt).toLocaleDateString(),
                              )}
                              {" · "}
                              {pk.lastUsedAt
                                ? t.auth.passkeyLastUsed(
                                    new Date(pk.lastUsedAt).toLocaleDateString(),
                                  )
                                : t.auth.passkeyNeverUsed}
                            </p>
                          </>
                        )}
                      </div>
                      {!isRenaming ? (
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setRenameDraft(pk.name);
                              setRenamingId(pk.id);
                            }}
                          >
                            {t.auth.passkeyRename}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            aria-label={t.auth.passkeyDelete}
                            onClick={() => void onDelete(pk.id)}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
