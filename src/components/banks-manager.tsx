"use client";

import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/client";

type Bank = {
  id: string;
  name: string;
  color: string | null;
};

type BanksManagerProps = {
  initialBanks: Bank[];
};

export function BanksManager({ initialBanks }: BanksManagerProps) {
  const t = useT();
  const [banks, setBanks] = useState<Bank[]>(initialBanks);
  const [name, setName] = useState("");
  const [color, setColor] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function loadBanks() {
    const response = await fetch("/api/banks");
    const data = (await response.json()) as { banks: Bank[] };
    setBanks(data.banks ?? []);
  }

  async function createBank(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/banks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? t.banks.saveError);
      return;
    }

    setName("");
    setColor("");
    await loadBanks();
  }

  async function editBank(bank: Bank) {
    const newName = window.prompt(t.banks.nameLabel, bank.name);
    if (!newName) return;
    const newColor = window.prompt(t.banks.colorHint, bank.color ?? "") ?? "";

    const response = await fetch(`/api/banks/${bank.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, color: newColor }),
    });

    if (response.ok) {
      await loadBanks();
    }
  }

  async function removeBank(bank: Bank) {
    const confirmed = window.confirm(t.banks.deleteConfirm(bank.name));
    if (!confirmed) return;

    const response = await fetch(`/api/banks/${bank.id}`, { method: "DELETE" });
    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? t.banks.deleteError);
      return;
    }
    await loadBanks();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t.banks.addBank}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-3" onSubmit={createBank}>
            <Input
              placeholder={t.banks.namePlaceholder}
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
            <Input
              placeholder="#AABBCC"
              value={color}
              onChange={(event) => setColor(event.target.value)}
            />
            <Button type="submit">{t.banks.save}</Button>
          </form>
          {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t.banks.pageTitle}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {banks.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t.banks.empty}</p>
          ) : (
            banks.map((bank) => (
              <div
                key={bank.id}
                className="flex items-center justify-between rounded-md border p-3"
              >
                <div className="flex items-center gap-2">
                  {bank.color ? (
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: bank.color }}
                    />
                  ) : null}
                  <span>{bank.name}</span>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => editBank(bank)}>
                    {t.banks.edit}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => removeBank(bank)}>
                    {t.banks.delete}
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
